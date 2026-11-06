/**
 * Consumo do modelo de linguagem por pousada (migration 026).
 *
 * Gravado a cada chamada ao provedor, não ao fim da conversa: uma rodada paga
 * antes de uma falha também conta para o teto.
 */
import { pool } from '../db/index.js';
import type { Ferramenta, MensagemLLM, RespostaLLM, UsoLLM } from '../lib/llm.js';
import { hojeLocal } from '../utils/datas.js';

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

export async function registrarUsoLLM(pousadaId: number, uso: UsoLLM): Promise<void> {
  await pool.query(
    `INSERT INTO agente_uso_diario (pousada_id, dia, chamadas, tokens_entrada, tokens_saida)
     VALUES ($1, $2, 1, $3, $4)
     ON CONFLICT (pousada_id, dia) DO UPDATE SET
       chamadas = agente_uso_diario.chamadas + 1,
       tokens_entrada = agente_uso_diario.tokens_entrada + EXCLUDED.tokens_entrada,
       tokens_saida = agente_uso_diario.tokens_saida + EXCLUDED.tokens_saida`,
    [pousadaId, hojeLocal(), uso.entrada, uso.saida],
  );
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
