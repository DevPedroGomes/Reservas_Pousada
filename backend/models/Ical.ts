/**
 * Calendários iCal por quarto (migration 021): exportar para a OTA e
 * importar dela, transformando os eventos em reservas do quarto.
 */
import { randomBytes } from 'node:crypto';
import { pool } from '../db/index.js';
import { buscarIcal, feedCompleto, gerarIcal, IcalRecusado, lerIcal, MENSAGEM_FEED_INCOMPLETO, mensagemDeFalha, type EventoIcal } from '../lib/ical.js';
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
  /** Reservas cujo evento faltou nesta leitura, ainda sem cancelar. */
  ausentes: number;
  conflitos: string[];
  aviso: string | null;
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
  // Pré-reserva de canal público fica de fora até confirmar: um
  // formulário público não pode fechar a venda da pousada em todas as OTAs.
  const { rows } = await pool.query(
    `SELECT id, data_entrada::text AS inicio, data_saida::text AS fim
       FROM reservas
      WHERE pousada_id = $1 AND quarto = $2 AND deleted_at IS NULL
        AND status IN ('pre_reserva', 'confirmada', 'hospedada')
        AND NOT (status = 'pre_reserva' AND canal IN ('site', 'whatsapp'))
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
 * O evento é data fechada na OTA, não hóspede? O Booking publica reserva e data
 * fechada com o mesmo "CLOSED - Not available": lá fica como venda sem valor.
 */
function ehBloqueio(resumo: string, canal: string): boolean {
  return canal !== 'booking' && /not available|unavailable|indispon|blocked|bloquead/i.test(resumo);
}

/**
 * UID repetido derrubaria a sincronização inteira no índice único. Evento igual
 * conta uma vez; mesmo UID com outras datas ganha chave própria, porque deixar
 * cair seria abrir para venda uma data que a OTA diz estar ocupada.
 */
function semUidRepetido(eventos: EventoIcal[]): EventoIcal[] {
  const uids = new Set<string>();
  const iguais = new Set<string>();
  const saida: EventoIcal[] = [];
  for (const e of eventos) {
    const igual = `${e.uid}|${e.inicio}|${e.fim}`;
    if (iguais.has(igual)) continue;
    iguais.add(igual);
    saida.push(uids.has(e.uid) ? { ...e, uid: `${e.uid.slice(0, 240)}#${e.inicio}` } : e);
    uids.add(e.uid);
  }
  return saida;
}

/**
 * Sincronizações seguidas sem o evento até cancelar a reserva. Antes bastava
 * uma: um feed ruim cancelava tudo e a data ia para venda de novo.
 */
export const SINCRONIZACOES_ATE_CANCELAR = 3;

/**
 * Sincroniza um calendário: evento novo vira reserva confirmada; datas
 * mudadas na OTA mudam aqui; evento que some (cancelado lá) cancela aqui
 * depois de SINCRONIZACOES_ATE_CANCELAR leituras seguidas — só o que ainda
 * não passou, porque OTA tira do feed estadia antiga. Feed cortado é falha e
 * feed sem eventos não prova nada: nenhum dos dois cancela, e fica o aviso.
 * Choque com reserva do próprio sistema não é gravado: vira aviso de
 * overbooking para a recepção resolver.
 */
