import { eq, sql } from 'drizzle-orm';
import { db, assinaturas, stripeEvents, userPousadas } from '../db/index.js';
import { DIAS_DE_TRIAL, type Ciclo, type CodigoPlano } from '../config/planos.js';
import {
  avaliarAcesso,
  limitesVigentes,
  type EstadoAssinatura,
  type Limites,
  type StatusAssinatura,
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

  static async buscarPorPousada(pousadaId: number) {
    const [row] = await db
      .select()
      .from(assinaturas)
      .where(eq(assinaturas.pousadaId, pousadaId))
      .limit(1);
    return row ?? null;
  }

  static async buscarPorCustomer(stripeCustomerId: string) {
    const [row] = await db
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
  }): EstadoAssinatura {
    return {
      status: row.status as StatusAssinatura,
      plano: (row.plano as CodigoPlano | null) ?? null,
      trialTerminaEm: row.trialTerminaEm,
      periodoTerminaEm: row.periodoTerminaEm,
    };
  }

  /**
   * Situação completa de um tenant: se pode usar, com que limites e quanto já
   * consumiu deles. É o que a tela de assinatura mostra e o que o middleware
   * usa para decidir.
   */
  static async situacao(pousadaId: number): Promise<{
    estado: EstadoAssinatura;
    veredito: Veredito;
    limites: Limites;
    usuarios: number;
    pousadasDoDono: number;
  } | null> {
    const row = await this.buscarPorPousada(pousadaId);
    if (!row) return null;

    const estado = this.paraEstado(row);
    const [{ n: usuarios }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(userPousadas)
      .where(eq(userPousadas.pousadaId, pousadaId));

    return {
      estado,
      veredito: avaliarAcesso(estado),
      limites: limitesVigentes(estado),
      usuarios: Number(usuarios) || 0,
      pousadasDoDono: 0,
    };
  }

  static async vincularCustomer(pousadaId: number, stripeCustomerId: string) {
    await db
      .update(assinaturas)
      .set({ stripeCustomerId, updatedAt: new Date() })
      .where(eq(assinaturas.pousadaId, pousadaId));
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
  }): Promise<boolean> {
    const r = await db
      .update(assinaturas)
      .set({
        stripeSubscriptionId: params.stripeSubscriptionId,
        status: params.status,
        plano: params.plano,
        ciclo: params.ciclo,
        periodoTerminaEm: params.periodoTerminaEm,
        cancelaNoFim: params.cancelaNoFim,
        updatedAt: new Date(),
      })
      .where(eq(assinaturas.stripeCustomerId, params.stripeCustomerId));
    return (r.rowCount ?? 0) > 0;
  }

  /**
   * Registra um evento do Stripe. Devolve false se já tinha sido processado.
   *
   * O Stripe reenvia até receber 2xx e pode entregar o mesmo evento mais de uma
   * vez após o sucesso; sem esta checagem, um retry de `invoice.paid`
   * reprocessaria a mesma cobrança.
   */
  static async registrarEvento(id: string, tipo: string): Promise<boolean> {
    const r = await db
      .insert(stripeEvents)
      .values({ id, tipo })
      .onConflictDoNothing()
      .returning({ id: stripeEvents.id });
    return r.length > 0;
  }
}

export default AssinaturaModel;
