/**
 * Tarifário (migration 020) e cotação de uma estadia.
 *
 * Preço de cada noite = preço base do quarto, ajustado pela regra de preço
 * mais específica que vale naquela noite:
 *   quarto específico > todos os quartos; com período > sem período;
 *   com dias da semana > todos os dias; empate → a mais recente.
 * Mínimo de noites: o maior exigido por qualquer regra que vale em alguma
 * noite da estadia (pacote de Réveillon pega quem só encosta no dia 31).
 */
import { and, asc, eq } from 'drizzle-orm';
import { db, tarifas, quartos, type Tarifa } from '../db/index.js';
import { sanitizarString, validarData } from '../utils/validation.js';

export type RegraTarifa = Pick<
  Tarifa,
  'id' | 'nome' | 'quartoNumero' | 'dataInicio' | 'dataFim' | 'diasSemana' | 'precoCentavos' | 'ajustePercentual' | 'minimoNoites'
>;

export interface NoiteCotada {
  data: string;
  valorCentavos: number | null;
  regra: string | null;
}

export interface Cotacao {
  noites: NoiteCotada[];
  totalCentavos: number | null;
  minimoNoites: number | null;
  atendeMinimo: boolean;
  /** Quarto sem preço base e sem regra de preço fixo em alguma noite. */
  semPreco: boolean;
}

