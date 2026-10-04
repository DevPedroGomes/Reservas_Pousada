/**
 * Calendários iCal por quarto (migration 021): exportar para a OTA e
 * importar dela, transformando os eventos em reservas do quarto.
 */
import { randomBytes } from 'node:crypto';
import { pool } from '../db/index.js';
import { buscarIcal, gerarIcal, lerIcal, type EventoIcal } from '../lib/ical.js';
import { hojeLocal } from '../utils/datas.js';

const PG_EXCLUSION_VIOLATION = '23P01';

export interface Importacao {
  id: number;
  pousada_id: number;
  quarto_numero: number;
  nome: string;
  canal: string;
  url: string;
}

export interface ResumoSincronizacao {
  eventos: number;
  criadas: number;
  atualizadas: number;
  canceladas: number;
  conflitos: string[];
}

/** Calendário exportado de um quarto pelo token do link (null se não existe). */
export async function calendarioExportado(token: string, dominio?: string): Promise<string | null> {
  if (!/^[0-9a-f]{32,128}$/.test(token)) return null;
  const { rows: [q] } = await pool.query(
    `SELECT q.pousada_id, q.numero, q.nome, p.nome AS pousada
       FROM quartos q JOIN pousadas p ON p.id = q.pousada_id
      WHERE q.ical_token = $1 AND p.excluida_em IS NULL`,
    [token],
  );
  if (!q) return null;
  // Do mês passado em diante: a OTA só precisa do que ainda bloqueia data.
  const { rows } = await pool.query(
    `SELECT id, data_entrada::text AS inicio, data_saida::text AS fim
       FROM reservas
      WHERE pousada_id = $1 AND quarto = $2 AND deleted_at IS NULL
        AND status IN ('pre_reserva', 'confirmada', 'hospedada')
        AND data_saida >= (current_date - 30)
      ORDER BY data_entrada`,
    [q.pousada_id, q.numero],
  );
  return gerarIcal(`${q.pousada} — ${q.nome}`, rows, dominio);
}

export async function listarCalendarios(pousadaId: number) {
  const [quartos, importacoes] = await Promise.all([
    pool.query(`SELECT numero, nome, ical_token FROM quartos WHERE pousada_id = $1 AND ativo ORDER BY ordem, numero`, [pousadaId]),
    pool.query(
      `SELECT id, quarto_numero, nome, canal, url, ativo, ultima_sincronizacao, ultimo_erro, eventos
         FROM ical_importacoes WHERE pousada_id = $1 ORDER BY quarto_numero, id`,
      [pousadaId],
    ),
  ]);
  return { quartos: quartos.rows, importacoes: importacoes.rows };
}

export async function novoLinkDoQuarto(pousadaId: number, numero: number): Promise<string | null> {
  const { rows } = await pool.query(
    `UPDATE quartos SET ical_token = $3, updated_at = now() WHERE pousada_id = $1 AND numero = $2 RETURNING ical_token`,
    [pousadaId, numero, randomBytes(32).toString('hex')],
  );
  return rows[0]?.ical_token ?? null;
}

export async function criarImportacao(pousadaId: number, d: { quarto: number; nome: string; canal: string; url: string }): Promise<Importacao> {
  const { rows } = await pool.query(
    `INSERT INTO ical_importacoes (pousada_id, quarto_numero, nome, canal, url) VALUES ($1, $2, $3, $4, $5)
     RETURNING id, pousada_id, quarto_numero, nome, canal, url`,
    [pousadaId, d.quarto, d.nome, d.canal, d.url],
  );
  return rows[0];
}

/** Remove o calendário; as reservas futuras que vieram dele são canceladas. */
export async function removerImportacao(pousadaId: number, id: number): Promise<boolean> {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows: [imp] } = await cliente.query(`SELECT nome FROM ical_importacoes WHERE id = $1 AND pousada_id = $2`, [id, pousadaId]);
    if (!imp) { await cliente.query('ROLLBACK'); return false; }
    await cliente.query(
      `UPDATE reservas SET status = 'cancelada', cancelada_em = now(), motivo_cancelamento = $3, updated_at = now()
        WHERE ical_importacao_id = $1 AND pousada_id = $2 AND deleted_at IS NULL
          AND status IN ('pre_reserva', 'confirmada') AND data_saida >= current_date`,
      [id, pousadaId, `Calendário ${imp.nome} removido`],
    );
    await cliente.query(`DELETE FROM ical_importacoes WHERE id = $1 AND pousada_id = $2`, [id, pousadaId]);
    await cliente.query('COMMIT');
    return true;
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

function ehConflito(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === PG_EXCLUSION_VIOLATION || e?.cause?.code === PG_EXCLUSION_VIOLATION;
}

const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/**
 * Sincroniza um calendário: evento novo vira reserva confirmada; datas
 * mudadas na OTA mudam aqui; evento que sumiu (cancelado lá) cancela aqui
 * — só o que ainda não passou, porque OTA tira do feed estadia antiga.
 * Choque com reserva do próprio sistema não é gravado: vira aviso de
 * overbooking para a recepção resolver.
 */
