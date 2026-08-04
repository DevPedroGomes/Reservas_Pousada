/**
 * Cálculo de margem — lógica pura, sem banco.
 *
 * Separada porque é a conta que decide se um cliente fica ou sai, e uma conta
 * dessas precisa ser testável sem infraestrutura. Todos os valores em CENTAVOS:
 * ponto flutuante em dinheiro é como se perde centavo de forma invisível.
 */

export const CATEGORIAS_CUSTO = ['taxa_stripe', 'custo_ia', 'custo_email'] as const;
export type CategoriaCusto = (typeof CATEGORIAS_CUSTO)[number];
export type Categoria = 'receita_assinatura' | CategoriaCusto;

export interface Lancamento {
  categoria: Categoria;
  valorCentavos: number;
  estimado: boolean;
}

export interface MargemDoTenant {
  receitaCentavos: number;
  custoCentavos: number;
  custoPorCategoria: Record<CategoriaCusto, number>;
  /** Rateio de infraestrutura — calculado, não lançado. */
  infraCentavos: number;
  margemCentavos: number;
  /** Percentual sobre a receita. null quando não houve receita (não é 0%). */
  margemPercentual: number | null;
  /** Algum componente é estimativa? O painel precisa distinguir isso. */
  contemEstimativa: boolean;
}

/**
 * Margem de um tenant num mês.
 *
 * `infraCentavos` entra como parâmetro porque é rateio: depende de quantos
 * tenants dividem o custo fixo no período, informação que só existe no
 * agregado, não no tenant isolado.
 */
export function calcularMargem(lancamentos: Lancamento[], infraCentavos = 0): MargemDoTenant {
  const custoPorCategoria = {
    taxa_stripe: 0,
    custo_ia: 0,
    custo_email: 0,
  } as Record<CategoriaCusto, number>;

  let receitaCentavos = 0;
  let contemEstimativa = false;

  for (const l of lancamentos) {
    if (l.estimado) contemEstimativa = true;
    if (l.categoria === 'receita_assinatura') {
      receitaCentavos += l.valorCentavos;
    } else {
      custoPorCategoria[l.categoria] += l.valorCentavos;
    }
  }

  const custoLancado = CATEGORIAS_CUSTO.reduce((s, c) => s + custoPorCategoria[c], 0);
  const custoCentavos = custoLancado + infraCentavos;
  const margemCentavos = receitaCentavos - custoCentavos;

  return {
    receitaCentavos,
    custoCentavos,
    custoPorCategoria,
    infraCentavos,
    margemCentavos,
    // Sem receita não existe percentual. Devolver 0% faria um cliente que só
    // gerou custo parecer equilibrado.
    margemPercentual: receitaCentavos > 0
      ? Math.round((margemCentavos / receitaCentavos) * 1000) / 10
      : null,
    contemEstimativa,
  };
}

/**
 * Rateio do custo fixo de infraestrutura entre os tenants que geraram receita.
 *
 * Só entre os pagantes: distribuir o custo da VPS entre contas em trial faria
 * cada cliente pagante parecer mais barato do que é, que é exatamente o erro
 * que este painel existe para evitar.
 */
export function ratearInfra(custoTotalCentavos: number, tenantsPagantes: number): number {
  if (tenantsPagantes <= 0 || custoTotalCentavos <= 0) return 0;
  return Math.round(custoTotalCentavos / tenantsPagantes);
}

/** 'YYYY-MM' de uma data, no fuso informado. */
export function competenciaDe(data: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' })
    .format(data)
    .slice(0, 7);
}

/** A competência anterior a uma dada. '2026-01' → '2025-12'. */
export function competenciaAnterior(competencia: string): string {
  const [ano, mes] = competencia.split('-').map(Number);
  return mes === 1
    ? `${ano - 1}-12`
    : `${ano}-${String(mes - 1).padStart(2, '0')}`;
}

export function ehCompetencia(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

/** Centavos → "R$ 1.234,56". */
export function formatarCentavos(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
