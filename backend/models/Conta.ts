/**
 * Direitos do titular (LGPD, art. 18) e retenção de dados de hóspedes.
 *
 * - Exportar: o usuário baixa o que o sistema guarda sobre ELE.
 * - Excluir conta: anonimiza o usuário (reservas e auditoria referenciam o
 *   id, então a linha fica, sem nome, e-mail, senha nem sessões).
 * - Excluir pousada: só o dono. Apaga hóspedes, reservas, auditoria,
 *   convites e vínculos; a linha da pousada fica anonimizada porque
 *   assinatura e financeiro do SaaS são registro contábil.
 * - Retenção: a pousada escolhe em quantos meses após a saída os dados do
 *   hóspede são anonimizados (nome, CPF, observações). Valores e datas
 *   ficam para os relatórios.
 */
import { pool } from '../db/index.js';
import { temAssinaturaViva } from '../utils/assinatura.js';

/** Valor gravado na coluna `cpf` (NOT NULL) quando o hóspede é anonimizado. */
export const CPF_ANONIMIZADO = 'anonimizado';
export const NOME_ANONIMIZADO = 'Hóspede anonimizado';

/** Recusa com mensagem para a tela (a rota responde 409). */
export class ExclusaoRecusada extends Error {
  constructor(mensagem: string, readonly detalhes: Record<string, unknown> = {}) {
    super(mensagem);
    this.name = 'ExclusaoRecusada';
  }
}

export async function exportarDadosDoUsuario(userId: string) {
  const [usuario, vinculos, sessoes, contas, acoes] = await Promise.all([
    pool.query(`SELECT id, name, email, email_verified, image, created_at, updated_at FROM "user" WHERE id = $1`, [userId]),
    pool.query(
      `SELECT p.id AS pousada_id, p.nome AS pousada, up.role AS papel, up.is_owner AS proprietario, up.joined_at AS desde
         FROM user_pousadas up JOIN pousadas p ON p.id = up.pousada_id WHERE up.user_id = $1`,
      [userId],
    ),
    pool.query(`SELECT created_at, expires_at, ip_address, user_agent FROM session WHERE user_id = $1 ORDER BY created_at DESC`, [userId]),
    pool.query(`SELECT provider_id, created_at FROM account WHERE user_id = $1`, [userId]),
    // Só o que a PESSOA fez: ação, alvo e quando. `details` fica de fora porque
    // contém dados de terceiros (os hóspedes da pousada).
    pool.query(
      `SELECT action AS acao, entity AS entidade, entity_id AS id_entidade, ip, created_at AS em
         FROM auditoria WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5000`,
      [userId],
    ),
  ]);
  return {
    geradoEm: new Date().toISOString(),
    usuario: usuario.rows[0] ?? null,
    vinculos: vinculos.rows,
    formasDeLogin: contas.rows,
    sessoes: sessoes.rows,
    acoesRegistradas: acoes.rows,
    observacao:
      'Dados de hóspedes pertencem às pousadas (controladoras) e são exportados pela própria pousada em Reservas > Exportar.',
  };
}

