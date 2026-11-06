/**
 * Reconciliação diária com o Stripe.
 *
 * O webhook é a via normal, mas pode se perder: endpoint desativado depois de
 * muitas falhas, evento não assinado no painel, janela de indisponibilidade. Sem
 * isto, uma assinatura `ativa` ficaria ativa para sempre, porque o acesso de quem
 * está ativo não depende de data nenhuma.
 *
 * Carregado por import dinâmico em lib/fila.ts: routes/stripe-webhook.ts importa
 * módulos que registram trabalhador na fila ao serem avaliados.
 */
import type Stripe from 'stripe';
import { pool } from '../db/index.js';
import { reportarErro } from '../lib/observabilidade.js';
import { billingHabilitado, stripe } from '../lib/stripe.js';
import { aplicarAssinaturaAgora } from '../routes/stripe-webhook.js';

type LerAssinatura = (id: string) => Promise<Stripe.Subscription>;
type Alertar = (erro: unknown, contexto: Record<string, unknown>) => void;

export async function reconciliarAssinaturas(
  ler: LerAssinatura = (id) => stripe().subscriptions.retrieve(id),
  alertar: Alertar = reportarErro,
): Promise<{ assinaturas: number; falhas: number }> {
  if (!billingHabilitado()) return { assinaturas: 0, falhas: 0 };

  // `cancelada` é estado final no Stripe: não há o que reaplicar.
  const { rows } = await pool.query<{ pousada_id: number; stripe_subscription_id: string }>(
    `SELECT pousada_id, stripe_subscription_id FROM assinaturas
      WHERE stripe_subscription_id IS NOT NULL AND status <> 'cancelada'`,
  );

  let falhas = 0;
  for (const linha of rows) {
    try {
      await aplicarAssinaturaAgora(await ler(linha.stripe_subscription_id));
    } catch (err) {
      falhas++;
      console.error(`[Stripe] reconciliação falhou para ${linha.stripe_subscription_id}:`, err);
      alertar(err, { job: 'reconciliar-stripe', assinatura: linha.stripe_subscription_id, pousadaId: linha.pousada_id });
    }
  }
  return { assinaturas: rows.length, falhas };
}
