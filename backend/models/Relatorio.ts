/**
 * Relatórios da pousada num período [inicio, fim] (noites, datas inclusivas).
 *
 * Conta só negócio fechado: confirmada, hospedada e finalizada. Pré-reserva
 * ainda pode cair e cancelada/no-show não ocuparam o quarto. Confirmada em
 * revisão (saída vencida sem check-in) fica de fora até a recepção decidir.
 *
 * - Receita de hospedagem por competência: cada noite vale valor/noites da
 *   reserva; entra a noite que cai no período (estadia que atravessa o mês
 *   divide a receita entre os meses).
 * - Noites: com valor, sem valor (a OTA não informa o preço pelo iCal) e
 *   bloqueadas (data fechada na OTA, que não é venda).
 * - Ocupação = noites vendidas / noites disponíveis, nunca acima de 100%.
 *   Disponíveis = quartos × dias − bloqueadas. Os quartos são os ativos hoje
 *   mais os que venderam noite no período: quarto desativado depois do período
 *   existia nele.
 * - ADR (diária média) = receita / noites com valor. RevPAR = receita / noites
 *   disponíveis de receita conhecida. Noite de valor desconhecido não entra
 *   como se tivesse rendido zero.
 * - Recebido: o que entrou no caixa no período (pagamentos pela data), por forma.
 * - A receber: saldo atual das reservas em aberto (não depende do período). O
 *   total soma tudo; a lista traz as primeiras LIMITE_LISTA_A_RECEBER.
 *
 * As consultas rodam uma de cada vez: em paralelo, um relatório só tomaria quase
 * todo o pool (10 conexões) e deixaria a operação da pousada esperando.
 */
import { pool } from '../db/index.js';

const STATUS = `('confirmada', 'hospedada', 'finalizada')`;
const LIMITE_LISTA_A_RECEBER = 200;

