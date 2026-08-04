import { sql } from 'drizzle-orm';
import { db, financeiroLancamentos } from '../db/index.js';
import { TIMEZONE } from '../utils/datas.js';
import {
  calcularMargem,
  competenciaAnterior,
  competenciaDe,
  ratearInfra,
  type Categoria,
  type Lancamento,
  type MargemDoTenant,
} from '../utils/margem.js';

export interface LinhaDeMargem {
  pousadaId: number;
  nome: string;
  plano: string | null;
  status: string;
  margem: MargemDoTenant;
  /** Meses consecutivos no vermelho, contando de trás para frente. */
  ciclosNegativos: number;
}

export interface RelatorioDeMargem {
  competencia: string;
  infraTotalCentavos: number;
  infraPorTenantCentavos: number;
  tenantsPagantes: number;
  linhas: LinhaDeMargem[];
  totais: {
    receitaCentavos: number;
    custoCentavos: number;
    margemCentavos: number;
    margemPercentual: number | null;
  };
}

/** Custo fixo mensal de infra a ratear. 0 = não configurado, e o painel diz isso. */
function custoInfraMensalCentavos(): number {
  const v = Number(process.env.CUSTO_INFRA_MENSAL_CENTAVOS);
  return Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
}

export class FinanceiroModel {
  /**
   * Registra um lançamento.
   *
   * `onConflictDoNothing` sobre (categoria, referencia_externa): eventos
   * diferentes do Stripe podem falar da mesma fatura, e dinheiro contado duas
   * vezes é pior que dinheiro não contado — o segundo dá para corrigir olhando
   * o Stripe, o primeiro passa despercebido.
   */
  static async registrar(params: {
    pousadaId: number;
    competencia: string;
    categoria: Categoria;
    valorCentavos: number;
    moeda?: string;
    estimado?: boolean;
    descricao?: string;
    referenciaExterna?: string;
  }): Promise<boolean> {
    const r = await db
      .insert(financeiroLancamentos)
      .values({
        pousadaId: params.pousadaId,
        competencia: params.competencia,
        categoria: params.categoria,
        valorCentavos: Math.max(0, Math.round(params.valorCentavos)),
        moeda: params.moeda ?? 'brl',
        estimado: params.estimado ?? false,
        descricao: params.descricao ?? null,
        referenciaExterna: params.referenciaExterna ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: financeiroLancamentos.id });
    return r.length > 0;
  }

  /** Competência atual, no fuso da operação. */
  static competenciaAtual(): string {
    return competenciaDe(new Date(), TIMEZONE);
  }

