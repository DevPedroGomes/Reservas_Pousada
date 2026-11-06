import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, assinaturas, quartos, stripeEvents, userPousadas, type Executor } from '../db/index.js';
import { DIAS_DE_TRIAL, type Ciclo, type CodigoPlano } from '../config/planos.js';
import {
  avaliarAcessoComUso,
  limitesVigentes,
  temAssinaturaViva,
  type EstadoAssinatura,
  type Limites,
  type PousadaPossuida,
  type StatusAssinatura,
  type UsoAtual,
  type Veredito,
} from '../utils/assinatura.js';

const MS_POR_DIA = 24 * 60 * 60 * 1000;

export class AssinaturaModel {
  /**
   * Cria a assinatura em trial de uma pousada recém-criada.
   *
   * Recebe `tx` porque precisa acontecer na MESMA transação que cria a pousada:
   * uma pousada sem linha de assinatura é um tenant que o enforcement não sabe
   * avaliar, e o `ON CONFLICT DO NOTHING` cobre o caso de já existir.
   */
  static async criarTrial(pousadaId: number, executor: Pick<typeof db, 'insert'> = db) {
    const termina = new Date(Date.now() + DIAS_DE_TRIAL * MS_POR_DIA);
    await executor
      .insert(assinaturas)
      .values({ pousadaId, status: 'trial', trialTerminaEm: termina })
      .onConflictDoNothing();
  }

  /**
   * Linha de assinatura de uma pousada extra, coberta pela pagadora (Rede).
   * Sem trial próprio de propósito: se a cobertura acabar, ela fica bloqueada
   * em vez de ganhar 14 dias grátis.
   */
  static async criarCoberta(pousadaId: number, pagadoraId: number, executor: Pick<typeof db, 'insert'> = db) {
    await executor
      .insert(assinaturas)
      .values({ pousadaId, status: 'trial', trialTerminaEm: null, cobertaPorPousadaId: pagadoraId })
      .onConflictDoNothing();
  }

  /**
   * Assinatura que VALE para a pousada: a própria, ou a da pagadora quando a
   * pousada é coberta pelo plano Rede de outra.
   */
  static async efetiva(pousadaId: number, executor: Executor = db) {
    const propria = await this.buscarPorPousada(pousadaId, executor);
    if (!propria) return null;
    if (propria.cobertaPorPousadaId) {
      const pagadora = await this.buscarPorPousada(propria.cobertaPorPousadaId, executor);
      // Pagadora sumiu (ON DELETE SET NULL ainda não rodou): vale a própria.
      if (pagadora && !pagadora.cobertaPorPousadaId) {
        return { row: pagadora, propria, pagadoraId: pagadora.pousadaId };
      }
    }
    return { row: propria, propria, pagadoraId: pousadaId };
  }

  /** Quantas pousadas a assinatura desta pagadora cobre, contando ela mesma. */
  static async pousadasCobertas(pagadoraId: number, executor: Executor = db): Promise<number> {
    const [{ n }] = await executor
      .select({ n: sql<number>`count(*)::int` })
      .from(assinaturas)
      .where(eq(assinaturas.cobertaPorPousadaId, pagadoraId));
    return 1 + (Number(n) || 0);
  }

  /** Pousadas de que o usuário é DONO, com o estado de assinatura de cada uma. */
  static async possuidasPor(userId: string, executor: Executor = db): Promise<PousadaPossuida[]> {
    const rows = await executor
      .select({
        pousadaId: userPousadas.pousadaId,
        status: assinaturas.status,
        plano: assinaturas.plano,
        trialTerminaEm: assinaturas.trialTerminaEm,
        periodoTerminaEm: assinaturas.periodoTerminaEm,
        inadimplenteDesde: assinaturas.inadimplenteDesde,
        cancelaNoFim: assinaturas.cancelaNoFim,
        disputaStatus: assinaturas.disputaStatus,
        cobertaPor: assinaturas.cobertaPorPousadaId,
      })
      .from(userPousadas)
      .innerJoin(assinaturas, eq(assinaturas.pousadaId, userPousadas.pousadaId))
      .where(and(eq(userPousadas.userId, userId), eq(userPousadas.isOwner, true)));

    return rows.map((r) => ({
      pousadaId: r.pousadaId,
      estado: this.paraEstado(r),
      cobertaPor: r.cobertaPor,
    }));
  }

