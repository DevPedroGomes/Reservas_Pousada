/**
 * Relatórios da pousada num período [inicio, fim] (noites, datas inclusivas).
 *
 * Conta só negócio fechado: confirmada, hospedada e finalizada. Pré-reserva
 * ainda pode cair e cancelada/no-show não ocuparam o quarto.
 *
 * - Receita de hospedagem por competência: cada noite vale valor/noites da
 *   reserva; entra a noite que cai no período (estadia que atravessa o mês
 *   divide a receita entre os meses).
 * - Ocupação = noites vendidas / (quartos ativos × dias).
 * - ADR (diária média) = receita / noites vendidas. RevPAR = receita /
 *   noites disponíveis.
 * - Recebido: o que entrou no caixa no período (pagamentos pela data), por forma.
 * - A receber: saldo atual das reservas em aberto (não depende do período).
 */
import { pool } from '../db/index.js';

const STATUS = `('confirmada', 'hospedada', 'finalizada')`;

export async function relatorio(pousadaId: number, inicio: string, fim: string) {
  const params = [pousadaId, inicio, fim];
  const noites = `
    WITH dias AS (SELECT d::date AS dia FROM generate_series($2::date, $3::date, interval '1 day') d),
    r AS (
      SELECT id, canal, quarto, valor, data_entrada, data_saida, GREATEST(data_saida - data_entrada, 1) AS total_noites
        FROM reservas
       WHERE pousada_id = $1 AND deleted_at IS NULL AND status IN ${STATUS}
         AND data_entrada <= $3::date AND data_saida > $2::date
    ),
    noites AS (
      SELECT r.id, r.canal, r.quarto, d.dia, COALESCE(r.valor, 0) / r.total_noites AS diaria
        FROM r JOIN dias d ON d.dia >= r.data_entrada AND d.dia < r.data_saida
    )`;

  const [quartos, totais, porCanal, porDia, recebido, consumos, cancelamentos, aReceber] = await Promise.all([
    pool.query(`SELECT count(*)::int AS n FROM quartos WHERE pousada_id = $1 AND ativo`, [pousadaId]),
    pool.query(`${noites} SELECT count(*)::int AS noites, count(DISTINCT id)::int AS reservas, COALESCE(sum(diaria), 0)::float AS receita FROM noites`, params),
    pool.query(
      `${noites} SELECT canal, count(DISTINCT id)::int AS reservas, count(*)::int AS noites, COALESCE(sum(diaria), 0)::float AS receita
         FROM noites GROUP BY canal ORDER BY receita DESC`,
      params,
    ),
    pool.query(
      `${noites} SELECT d.dia::text AS dia, count(DISTINCT n.quarto)::int AS ocupados
         FROM dias d LEFT JOIN noites n ON n.dia = d.dia GROUP BY d.dia ORDER BY d.dia`,
      params,
    ),
    pool.query(
      `SELECT p.forma, COALESCE(sum(p.valor_centavos), 0)::int AS centavos, count(*)::int AS lancamentos
         FROM pagamentos p JOIN reservas r ON r.id = p.reserva_id
        WHERE p.pousada_id = $1 AND r.deleted_at IS NULL AND p.recebido_em BETWEEN $2::date AND $3::date
        GROUP BY p.forma ORDER BY centavos DESC`,
      params,
    ),
    pool.query(
      `SELECT COALESCE(sum(c.quantidade * c.valor_unitario_centavos), 0)::int AS centavos
         FROM consumos c JOIN reservas r ON r.id = c.reserva_id
        WHERE c.pousada_id = $1 AND r.deleted_at IS NULL AND c.lancado_em BETWEEN $2::date AND $3::date`,
      params,
    ),
    pool.query(
      `SELECT count(*) FILTER (WHERE status = 'cancelada')::int AS canceladas,
              count(*) FILTER (WHERE status = 'no_show')::int AS no_show,
              count(*)::int AS total
         FROM reservas
        WHERE pousada_id = $1 AND deleted_at IS NULL AND data_entrada BETWEEN $2::date AND $3::date`,
      params,
    ),
    pool.query(
      `SELECT * FROM (
         SELECT r.id, r.nome, r.quarto, r.data_entrada::text AS data_entrada, r.data_saida::text AS data_saida, r.status,
                COALESCE(round(r.valor * 100), 0)::int
                  + COALESCE((SELECT sum(c.quantidade * c.valor_unitario_centavos) FROM consumos c WHERE c.reserva_id = r.id), 0)::int
                  - COALESCE((SELECT sum(p.valor_centavos) FROM pagamentos p WHERE p.reserva_id = r.id), 0)::int AS saldo_centavos
           FROM reservas r
          WHERE r.pousada_id = $1 AND r.deleted_at IS NULL AND r.status IN ('pre_reserva', 'confirmada', 'hospedada', 'finalizada')
       ) t WHERE saldo_centavos > 0 ORDER BY data_entrada LIMIT 200`,
      [pousadaId],
    ),
  ]);

  const dias = porDia.rows.length;
  const quartosAtivos = quartos.rows[0].n as number;
  const disponiveis = quartosAtivos * dias;
  const vendidas = totais.rows[0].noites as number;
  const receita = totais.rows[0].receita as number;
  const centavos = (reais: number) => Math.round(reais * 100);

  return {
    inicio,
    fim,
    dias,
    quartosAtivos,
    noitesDisponiveis: disponiveis,
    noitesVendidas: vendidas,
    reservas: totais.rows[0].reservas as number,
    ocupacao: disponiveis ? Math.round((vendidas / disponiveis) * 1000) / 10 : 0,
    receitaHospedagemCentavos: centavos(receita),
    adrCentavos: vendidas ? centavos(receita / vendidas) : 0,
    revparCentavos: disponiveis ? centavos(receita / disponiveis) : 0,
    consumosCentavos: consumos.rows[0].centavos as number,
    porCanal: porCanal.rows.map((c) => ({ canal: c.canal, reservas: c.reservas, noites: c.noites, receitaCentavos: centavos(c.receita) })),
    ocupacaoPorDia: porDia.rows.map((d) => ({ dia: d.dia, ocupados: d.ocupados, percentual: quartosAtivos ? Math.round((d.ocupados / quartosAtivos) * 100) : 0 })),
    recebidoCentavos: recebido.rows.reduce((s, x) => s + x.centavos, 0),
    recebidoPorForma: recebido.rows.map((x) => ({ forma: x.forma, centavos: x.centavos, lancamentos: x.lancamentos })),
    cancelamentos: cancelamentos.rows[0],
    aReceberCentavos: aReceber.rows.reduce((s, x) => s + x.saldo_centavos, 0),
    aReceber: aReceber.rows,
  };
}