  /**
   * Relatório de margem de um mês.
   *
   * Busca 3 competências de uma vez porque a regra de negócio é "negativa por 2
   * ciclos consecutivos" — sem o histórico, o painel mostraria o mês e deixaria
   * a decisão que importa fora da tela.
   */
  static async relatorio(competencia: string): Promise<RelatorioDeMargem> {
    const anterior = competenciaAnterior(competencia);
    const retrasado = competenciaAnterior(anterior);
    const meses = [competencia, anterior, retrasado];

    const { rows } = await db.execute(sql`
      SELECT
        p.id            AS pousada_id,
        p.nome          AS nome,
        a.plano         AS plano,
        a.status        AS status,
        f.competencia   AS competencia,
        f.categoria     AS categoria,
        f.estimado      AS estimado,
        COALESCE(SUM(f.valor_centavos), 0)::int AS total
      FROM pousadas p
      LEFT JOIN assinaturas a ON a.pousada_id = p.id
      LEFT JOIN financeiro_lancamentos f
        ON f.pousada_id = p.id AND f.competencia = ANY(${meses})
      GROUP BY p.id, p.nome, a.plano, a.status, f.competencia, f.categoria, f.estimado
      ORDER BY p.nome
    `);

    // Agrupa por (pousada, competência). O SQL devolve uma linha por categoria;
    // a montagem em memória é trivial e mantém a query legível.
    type Chave = string;
    const porTenant = new Map<number, { nome: string; plano: string | null; status: string }>();
    const porMes = new Map<Chave, Lancamento[]>();

    for (const r of rows as unknown as Array<Record<string, unknown>>) {
      const pousadaId = Number(r.pousada_id);
      if (!porTenant.has(pousadaId)) {
        porTenant.set(pousadaId, {
          nome: String(r.nome ?? ''),
          plano: (r.plano as string | null) ?? null,
          status: String(r.status ?? 'sem_assinatura'),
        });
      }
      if (!r.competencia || !r.categoria) continue; // LEFT JOIN sem lançamento
      const chave = `${pousadaId}|${r.competencia}`;
      const lista = porMes.get(chave) ?? [];
      lista.push({
        categoria: r.categoria as Categoria,
        valorCentavos: Number(r.total) || 0,
        estimado: Boolean(r.estimado),
      });
      porMes.set(chave, lista);
    }

    // Rateio só entre quem gerou receita no mês — dividir o custo da VPS com
    // contas em trial faria cada pagante parecer mais barato do que é.
    const pagantes = [...porTenant.keys()].filter((id) =>
      (porMes.get(`${id}|${competencia}`) ?? []).some(
        (l) => l.categoria === 'receita_assinatura' && l.valorCentavos > 0,
      ),
    );
    const infraTotal = custoInfraMensalCentavos();
    const infraPorTenant = ratearInfra(infraTotal, pagantes.length);

    const linhas: LinhaDeMargem[] = [];
    for (const [pousadaId, meta] of porTenant) {
      const ehPagante = pagantes.includes(pousadaId);
      const margem = calcularMargem(
        porMes.get(`${pousadaId}|${competencia}`) ?? [],
        ehPagante ? infraPorTenant : 0,
      );

      // Conta trás-para-frente e para no primeiro mês não-negativo: dois meses
      // negativos separados por um positivo não são "2 ciclos consecutivos".
      let ciclosNegativos = 0;
      for (const m of meses) {
        const lanc = porMes.get(`${pousadaId}|${m}`) ?? [];
        if (lanc.length === 0) break;
        const mg = calcularMargem(lanc, ehPagante ? infraPorTenant : 0);
        if (mg.margemCentavos < 0) ciclosNegativos += 1;
        else break;
      }

      linhas.push({ pousadaId, nome: meta.nome, plano: meta.plano, status: meta.status, margem, ciclosNegativos });
    }

    // Pior margem primeiro: o painel existe para mostrar problema, não para
    // ser folheado até achar um.
    linhas.sort((a, b) => a.margem.margemCentavos - b.margem.margemCentavos);

    const receita = linhas.reduce((s, l) => s + l.margem.receitaCentavos, 0);
    const custo = linhas.reduce((s, l) => s + l.margem.custoCentavos, 0);

    return {
      competencia,
      infraTotalCentavos: infraTotal,
      infraPorTenantCentavos: infraPorTenant,
      tenantsPagantes: pagantes.length,
      linhas,
      totais: {
        receitaCentavos: receita,
        custoCentavos: custo,
        margemCentavos: receita - custo,
        margemPercentual: receita > 0 ? Math.round(((receita - custo) / receita) * 1000) / 10 : null,
      },
    };
  }

  /** Lançamentos de um tenant num mês — a auditoria de "de onde veio esse número". */
  static async lancamentosDoTenant(pousadaId: number, competencia: string) {
    const { rows } = await db.execute(sql`
      SELECT categoria, valor_centavos, moeda, estimado, descricao, referencia_externa, created_at
      FROM financeiro_lancamentos
      WHERE pousada_id = ${pousadaId} AND competencia = ${competencia}
      ORDER BY created_at DESC
    `);
    return rows;
  }
}

export default FinanceiroModel;