/** Datas das noites de [entrada, saida). */
export function noitesDe(entrada: string, saida: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${entrada}T00:00:00Z`), fim = Date.parse(`${saida}T00:00:00Z`); t < fim; t += 864e5) {
    out.push(new Date(t).toISOString().slice(0, 10));
    if (out.length > 366) break;
  }
  return out;
}

function vale(r: RegraTarifa, quarto: number, data: string): boolean {
  if (r.quartoNumero !== null && r.quartoNumero !== quarto) return false;
  if (r.dataInicio && (data < r.dataInicio || data > (r.dataFim ?? r.dataInicio))) return false;
  if (r.diasSemana && r.diasSemana.length > 0 && !r.diasSemana.includes(new Date(`${data}T12:00:00Z`).getUTCDay())) return false;
  return true;
}

const especificidade = (r: RegraTarifa) =>
  (r.quartoNumero !== null ? 4 : 0) + (r.dataInicio ? 2 : 0) + (r.diasSemana?.length ? 1 : 0);

/** Cotação pura (sem banco): base do quarto + regras ativas da pousada. */
export function cotar(baseCentavos: number | null, regras: RegraTarifa[], quarto: number, entrada: string, saida: string): Cotacao {
  const noites = noitesDe(entrada, saida);
  let minimo: number | null = null;
  let semPreco = false;
  const cotadas = noites.map((data) => {
    const aplicaveis = regras.filter((r) => vale(r, quarto, data));
    for (const r of aplicaveis) if (r.minimoNoites) minimo = Math.max(minimo ?? 0, r.minimoNoites);
    const dePreco = aplicaveis
      .filter((r) => r.precoCentavos !== null || r.ajustePercentual !== null)
      .sort((a, b) => especificidade(b) - especificidade(a) || b.id - a.id);
    const regra = dePreco[0];
    let valor: number | null = baseCentavos;
    if (regra?.precoCentavos !== null && regra?.precoCentavos !== undefined) valor = regra.precoCentavos;
    else if (regra?.ajustePercentual !== null && regra?.ajustePercentual !== undefined && baseCentavos !== null) {
      valor = Math.round(baseCentavos * (1 + regra.ajustePercentual / 100));
    }
    if (valor === null) semPreco = true;
    return { data, valorCentavos: valor, regra: regra?.nome ?? null };
  });
  const minimoNoites = minimo as number | null;
  return {
    noites: cotadas,
    totalCentavos: semPreco ? null : cotadas.reduce((s, n) => s + (n.valorCentavos ?? 0), 0),
    minimoNoites,
    atendeMinimo: minimoNoites === null || noites.length >= minimoNoites,
    semPreco,
  };
}

export interface DadosTarifa {
  nome: string;
  quartoNumero: number | null;
  dataInicio: string | null;
  dataFim: string | null;
  diasSemana: number[] | null;
  precoCentavos: number | null;
  ajustePercentual: number | null;
  minimoNoites: number | null;
  ativa: boolean;
}

/** Lê e valida o corpo (valores em reais na API, centavos no banco). */
export function lerTarifa(corpo: Record<string, unknown>): { dados: DadosTarifa; erros: string[] } {
  const erros: string[] = [];
  const vazio = (v: unknown) => v === undefined || v === null || v === '';
  const nome = sanitizarString(String(corpo.nome ?? ''), 60);
  if (nome.length < 2) erros.push('Dê um nome à regra (ex.: Alta temporada, Fim de semana)');

  const quartoNumero = vazio(corpo.quarto) ? null : Number(corpo.quarto);
  if (quartoNumero !== null && (!Number.isInteger(quartoNumero) || quartoNumero < 1)) erros.push('Quarto inválido');

  const dataInicio = vazio(corpo.data_inicio) ? null : String(corpo.data_inicio);
  const dataFim = vazio(corpo.data_fim) ? null : String(corpo.data_fim);
  if ((dataInicio === null) !== (dataFim === null)) erros.push('Informe o início e o fim do período (ou nenhum dos dois)');
  if (dataInicio && dataFim) {
    if (!validarData(dataInicio) || !validarData(dataFim)) erros.push('Período inválido');
    else if (dataFim < dataInicio) erros.push('O fim do período vem antes do início');
  }

  let diasSemana: number[] | null = null;
  if (Array.isArray(corpo.dias_semana) && corpo.dias_semana.length > 0) {
    diasSemana = [...new Set(corpo.dias_semana.map(Number))].sort();
    if (diasSemana.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) erros.push('Dias da semana inválidos');
    if (diasSemana.length === 7) diasSemana = null; // todos os dias = sem restrição
  }

  const precoCentavos = vazio(corpo.preco) ? null : Math.round(Number(String(corpo.preco).replace(',', '.')) * 100);
  if (precoCentavos !== null && (!Number.isFinite(precoCentavos) || precoCentavos < 0 || precoCentavos > 100_000_000)) erros.push('Preço inválido');
  const ajustePercentual = vazio(corpo.ajuste_percentual) ? null : Number(corpo.ajuste_percentual);
  if (ajustePercentual !== null && (!Number.isInteger(ajustePercentual) || ajustePercentual < -90 || ajustePercentual > 500)) {
    erros.push('Ajuste deve ser um percentual inteiro entre -90% e +500%');
  }
  if (precoCentavos !== null && ajustePercentual !== null) erros.push('Use preço fixo OU percentual, não os dois');

  const minimoNoites = vazio(corpo.minimo_noites) ? null : Number(corpo.minimo_noites);
  if (minimoNoites !== null && (!Number.isInteger(minimoNoites) || minimoNoites < 1 || minimoNoites > 60)) erros.push('Mínimo de noites deve ser de 1 a 60');
  if (precoCentavos === null && ajustePercentual === null && minimoNoites === null) {
    erros.push('A regra precisa mudar o preço ou exigir mínimo de noites');
  }

  return {
    dados: { nome, quartoNumero, dataInicio, dataFim, diasSemana, precoCentavos, ajustePercentual, minimoNoites, ativa: corpo.ativa === undefined ? true : Boolean(corpo.ativa) },
    erros,
  };
}

const CAMPOS = {
  id: tarifas.id, nome: tarifas.nome, quartoNumero: tarifas.quartoNumero, dataInicio: tarifas.dataInicio, dataFim: tarifas.dataFim,
  diasSemana: tarifas.diasSemana, precoCentavos: tarifas.precoCentavos, ajustePercentual: tarifas.ajustePercentual,
  minimoNoites: tarifas.minimoNoites, ativa: tarifas.ativa,
};

export class TarifaModel {
  static listar(pousadaId: number) {
    return db.select(CAMPOS).from(tarifas).where(eq(tarifas.pousadaId, pousadaId)).orderBy(asc(tarifas.dataInicio), asc(tarifas.id));
  }

  static async criar(pousadaId: number, d: DadosTarifa) {
    const [t] = await db.insert(tarifas).values({ pousadaId, ...d }).returning(CAMPOS);
    return t;
  }

  static async atualizar(id: number, pousadaId: number, d: DadosTarifa) {
    const [t] = await db
      .update(tarifas)
      .set({ ...d, updatedAt: new Date() })
      .where(and(eq(tarifas.id, id), eq(tarifas.pousadaId, pousadaId)))
      .returning(CAMPOS);
    return t ?? null;
  }

  static async remover(id: number, pousadaId: number): Promise<boolean> {
    const r = await db.delete(tarifas).where(and(eq(tarifas.id, id), eq(tarifas.pousadaId, pousadaId)));
    return (r.rowCount ?? 0) > 0;
  }

  /** Cotação de uma estadia num quarto desta pousada (null se o quarto não existe). */
  static async cotacao(pousadaId: number, quarto: number, entrada: string, saida: string): Promise<(Cotacao & { quarto: string }) | null> {
    const [q] = await db
      .select({ nome: quartos.nome, base: quartos.precoBaseCentavos })
      .from(quartos)
      .where(and(eq(quartos.pousadaId, pousadaId), eq(quartos.numero, quarto)))
      .limit(1);
    if (!q) return null;
    const regras = await db.select(CAMPOS).from(tarifas).where(and(eq(tarifas.pousadaId, pousadaId), eq(tarifas.ativa, true)));
    return { quarto: q.nome, ...cotar(q.base, regras, quarto, entrada, saida) };
  }
}

export default TarifaModel;