export async function sincronizarImportacao(
  imp: Importacao,
  buscar: (url: string) => Promise<string> = buscarIcal,
): Promise<ResumoSincronizacao> {
  const resumo: ResumoSincronizacao = { eventos: 0, criadas: 0, atualizadas: 0, canceladas: 0, ausentes: 0, conflitos: [], aviso: null };
  try {
    const hoje = hojeLocal();
    await pool.query(`UPDATE ical_importacoes SET ultima_tentativa = now() WHERE id = $1`, [imp.id]);
    const conteudo = await buscar(imp.url);
    if (!feedCompleto(conteudo)) throw new IcalRecusado(MENSAGEM_FEED_INCOMPLETO);
    const lidos = lerIcal(conteudo);
    if (lidos.length === 0) {
      resumo.aviso = 'O calendário veio sem nenhum evento; nenhuma reserva foi cancelada. Confira o link se as reservas continuam na OTA.';
      await pool.query(
        `UPDATE ical_importacoes SET ultima_sincronizacao = now(), ultimo_erro = $2, eventos = 0 WHERE id = $1`,
        [imp.id, resumo.aviso],
      );
      return resumo;
    }
    const eventos = semUidRepetido(lidos).filter((e) => e.fim >= hoje);
    resumo.eventos = eventos.length;
    const { rows: reservasDoFeed } = await pool.query(
      `SELECT id, ical_uid, data_entrada::text AS inicio, data_saida::text AS fim, status, ical_ausencias, cancelada_manualmente, deleted_at
         FROM reservas WHERE ical_importacao_id = $1`,
      [imp.id],
    );
    const existentes = reservasDoFeed.filter((r) => !r.deleted_at);
    const excluidas = new Set(reservasDoFeed.filter((r) => r.deleted_at).map((r) => r.ical_uid as string));
    const porUid = new Map(existentes.map((r) => [r.ical_uid as string, r]));
    const vistos = new Set<string>();
    const decididasAMao: string[] = [];

    for (const e of eventos as EventoIcal[]) {
      vistos.add(e.uid);
      const atual = porUid.get(e.uid);
      // Cancelada ou excluída à mão: o feed não desfaz, só avisa.
      if (atual ? atual.status === 'cancelada' && atual.cancelada_manualmente : excluidas.has(e.uid)) {
        decididasAMao.push(`${br(e.inicio)} a ${br(e.fim)}`);
        continue;
      }
      try {
        if (!atual) {
          await pool.query(
            `INSERT INTO reservas (pousada_id, nome, quarto, data_entrada, data_saida, status, canal, ical_importacao_id, ical_uid, observacoes, ical_bloqueio)
             VALUES ($1, $2, $3, $4, $5, 'confirmada', $6, $7, $8, $9, $10)`,
            [imp.pousada_id, `${imp.nome} · ${e.resumo || 'Reservado'}`.slice(0, 100), imp.quarto_numero, e.inicio, e.fim,
              imp.canal, imp.id, e.uid, `Importada do calendário ${imp.nome}.`, ehBloqueio(e.resumo, imp.canal)],
          );
          resumo.criadas++;
        } else if (atual.status === 'cancelada' || atual.inicio !== e.inicio || atual.fim !== e.fim) {
          // Cancelada por ter sumido e de volta no feed, ou datas mudadas na OTA.
          await pool.query(
            `UPDATE reservas SET data_entrada = $2, data_saida = $3,
                    status = CASE WHEN status = 'cancelada' THEN 'confirmada' ELSE status END,
                    cancelada_em = CASE WHEN status = 'cancelada' THEN NULL ELSE cancelada_em END,
                    motivo_cancelamento = CASE WHEN status = 'cancelada' THEN NULL ELSE motivo_cancelamento END,
                    ical_ausencias = 0, version = version + 1, updated_at = now()
              WHERE id = $1 AND status IN ('cancelada', 'pre_reserva', 'confirmada', 'hospedada')`,
            [atual.id, e.inicio, e.fim],
          );
          resumo.atualizadas++;
        } else if (atual.ical_ausencias > 0) {
          await pool.query(`UPDATE reservas SET ical_ausencias = 0 WHERE id = $1`, [atual.id]);
        }
      } catch (err) {
        if (!ehConflito(err)) throw err;
        resumo.conflitos.push(`${br(e.inicio)} a ${br(e.fim)}`);
      }
    }

    for (const r of existentes) {
      if (vistos.has(r.ical_uid) || !['pre_reserva', 'confirmada'].includes(r.status) || r.fim < hoje) continue;
      const ausencias = r.ical_ausencias + 1;
      if (ausencias < SINCRONIZACOES_ATE_CANCELAR) {
        await pool.query(`UPDATE reservas SET ical_ausencias = $2 WHERE id = $1`, [r.id, ausencias]);
        resumo.ausentes++;
        continue;
      }
      await pool.query(
        `UPDATE reservas SET status = 'cancelada', cancelada_em = now(), motivo_cancelamento = $2, ical_ausencias = 0,
                version = version + 1, updated_at = now()
          WHERE id = $1`,
        [r.id, `Cancelada no calendário ${imp.nome}`],
      );
      resumo.canceladas++;
    }

    const avisos: string[] = [];
    if (resumo.conflitos.length) avisos.push(`Possível overbooking: ${resumo.conflitos.join(', ')} já ocupado(s) por reserva do sistema.`);
    if (decididasAMao.length) avisos.push(`A OTA ainda mostra ${decididasAMao.join(', ')}, mas a reserva foi cancelada ou excluída à mão aqui. Confira na OTA.`);
    if (resumo.ausentes) avisos.push(`${resumo.ausentes} reserva(s) sumiram do calendário; se continuarem fora por ${SINCRONIZACOES_ATE_CANCELAR} sincronizações seguidas, serão canceladas.`);
    resumo.aviso = avisos.join(' ') || null;
    await pool.query(
      `UPDATE ical_importacoes SET ultima_sincronizacao = now(), ultimo_erro = $2, eventos = $3 WHERE id = $1`,
      [imp.id, resumo.aviso, resumo.eventos],
    );
    return resumo;
  } catch (err) {
    // O detalhe técnico fica no log; o aviso vai para a tela da pousada.
    if (!(err instanceof IcalRecusado)) console.error(`[iCal] calendário ${imp.id}:`, err instanceof Error ? err.message : err);
    await pool.query(`UPDATE ical_importacoes SET ultima_sincronizacao = now(), ultimo_erro = $2 WHERE id = $1`, [imp.id, mensagemDeFalha(err)]);
    throw err;
  }
}

