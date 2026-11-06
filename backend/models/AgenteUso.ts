/**
 * Consumo do modelo de linguagem por pousada (migration 026).
 *
 * Gravado a cada chamada ao provedor, não ao fim da conversa: uma rodada paga
 * antes de uma falha também conta para o teto.
 */
import { sql } from 'drizzle-orm';
import { db, pool } from '../db/index.js';
import { precoLLM, type PrecoLLM } from '../config/agente.js';
import type { Ferramenta, MensagemLLM, RespostaLLM, UsoLLM } from '../lib/llm.js';
import { hojeLocal } from '../utils/datas.js';
import FinanceiroModel from './Financeiro.js';

const CHARS_POR_TOKEN = 4;

/**
 * Uso aproximado pelo tamanho do texto, para provedor compatível que não
 * devolve `usage`. Sem isso a chamada entraria como zero e furaria o teto.
 */
export function estimarUso(sistema: string, mensagens: MensagemLLM[], ferramentas: Ferramenta[], r: RespostaLLM): UsoLLM {
  const entrada = sistema.length + JSON.stringify(mensagens).length + JSON.stringify(ferramentas).length;
  const saida = (r.texto ?? '').length + JSON.stringify(r.chamadas).length;
  return { entrada: Math.ceil(entrada / CHARS_POR_TOKEN), saida: Math.ceil(saida / CHARS_POR_TOKEN) };
}

/** tokens / 1 milhão x US$ por milhão x cotação x 100 centavos x 1 milhão de micro. */
export function custoEmMicrocentavos(uso: UsoLLM, preco: PrecoLLM): number {
  return Math.round((uso.entrada * preco.entradaUsdPorMTok + uso.saida * preco.saidaUsdPorMTok) * preco.cotacaoUsdBrl * 100);
}

/**
 * Soma a chamada ao dia da pousada e atualiza o lançamento `custo_ia` do mês na
 * mesma transação: é o que alimenta o painel de margem. O lançamento guarda o
 * total do mês arredondado, nunca a soma de arredondamentos.
 */
export async function registrarUsoLLM(pousadaId: number, uso: UsoLLM, opcoes: { estimado: boolean }): Promise<void> {
  const preco = precoLLM();
  const dia = hojeLocal();
  const competencia = dia.slice(0, 7);
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      INSERT INTO agente_uso_diario (pousada_id, dia, chamadas, tokens_entrada, tokens_saida, custo_microcentavos)
      VALUES (${pousadaId}, ${dia}, 1, ${uso.entrada}, ${uso.saida}, ${custoEmMicrocentavos(uso, preco)})
      ON CONFLICT (pousada_id, dia) DO UPDATE SET
        chamadas = agente_uso_diario.chamadas + 1,
        tokens_entrada = agente_uso_diario.tokens_entrada + EXCLUDED.tokens_entrada,
        tokens_saida = agente_uso_diario.tokens_saida + EXCLUDED.tokens_saida,
        custo_microcentavos = agente_uso_diario.custo_microcentavos + EXCLUDED.custo_microcentavos
    `);
    const { rows: [mes] } = await tx.execute(sql`
      SELECT COALESCE(sum(custo_microcentavos), 0) AS micro FROM agente_uso_diario
       WHERE pousada_id = ${pousadaId} AND to_char(dia, 'YYYY-MM') = ${competencia}
    `);
    await FinanceiroModel.acumular({
      pousadaId,
      competencia,
      categoria: 'custo_ia',
      valorCentavos: Number(mes.micro) / 1_000_000,
      estimado: opcoes.estimado || !preco.configurado,
      descricao: 'Atendente virtual do WhatsApp',
      referenciaExterna: `ia:${pousadaId}:${competencia}`,
    }, tx);
  });
}

/** Tokens gastos hoje por uma pousada. */
export async function tokensHojeDaPousada(pousadaId: number): Promise<number> {
  const { rows: [r] } = await pool.query(
    `SELECT COALESCE(sum(tokens_entrada + tokens_saida), 0) AS n FROM agente_uso_diario WHERE pousada_id = $1 AND dia = $2`,
    [pousadaId, hojeLocal()],
  );
  return Number(r.n);
}

/** Tokens gastos hoje somando todas as pousadas. */
export async function tokensHojeDaPlataforma(): Promise<number> {
  const { rows: [r] } = await pool.query(
    `SELECT COALESCE(sum(tokens_entrada + tokens_saida), 0) AS n FROM agente_uso_diario WHERE dia = $1`,
    [hojeLocal()],
  );
  return Number(r.n);
}

/** Devolve true só para quem marcou primeiro: o alerta sai uma vez por chave. */
export async function primeiroAlerta(chave: string): Promise<boolean> {
  const r = await pool.query(`INSERT INTO agente_alertas (chave) VALUES ($1) ON CONFLICT DO NOTHING`, [chave]);
  return (r.rowCount ?? 0) > 0;
}