  static async buscarPorPousada(pousadaId: number, executor: Executor = db) {
    const [row] = await executor
      .select()
      .from(assinaturas)
      .where(eq(assinaturas.pousadaId, pousadaId))
      .limit(1);
    return row ?? null;
  }

  static async buscarPorCustomer(stripeCustomerId: string, executor: Executor = db) {
    const [row] = await executor
      .select()
      .from(assinaturas)
      .where(eq(assinaturas.stripeCustomerId, stripeCustomerId))
      .limit(1);
    return row ?? null;
  }

  /** Converte a linha do banco no estado que a lógica pura entende. */
  static paraEstado(row: {
    status: string;
    plano: string | null;
    trialTerminaEm: Date | null;
    periodoTerminaEm: Date | null;
    inadimplenteDesde: Date | null;
    cancelaNoFim: boolean;
    disputaStatus: string | null;
  }): EstadoAssinatura {
    return {
      status: row.status as StatusAssinatura,
      plano: (row.plano as CodigoPlano | null) ?? null,
      trialTerminaEm: row.trialTerminaEm,
      periodoTerminaEm: row.periodoTerminaEm,
      inadimplenteDesde: row.inadimplenteDesde,
      cancelaNoFim: row.cancelaNoFim,
      emDisputa: row.disputaStatus !== null,
    };
  }

  /**
   * Situação completa de um tenant: se pode usar, com que limites e quanto já
   * consumiu deles. É o que a tela de assinatura mostra e o que o middleware
   * usa para decidir.
   */
  /** O evento já foi processado? Checagem barata antes de chamar a API do Stripe. */
  static async eventoJaProcessado(id: string): Promise<boolean> {
    const [row] = await db
      .select({ id: stripeEvents.id })
      .from(stripeEvents)
      .where(eq(stripeEvents.id, id))
      .limit(1);
    return Boolean(row);
  }

  /** O que a pousada consome hoje dos limites do plano que a cobre. */
  static async usoDaPousada(pousadaId: number, pagadoraId: number): Promise<UsoAtual> {
    const [[{ n: quartosAtivos }], [{ n: usuarios }], pousadas] = await Promise.all([
      db.select({ n: sql<number>`count(*)::int` }).from(quartos).where(and(eq(quartos.pousadaId, pousadaId), eq(quartos.ativo, true))),
      db.select({ n: sql<number>`count(*)::int` }).from(userPousadas).where(eq(userPousadas.pousadaId, pousadaId)),
      this.pousadasCobertas(pagadoraId),
    ]);
    return { quartos: Number(quartosAtivos) || 0, usuarios: Number(usuarios) || 0, pousadas };
  }

  /**
   * A pousada pode operar agora? Pagamento e uso diante do plano. É a decisão de
   * todos os pontos que entregam produto. null = pousada sem linha de assinatura.
   */
  static async vereditoDaPousada(pousadaId: number): Promise<Veredito | null> {
    const efetiva = await this.efetiva(pousadaId);
    if (!efetiva) return null;
    return avaliarAcessoComUso(this.paraEstado(efetiva.row), await this.usoDaPousada(pousadaId, efetiva.pagadoraId));
  }

  static async situacao(pousadaId: number): Promise<{
    estado: EstadoAssinatura;
    veredito: Veredito;
    limites: Limites;
    quartos: number;
    usuarios: number;
    pousadasDoDono: number;
    ciclo: string | null;
    assinaturaViva: boolean;
    cancelaNoFim: boolean;
    /** Id da pousada pagadora quando esta é coberta pelo Rede de outra. */
    cobertaPor: number | null;
  } | null> {
    const efetiva = await this.efetiva(pousadaId);
    if (!efetiva) return null;
    const { row, pagadoraId } = efetiva;

    const estado = this.paraEstado(row);
    const uso = await this.usoDaPousada(pousadaId, pagadoraId);

    return {
      estado,
      veredito: avaliarAcessoComUso(estado, uso),
      limites: limitesVigentes(estado),
      quartos: uso.quartos,
      usuarios: uso.usuarios,
      pousadasDoDono: uso.pousadas,
      cobertaPor: pagadoraId !== pousadaId ? pagadoraId : null,
      ciclo: row.ciclo,
      assinaturaViva: temAssinaturaViva(row),
      cancelaNoFim: row.cancelaNoFim,
    };
  }