export async function relatorio(pousadaId: number, inicio: string, fim: string) {
  const params = [pousadaId, inicio, fim];
  const noites = `
    WITH dias AS (SELECT d::date AS dia FROM generate_series($2::date, $3::date, interval '1 day') d),
    r AS (
      SELECT id, canal, quarto, valor, ical_bloqueio, data_entrada, data_saida, GREATEST(data_saida - data_entrada, 1) AS total_noites
        FROM reservas
       WHERE pousada_id = $1 AND deleted_at IS NULL AND status IN ${STATUS} AND revisao_em IS NULL
         AND data_entrada <= $3::date AND data_saida > $2::date
    ),
    noites AS (
      SELECT r.id, r.canal, r.quarto, d.dia, COALESCE(r.valor, 0) / r.total_noites AS diaria,
             COALESCE(r.valor, 0) > 0 AS com_valor,
             r.ical_bloqueio AND COALESCE(r.valor, 0) = 0 AS bloqueio
        FROM r JOIN dias d ON d.dia >= r.data_entrada AND d.dia < r.data_saida
    )`;
  // Saldo por reserva em aberto: a soma e a lista leem o mesmo cálculo.
  const saldos = `
    SELECT r.id, r.nome, r.quarto, r.data_entrada::text AS data_entrada, r.data_saida::text AS data_saida, r.status,
           COALESCE(round(r.valor * 100), 0)::int
             + COALESCE((SELECT sum(c.quantidade * c.valor_unitario_centavos) FROM consumos c WHERE c.reserva_id = r.id), 0)::int
             - COALESCE((SELECT sum(p.valor_centavos) FROM pagamentos p WHERE p.reserva_id = r.id), 0)::int AS saldo_centavos
      FROM reservas r
     WHERE r.pousada_id = $1 AND r.deleted_at IS NULL AND r.revisao_em IS NULL AND r.status IN ('pre_reserva', 'confirmada', 'hospedada', 'finalizada')`;

  const quartos = await pool.query(`SELECT count(*)::int AS n FROM quartos WHERE pousada_id = $1 AND ativo`, [pousadaId]);
  const quartosNoPeriodo = await pool.query(
    `${noites} SELECT count(*)::int AS n FROM (
       SELECT numero AS quarto FROM quartos WHERE pousada_id = $1 AND ativo
       UNION
       SELECT quarto FROM noites WHERE NOT bloqueio
     ) q`,
    params,
  );
  const totais = await pool.query(
    `${noites} SELECT count(*) FILTER (WHERE NOT bloqueio)::int AS noites,
                      count(*) FILTER (WHERE com_valor)::int AS com_valor,
                      count(*) FILTER (WHERE NOT com_valor AND NOT bloqueio)::int AS sem_valor,
                      count(*) FILTER (WHERE bloqueio)::int AS bloqueadas,
                      count(DISTINCT id) FILTER (WHERE NOT bloqueio)::int AS reservas,
                      COALESCE(sum(diaria), 0)::float AS receita
                 FROM noites`,
    params,
  );
  const porCanal = await pool.query(
    `${noites} SELECT canal, count(DISTINCT id)::int AS reservas, count(*)::int AS noites, COALESCE(sum(diaria), 0)::float AS receita
       FROM noites WHERE NOT bloqueio GROUP BY canal ORDER BY receita DESC`,
    params,
  );
  const porDia = await pool.query(
    `${noites} SELECT d.dia::text AS dia, count(DISTINCT n.quarto)::int AS ocupados
       FROM dias d LEFT JOIN noites n ON n.dia = d.dia AND NOT n.bloqueio GROUP BY d.dia ORDER BY d.dia`,
    params,
  );
  const recebido = await pool.query(
    `SELECT p.forma, COALESCE(sum(p.valor_centavos), 0)::int AS centavos, count(*)::int AS lancamentos
       FROM pagamentos p JOIN reservas r ON r.id = p.reserva_id
      WHERE p.pousada_id = $1 AND r.deleted_at IS NULL AND p.recebido_em BETWEEN $2::date AND $3::date
      GROUP BY p.forma ORDER BY centavos DESC`,
    params,
  );
  const consumos = await pool.query(
    `SELECT COALESCE(sum(c.quantidade * c.valor_unitario_centavos), 0)::int AS centavos
       FROM consumos c JOIN reservas r ON r.id = c.reserva_id
      WHERE c.pousada_id = $1 AND r.deleted_at IS NULL AND c.lancado_em BETWEEN $2::date AND $3::date`,
    params,
  );
  const cancelamentos = await pool.query(
    `SELECT count(*) FILTER (WHERE status = 'cancelada')::int AS canceladas,
            count(*) FILTER (WHERE status = 'no_show')::int AS no_show,
            count(*)::int AS total
       FROM reservas
      WHERE pousada_id = $1 AND deleted_at IS NULL AND data_entrada BETWEEN $2::date AND $3::date`,
    params,
  );
  const aReceberTotal = await pool.query(
    `SELECT COALESCE(sum(saldo_centavos), 0)::float AS centavos, count(*)::int AS reservas
       FROM (${saldos}) t WHERE saldo_centavos > 0`,
    [pousadaId],
  );
  const aReceber = await pool.query(`SELECT * FROM (${saldos}) t WHERE saldo_centavos > 0 ORDER BY data_entrada LIMIT ${LIMITE_LISTA_A_RECEBER}`, [pousadaId]);

  const dias = porDia.rows.length;
  const quartosAtivos = quartos.rows[0].n as number;
  const quartosConsiderados = quartosNoPeriodo.rows[0].n as number;
  const bloqueadas = totais.rows[0].bloqueadas as number;
  const disponiveis = Math.max(quartosConsiderados * dias - bloqueadas, 0);
  const vendidas = totais.rows[0].noites as number;
  const comValor = totais.rows[0].com_valor as number;
  const semValor = totais.rows[0].sem_valor as number;
  const receita = totais.rows[0].receita as number;
  const disponiveisComValor = Math.max(disponiveis - semValor, 0);
  const centavos = (reais: number) => Math.round(reais * 100);

  return {
    inicio,
    fim,
    dias,
    quartosAtivos,
    quartosConsiderados,
    noitesDisponiveis: disponiveis,
    noitesVendidas: vendidas,
    noitesComValor: comValor,
    noitesSemValor: semValor,
    noitesBloqueadas: bloqueadas,
    reservas: totais.rows[0].reservas as number,
    ocupacao: disponiveis ? Math.min(Math.round((vendidas / disponiveis) * 1000) / 10, 100) : 0,
    receitaHospedagemCentavos: centavos(receita),
    adrCentavos: comValor ? centavos(receita / comValor) : 0,
    revparCentavos: disponiveisComValor ? centavos(receita / disponiveisComValor) : 0,
    consumosCentavos: consumos.rows[0].centavos as number,
    porCanal: porCanal.rows.map((c) => ({ canal: c.canal, reservas: c.reservas, noites: c.noites, receitaCentavos: centavos(c.receita) })),
    ocupacaoPorDia: porDia.rows.map((d) => ({
      dia: d.dia,
      ocupados: d.ocupados,
      percentual: quartosConsiderados ? Math.min(Math.round((d.ocupados / quartosConsiderados) * 100), 100) : 0,
    })),
    recebidoCentavos: recebido.rows.reduce((s, x) => s + x.centavos, 0),
    recebidoPorForma: recebido.rows.map((x) => ({ forma: x.forma, centavos: x.centavos, lancamentos: x.lancamentos })),
    cancelamentos: cancelamentos.rows[0],
    aReceberCentavos: aReceberTotal.rows[0].centavos as number,
    aReceberTotal: aReceberTotal.rows[0].reservas as number,
    aReceber: aReceber.rows,
  };
}