export async function sincronizarImportacao(
  imp: Importacao,
  buscar: (url: string) => Promise<string> = buscarIcal,
): Promise<ResumoSincronizacao> {
  const resumo: ResumoSincronizacao = { eventos: 0, criadas: 0, atualizadas: 0, canceladas: 0, conflitos: [] };
  try {
    const hoje = hojeLocal();
    const eventos = lerIcal(await buscar(imp.url)).filter((e) => e.fim >= hoje);
    resumo.eventos = eventos.length;
    const { rows: existentes } = await pool.query(
      `SELECT id, ical_uid, data_entrada::text AS inicio, data_saida::text AS fim, status
         FROM reservas WHERE ical_importacao_id = $1 AND deleted_at IS NULL`,
      [imp.id],
    );
    const porUid = new Map(existentes.map((r) => [r.ical_uid as string, r]));
    const vistos = new Set<string>();

    for (const e of eventos as EventoIcal[]) {
      vistos.add(e.uid);
      const atual = porUid.get(e.uid);
      try {
        if (!atual) {
          await pool.query(
            `INSERT INTO reservas (pousada_id, nome, quarto, data_entrada, data_saida, status, canal, ical_importacao_id, ical_uid, observacoes)
             VALUES ($1, $2, $3, $4, $5, 'confirmada', $6, $7, $8, $9)`,
            [imp.pousada_id, `${imp.nome} · ${e.resumo || 'Reservado'}`.slice(0, 100), imp.quarto_numero, e.inicio, e.fim,
              imp.canal, imp.id, e.uid, `Importada do calendário ${imp.nome}.`],
          );
          resumo.criadas++;
        } else if (atual.status === 'cancelada' || atual.inicio !== e.inicio || atual.fim !== e.fim) {
          // Cancelada por ter sumido e de volta no feed, ou datas mudadas na OTA.
          await pool.query(
            `UPDATE reservas SET data_entrada = $2, data_saida = $3,
                    status = CASE WHEN status = 'cancelada' THEN 'confirmada' ELSE status END,
                    cancelada_em = CASE WHEN status = 'cancelada' THEN NULL ELSE cancelada_em END,
                    motivo_cancelamento = CASE WHEN status = 'cancelada' THEN NULL ELSE motivo_cancelamento END,
                    version = version + 1, updated_at = now()
              WHERE id = $1 AND status IN ('cancelada', 'pre_reserva', 'confirmada', 'hospedada')`,
            [atual.id, e.inicio, e.fim],
          );
          resumo.atualizadas++;
        }
      } catch (err) {
        if (!ehConflito(err)) throw err;
        resumo.conflitos.push(`${br(e.inicio)} a ${br(e.fim)}`);
      }
    }

    for (const r of existentes) {
      if (vistos.has(r.ical_uid) || !['pre_reserva', 'confirmada'].includes(r.status) || r.fim < hoje) continue;
      await pool.query(
        `UPDATE reservas SET status = 'cancelada', cancelada_em = now(), motivo_cancelamento = $2, version = version + 1, updated_at = now()
          WHERE id = $1`,
        [r.id, `Cancelada no calendário ${imp.nome}`],
      );
      resumo.canceladas++;
    }

    const aviso = resumo.conflitos.length
      ? `Possível overbooking: ${resumo.conflitos.join(', ')} já ocupado(s) por reserva do sistema.`
      : null;
    await pool.query(
      `UPDATE ical_importacoes SET ultima_sincronizacao = now(), ultimo_erro = $2, eventos = $3 WHERE id = $1`,
      [imp.id, aviso, resumo.eventos],
    );
    return resumo;
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err);
    await pool.query(`UPDATE ical_importacoes SET ultima_sincronizacao = now(), ultimo_erro = $2 WHERE id = $1`, [imp.id, mensagem.slice(0, 300)]);
    throw err;
  }
}

/** Job: todos os calendários ativos de pousadas que existem. */
export async function sincronizarTodas(): Promise<{ calendarios: number; falhas: number }> {
  const { rows } = await pool.query<Importacao>(
    `SELECT i.id, i.pousada_id, i.quarto_numero, i.nome, i.canal, i.url
       FROM ical_importacoes i JOIN pousadas p ON p.id = i.pousada_id
      WHERE i.ativo AND p.excluida_em IS NULL ORDER BY i.ultima_sincronizacao NULLS FIRST LIMIT 500`,
  );
  let falhas = 0;
  for (const imp of rows) {
    await sincronizarImportacao(imp).catch(() => { falhas++; });
  }
  return { calendarios: rows.length, falhas };
}

export async function buscarImportacao(pousadaId: number, id: number): Promise<Importacao | null> {
  const { rows } = await pool.query(
    `SELECT id, pousada_id, quarto_numero, nome, canal, url FROM ical_importacoes WHERE id = $1 AND pousada_id = $2`,
    [id, pousadaId],
  );
  return rows[0] ?? null;
}
