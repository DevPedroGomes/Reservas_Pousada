/**
 * Limites do atendente virtual que não dependem do plano.
 *
 * Valor inválido ou zerado no ambiente cai no padrão: um erro de digitação não
 * pode desligar a proteção de custo em silêncio.
 */

function positivoDoAmbiente(nome: string, padrao: number): number {
  const v = Number(process.env[nome]);
  return Number.isFinite(v) && v > 0 ? v : padrao;
}

export interface LimitesAgente {
  /** Caracteres de cada mensagem enviados ao modelo. */
  maxCharsMensagem: number;
  /** Caracteres do histórico inteiro enviados ao modelo. */
  maxCharsHistorico: number;
  /** Mensagens de um mesmo contato por hora antes de passar para a equipe. */
  mensagensContatoHora: number;
  /** Tokens por dia, somando todas as pousadas. Acima disso o atendente desliga. */
  tetoGlobalTokensDia: number;
  /** Tokens por dia de uma pousada. */
  tetoTokensDiaPousada: number;
}

export function limitesAgente(): LimitesAgente {
  return {
    maxCharsMensagem: positivoDoAmbiente('AGENTE_MAX_CHARS_MENSAGEM', 2_000),
    maxCharsHistorico: positivoDoAmbiente('AGENTE_MAX_CHARS_HISTORICO', 6_000),
    mensagensContatoHora: positivoDoAmbiente('AGENTE_LIMITE_CONTATO_HORA', 30),
    tetoGlobalTokensDia: positivoDoAmbiente('AGENTE_TETO_GLOBAL_TOKENS_DIA', 5_000_000),
    tetoTokensDiaPousada: positivoDoAmbiente('AGENTE_TETO_TOKENS_DIA_POUSADA', 200_000),
  };
}