export async function excluirConta(userId: string): Promise<void> {
  const { rows: donas } = await pool.query<{ id: number; nome: string }>(
    `SELECT p.id, p.nome FROM user_pousadas up JOIN pousadas p ON p.id = up.pousada_id
      WHERE up.user_id = $1 AND up.is_owner = true AND p.excluida_em IS NULL`,
    [userId],
  );
  if (donas.length > 0) {
    throw new ExclusaoRecusada(
      `Você é proprietário de: ${donas.map((d) => d.nome).join(', ')}. Exclua essas pousadas antes de excluir a conta.`,
      { pousadas: donas },
    );
  }

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query(`DELETE FROM session WHERE user_id = $1`, [userId]);
    await cliente.query(`DELETE FROM account WHERE user_id = $1`, [userId]);
    await cliente.query(`DELETE FROM user_pousadas WHERE user_id = $1`, [userId]);
    await cliente.query(`DELETE FROM verification WHERE identifier LIKE '%' || (SELECT email FROM "user" WHERE id = $1) || '%'`, [userId]);
    await cliente.query(
      `UPDATE "user"
          SET name = 'Usuário removido',
              email = 'removido+' || id || '@diaria.invalid',
              email_verified = false,
              image = NULL,
              pousada_id = NULL,
              is_owner = false,
              role = 'recepcao',
              updated_at = now()
        WHERE id = $1`,
      [userId],
    );
    await cliente.query(
      `INSERT INTO auditoria (user_id, action, entity, entity_id, details) VALUES ($1, 'conta_excluida', 'usuario', NULL, NULL)`,
      [userId],
    );
    await cliente.query('COMMIT');
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

export async function excluirPousada(pousadaId: number, confirmacaoNome: string): Promise<void> {
  const { rows } = await pool.query(
    `SELECT p.nome, p.excluida_em, a.status, a.stripe_subscription_id,
            (SELECT count(*)::int FROM assinaturas c WHERE c.coberta_por_pousada_id = p.id) AS cobertas
       FROM pousadas p LEFT JOIN assinaturas a ON a.pousada_id = p.id
      WHERE p.id = $1`,
    [pousadaId],
  );
  const p = rows[0];
  if (!p || p.excluida_em) throw new ExclusaoRecusada('Pousada não encontrada.');
  if (confirmacaoNome.trim() !== p.nome) {
    throw new ExclusaoRecusada('Para confirmar, digite o nome da pousada exatamente como está cadastrado.');
  }
  if (p.status && temAssinaturaViva({ status: p.status, stripeSubscriptionId: p.stripe_subscription_id })) {
    throw new ExclusaoRecusada('Cancele a assinatura em Assinatura > Gerenciar antes de excluir a pousada.');
  }
  if (p.cobertas > 0) {
    throw new ExclusaoRecusada('Esta pousada paga o plano Rede de outras pousadas suas. Exclua aquelas primeiro.');
  }

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    // Auditoria ligada às reservas, convites e à própria pousada.
    await cliente.query(
      `DELETE FROM auditoria
        WHERE (entity = 'reserva' AND entity_id IN (SELECT id FROM reservas WHERE pousada_id = $1))
           OR (entity = 'staff_invite' AND entity_id IN (SELECT id FROM staff_invites WHERE pousada_id = $1))
           OR (entity IN ('pousada', 'user_pousada') AND entity_id = $1)`,
      [pousadaId],
    );
    await cliente.query(`DELETE FROM reservas WHERE pousada_id = $1`, [pousadaId]);
    await cliente.query(`DELETE FROM staff_invites WHERE pousada_id = $1`, [pousadaId]);
    await cliente.query(`DELETE FROM user_pousadas WHERE pousada_id = $1`, [pousadaId]);
    // Quem tinha esta pousada como padrão passa a não ter nenhuma (o app manda
    // para o onboarding ou para outra pousada da pessoa).
    await cliente.query(
      `UPDATE "user" SET pousada_id = NULL, is_owner = false, role = 'recepcao', updated_at = now() WHERE pousada_id = $1`,
      [pousadaId],
    );
    await cliente.query(
      `UPDATE pousadas
          SET nome = 'Pousada excluída #' || id, slug = 'excluida-' || id, endereco = NULL, cidade = NULL,
              estado = NULL, cep = NULL, telefone = NULL, email = NULL, logo_url = NULL, descricao = NULL,
              configuracoes = '{}'::jsonb, ativa = false, excluida_em = now(), updated_at = now()
        WHERE id = $1`,
      [pousadaId],
    );
    await cliente.query('COMMIT');
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

/**
 * Anonimiza hóspedes de estadias encerradas há mais de N meses, conforme a
 * configuração de cada pousada (`configuracoes.retencao_hospedes_meses`).
 * Pousada sem configuração não é tocada. Devolve quantas reservas mudaram.
 */
export async function anonimizarHospedesAntigos(): Promise<number> {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query<{ id: number }>(
      `UPDATE reservas r
          SET nome = $1, cpf = $2, cpf_hash = NULL, observacoes = NULL, updated_at = now()
         FROM pousadas p
        WHERE p.id = r.pousada_id
          AND (p.configuracoes->>'retencao_hospedes_meses') ~ '^[0-9]+$'
          AND (p.configuracoes->>'retencao_hospedes_meses')::int > 0
          AND r.data_saida < (current_date - make_interval(months => (p.configuracoes->>'retencao_hospedes_meses')::int))
          AND r.cpf <> $2
      RETURNING r.id`,
      [NOME_ANONIMIZADO, CPF_ANONIMIZADO],
    );
    if (rows.length > 0) {
      // O histórico de alterações guardava nome e observações em `details`.
      await cliente.query(
        `UPDATE auditoria SET details = '{"anonimizado":true}'::jsonb
          WHERE entity = 'reserva' AND entity_id = ANY($1::int[])`,
        [rows.map((r) => r.id)],
      );
    }
    await cliente.query('COMMIT');
    return rows.length;
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}