/** Feeds buscados ao mesmo tempo: cada um pode levar até o prazo da busca. */
export const CONCORRENCIA_SINCRONIZACAO = 5;

/** Teto por pousada, para uma só não ocupar a rodada de todas. */
export const MAX_CALENDARIOS_POR_POUSADA = 60;

/**
 * Job: todos os calendários ativos de pousadas que existem, os que tentaram há
 * mais tempo primeiro. Feed lento ocupa uma vaga, não a rodada inteira.
 */
export async function sincronizarTodas(
  buscar: (url: string) => Promise<string> = buscarIcal,
): Promise<{ calendarios: number; falhas: number }> {
  const { rows } = await pool.query<Importacao>(
    `SELECT id, pousada_id, quarto_numero, nome, canal, url FROM (
       SELECT i.*, row_number() OVER (PARTITION BY i.pousada_id ORDER BY i.id) AS posicao
         FROM ical_importacoes i JOIN pousadas p ON p.id = i.pousada_id
        WHERE i.ativo AND p.excluida_em IS NULL
     ) t
     WHERE posicao <= $1 ORDER BY ultima_tentativa NULLS FIRST LIMIT 500`,
    [MAX_CALENDARIOS_POR_POUSADA],
  );
  let falhas = 0;
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < rows.length) {
      await sincronizarImportacao(rows[proximo++], buscar).catch(() => { falhas++; });
    }
  };
  await Promise.all(Array.from({ length: CONCORRENCIA_SINCRONIZACAO }, trabalhador));
  return { calendarios: rows.length, falhas };
}

/** A pousada já chegou ao teto de calendários? */
export async function atingiuLimiteDeCalendarios(pousadaId: number): Promise<boolean> {
  const { rows: [c] } = await pool.query(`SELECT count(*)::int AS n FROM ical_importacoes WHERE pousada_id = $1`, [pousadaId]);
  return c.n >= MAX_CALENDARIOS_POR_POUSADA;
}

export async function buscarImportacao(pousadaId: number, id: number): Promise<Importacao | null> {
  const { rows } = await pool.query(
    `SELECT id, pousada_id, quarto_numero, nome, canal, url FROM ical_importacoes WHERE id = $1 AND pousada_id = $2`,
    [id, pousadaId],
  );
  return rows[0] ?? null;
}
