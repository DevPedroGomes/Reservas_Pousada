/**
 * Conta da reserva: diárias + consumos, menos o que foi pago (migration 019).
 *
 * `reservas.pago` vira consequência: a cada lançamento, fica verdadeiro
 * quando o que entrou cobre o total. Isso mantém funcionando tudo o que já
 * lê a coluna (agenda "a pagar", filtro "pago", CSV).
 */
import type { PoolClient } from 'pg';
import { and, asc, eq } from 'drizzle-orm';
import { db, pool, pagamentos, consumos, user } from '../db/index.js';
import { sanitizarString, validarData } from '../utils/validation.js';
import { hojeLocal } from '../utils/datas.js';

export const FORMAS_PAGAMENTO = ['pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'transferencia', 'ota', 'outro'] as const;
export const TIPOS_PAGAMENTO = ['sinal', 'pagamento', 'estorno'] as const;

const MAX_CENTAVOS = 100_000_000; // R$ 1 milhão por lançamento

export interface DadosPagamento {
  valorCentavos: number;
  forma: string;
  tipo: string;
  recebidoEm: string;
  observacao: string | null;
}

export interface DadosConsumo {
  descricao: string;
  quantidade: number;
  valorUnitarioCentavos: number;
  lancadoEm: string;
}

/** Reais (número ou "150,50") para centavos; NaN se não for valor. */
function centavos(v: unknown): number {
  if (v === null || v === undefined || v === '') return NaN;
  const texto = String(v).trim();
  // "1.234,56" (pt-BR) ou "1234.56"; número já vem pronto.
  const n = typeof v === 'number' ? v : Number(texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

export function lerPagamento(corpo: Record<string, unknown>): { dados: DadosPagamento; erros: string[] } {
  const erros: string[] = [];
  const tipo = String(corpo.tipo ?? 'pagamento');
  const forma = String(corpo.forma ?? '');
  let valor = centavos(corpo.valor);
  if (!Number.isFinite(valor) || valor === 0 || Math.abs(valor) > MAX_CENTAVOS) erros.push('Valor do pagamento inválido');
  // Estorno é sempre negativo, pagamento sempre positivo — independente do sinal digitado.
  valor = tipo === 'estorno' ? -Math.abs(valor) : Math.abs(valor);
  if (!(TIPOS_PAGAMENTO as readonly string[]).includes(tipo)) erros.push('Tipo inválido (sinal, pagamento ou estorno)');
  if (!(FORMAS_PAGAMENTO as readonly string[]).includes(forma)) erros.push(`Forma de pagamento inválida. Use: ${FORMAS_PAGAMENTO.join(', ')}`);
  const recebidoEm = corpo.recebido_em ? String(corpo.recebido_em) : hojeLocal();
  if (!validarData(recebidoEm)) erros.push('Data do pagamento inválida');
  const observacao = sanitizarString(String(corpo.observacao ?? ''), 300) || null;
  return { dados: { valorCentavos: valor, forma, tipo, recebidoEm, observacao }, erros };
}

export function lerConsumo(corpo: Record<string, unknown>): { dados: DadosConsumo; erros: string[] } {
  const erros: string[] = [];
  const descricao = sanitizarString(String(corpo.descricao ?? ''), 120);
  if (descricao.length < 2) erros.push('Descreva o consumo (ex.: frigobar, passeio)');
  const quantidade = corpo.quantidade === undefined || corpo.quantidade === '' ? 1 : Number(corpo.quantidade);
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 999) erros.push('Quantidade deve ser de 1 a 999');
  const valor = centavos(corpo.valor_unitario ?? corpo.valor);
  if (!Number.isFinite(valor) || valor < 0 || valor > MAX_CENTAVOS) erros.push('Valor do consumo inválido');
  const lancadoEm = corpo.lancado_em ? String(corpo.lancado_em) : hojeLocal();
  if (!validarData(lancadoEm)) erros.push('Data do consumo inválida');
  return { dados: { descricao, quantidade, valorUnitarioCentavos: valor, lancadoEm }, erros };
}

/** Recalcula `reservas.pago` a partir dos lançamentos (sem mexer na versão). */
async function recalcularPago(cliente: PoolClient, reservaId: number): Promise<void> {
  await cliente.query(
    `UPDATE reservas r
        SET pago = t.pago > 0 AND t.pago >= t.total, updated_at = now()
       FROM (
         SELECT COALESCE(round(r2.valor * 100), 0)::bigint
                + COALESCE((SELECT sum(c.quantidade * c.valor_unitario_centavos) FROM consumos c WHERE c.reserva_id = r2.id), 0) AS total,
                COALESCE((SELECT sum(p.valor_centavos) FROM pagamentos p WHERE p.reserva_id = r2.id), 0) AS pago
           FROM reservas r2 WHERE r2.id = $1
       ) t
      WHERE r.id = $1`,
    [reservaId],
  );
}

async function emTransacao<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const r = await fn(cliente);
    await cliente.query('COMMIT');
    return r;
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

export class ContaReservaModel {
  /** Há pagamento lançado? Com lançamentos, `pago` deixa de ser manual. */
  static async temPagamentos(reservaId: number): Promise<boolean> {
    const { rowCount } = await pool.query(`SELECT 1 FROM pagamentos WHERE reserva_id = $1 LIMIT 1`, [reservaId]);
    return (rowCount ?? 0) > 0;
  }

  /** Recalcula `pago` depois de mudar o valor das diárias. */
  static async aposMudarValor(reservaId: number): Promise<void> {
    if (!(await this.temPagamentos(reservaId))) return;
    await emTransacao((c) => recalcularPago(c, reservaId));
  }

  /** A conta inteira: itens, lançamentos e os totais. */
  static async resumo(reservaId: number, pousadaId: number, valorDiarias: string | number | null) {
    const [listaPagamentos, listaConsumos] = await Promise.all([
      db
        .select({
          id: pagamentos.id, valorCentavos: pagamentos.valorCentavos, forma: pagamentos.forma, tipo: pagamentos.tipo,
          recebidoEm: pagamentos.recebidoEm, observacao: pagamentos.observacao, criadoPorNome: user.name, createdAt: pagamentos.createdAt,
        })
        .from(pagamentos)
        .leftJoin(user, eq(pagamentos.criadoPor, user.id))
        .where(and(eq(pagamentos.reservaId, reservaId), eq(pagamentos.pousadaId, pousadaId)))
        .orderBy(asc(pagamentos.recebidoEm), asc(pagamentos.id)),
      db
        .select({
          id: consumos.id, descricao: consumos.descricao, quantidade: consumos.quantidade,
          valorUnitarioCentavos: consumos.valorUnitarioCentavos, lancadoEm: consumos.lancadoEm, criadoPorNome: user.name,
        })
        .from(consumos)
        .leftJoin(user, eq(consumos.criadoPor, user.id))
        .where(and(eq(consumos.reservaId, reservaId), eq(consumos.pousadaId, pousadaId)))
        .orderBy(asc(consumos.lancadoEm), asc(consumos.id)),
    ]);
    const diariasCentavos = valorDiarias === null || valorDiarias === undefined ? 0 : Math.round(Number(valorDiarias) * 100);
    const consumosCentavos = listaConsumos.reduce((s, c) => s + c.quantidade * c.valorUnitarioCentavos, 0);
    const pagoCentavos = listaPagamentos.reduce((s, p) => s + p.valorCentavos, 0);
    const totalCentavos = diariasCentavos + consumosCentavos;
    return {
      diariasCentavos,
      consumosCentavos,
      totalCentavos,
      pagoCentavos,
      saldoCentavos: totalCentavos - pagoCentavos,
      pagamentos: listaPagamentos,
      consumos: listaConsumos,
    };
  }

  static async lancarPagamento(pousadaId: number, reservaId: number, dados: DadosPagamento, userId: string) {
    return emTransacao(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO pagamentos (pousada_id, reserva_id, valor_centavos, forma, tipo, recebido_em, observacao, criado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [pousadaId, reservaId, dados.valorCentavos, dados.forma, dados.tipo, dados.recebidoEm, dados.observacao, userId],
      );
      await recalcularPago(c, reservaId);
      return rows[0].id as number;
    });
  }

  static async removerPagamento(pousadaId: number, reservaId: number, id: number) {
    return emTransacao(async (c) => {
      const { rows } = await c.query(
        `DELETE FROM pagamentos WHERE id = $1 AND reserva_id = $2 AND pousada_id = $3
         RETURNING valor_centavos, forma, tipo, recebido_em`,
        [id, reservaId, pousadaId],
      );
      if (rows.length) await recalcularPago(c, reservaId);
      return rows[0] ?? null;
    });
  }

  static async lancarConsumo(pousadaId: number, reservaId: number, dados: DadosConsumo, userId: string) {
    return emTransacao(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO consumos (pousada_id, reserva_id, descricao, quantidade, valor_unitario_centavos, lancado_em, criado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [pousadaId, reservaId, dados.descricao, dados.quantidade, dados.valorUnitarioCentavos, dados.lancadoEm, userId],
      );
      await recalcularPago(c, reservaId);
      return rows[0].id as number;
    });
  }

  static async removerConsumo(pousadaId: number, reservaId: number, id: number) {
    return emTransacao(async (c) => {
      const { rows } = await c.query(
        `DELETE FROM consumos WHERE id = $1 AND reserva_id = $2 AND pousada_id = $3
         RETURNING descricao, quantidade, valor_unitario_centavos`,
        [id, reservaId, pousadaId],
      );
      if (rows.length) await recalcularPago(c, reservaId);
      return rows[0] ?? null;
    });
  }
}

export default ContaReservaModel;