  /**
   * Liga o customer do Stripe à pousada — só se ainda não houver um. Dois
   * cliques simultâneos não podem trocar o customer de quem já tem histórico.
   */
  static async vincularCustomer(pousadaId: number, stripeCustomerId: string) {
    await db
      .update(assinaturas)
      .set({ stripeCustomerId, updatedAt: new Date() })
      .where(and(eq(assinaturas.pousadaId, pousadaId), isNull(assinaturas.stripeCustomerId)));
  }

  /**
   * Aplica o que o Stripe disse sobre a assinatura.
   *
   * O Stripe é a autoridade sobre status e período — nunca inferimos isso a
   * partir de um retorno de checkout no navegador, que é forjável e pode nem
   * chegar. Só o webhook assinado escreve aqui.
   */
  static async aplicarDoStripe(params: {
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    status: StatusAssinatura;
    plano: CodigoPlano | null;
    ciclo: Ciclo | null;
    periodoTerminaEm: Date | null;
    cancelaNoFim: boolean;
  }, executor: Executor = db): Promise<boolean> {
    const r = await executor
      .update(assinaturas)
      .set({
        stripeSubscriptionId: params.stripeSubscriptionId,
        status: params.status,
        plano: params.plano,
        ciclo: params.ciclo,
        periodoTerminaEm: params.periodoTerminaEm,
        cancelaNoFim: params.cancelaNoFim,
        // Guarda a PRIMEIRA falha: as retentativas do Stripe não renovam a carência.
        inadimplenteDesde: params.status === 'inadimplente'
          ? sql`COALESCE(${assinaturas.inadimplenteDesde}, now())`
          : null,
        updatedAt: new Date(),
      })
      .where(eq(assinaturas.stripeCustomerId, params.stripeCustomerId));
    return (r.rowCount ?? 0) > 0;
  }

  /** Abre, encerra ou marca como perdida a contestação de pagamento do customer. */
  static async definirDisputa(stripeCustomerId: string, disputaStatus: 'aberta' | 'perdida' | null, executor: Executor = db) {
    await executor
      .update(assinaturas)
      .set({ disputaStatus, updatedAt: new Date() })
      .where(eq(assinaturas.stripeCustomerId, stripeCustomerId));
  }

  /** Nova fatura paga regulariza uma contestação perdida, nunca uma ainda em aberto. */
  static async regularizarDisputaPerdida(stripeCustomerId: string, executor: Executor = db) {
    await executor
      .update(assinaturas)
      .set({ disputaStatus: null, updatedAt: new Date() })
      .where(and(eq(assinaturas.stripeCustomerId, stripeCustomerId), eq(assinaturas.disputaStatus, 'perdida')));
  }

  /**
   * Registra um evento do Stripe. Devolve false se já tinha sido processado.
   *
   * O Stripe reenvia até receber 2xx e pode entregar o mesmo evento mais de uma
   * vez após o sucesso; sem esta checagem, um retry de `invoice.paid`
   * reprocessaria a mesma cobrança.
   *
   * Deve rodar NA MESMA transação dos efeitos do evento. Registrado sozinho,
   * antes dos efeitos, uma falha no meio fazia o reenvio do Stripe ser tratado
   * como duplicado — e o evento nunca era aplicado.
   */
  static async registrarEvento(id: string, tipo: string, executor: Executor = db): Promise<boolean> {
    const r = await executor
      .insert(stripeEvents)
      .values({ id, tipo })
      .onConflictDoNothing()
      .returning({ id: stripeEvents.id });
    return r.length > 0;
  }
}

export default AssinaturaModel;
