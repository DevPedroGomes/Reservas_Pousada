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

export interface PrecoLLM {
  entradaUsdPorMTok: number;
  saidaUsdPorMTok: number;
  cotacaoUsdBrl: number;
  /** false = algum valor veio do padrão abaixo, e o custo é só estimativa. */
  configurado: boolean;
}

/**
 * Preço do modelo do atendente: o único lugar do código que sabe disso.
 *
 * Padrões, usados só enquanto o ambiente não define os três valores:
 *   entrada US$ 1,00 e saída US$ 5,00 por milhão de tokens: tabela da Anthropic
 *   para o claude-haiku-4-5, o modelo padrão de lib/llm.ts. Outro modelo ou
 *   provedor tem outro preço.
 *   cotação R$ 5,50 por dólar: referência de ordem de grandeza, não cotação do dia.
 *
 * Lançamento feito com qualquer padrão vai marcado como estimado no painel.
 */
export function precoLLM(): PrecoLLM {
  const nomes = ['AGENTE_PRECO_ENTRADA_USD_MTOK', 'AGENTE_PRECO_SAIDA_USD_MTOK', 'AGENTE_COTACAO_USD_BRL'];
  return {
    entradaUsdPorMTok: positivoDoAmbiente(nomes[0], 1),
    saidaUsdPorMTok: positivoDoAmbiente(nomes[1], 5),
    cotacaoUsdBrl: positivoDoAmbiente(nomes[2], 5.5),
    configurado: nomes.every((n) => Number(process.env[n]) > 0),
  };
}

/** O que o painel de margem precisa dizer sobre o preço em uso. */
export function avisoDePrecoLLM(): string | null {
  return precoLLM().configurado
    ? null
    : 'AGENTE_PRECO_ENTRADA_USD_MTOK, AGENTE_PRECO_SAIDA_USD_MTOK e AGENTE_COTACAO_USD_BRL não configurados: o custo de IA usa valores padrão e é estimativa.';
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
