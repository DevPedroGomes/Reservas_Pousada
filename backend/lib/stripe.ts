/**
 * Cliente do Stripe.
 *
 * Instanciado sob demanda, nunca no topo do módulo: `new Stripe(undefined)`
 * lança, e um throw em tempo de import derruba tudo que importar este arquivo —
 * inclusive o `tsc` e os testes, que não têm chave nenhuma. Este é o mesmo
 * gotcha que já documentamos para `next build`.
 */

import Stripe from 'stripe';

let cliente: Stripe | null = null;

/**
 * Billing está ligado?
 *
 * Exige as duas coisas: a flag explícita E a chave. A flag existe para que
 * ligar a cobrança seja uma decisão deliberada — sem ela, esquecer de definir
 * uma variável de ambiente viraria "todo mundo usa de graça" em silêncio, ou
 * pior, o inverso: um deploy sem chave derrubando o acesso de quem paga.
 */
export function billingHabilitado(): boolean {
  return process.env.BILLING_ENABLED === 'true' && Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function stripe(): Stripe {
  if (cliente) return cliente;

  const chave = process.env.STRIPE_SECRET_KEY?.trim();
  if (!chave) {
    throw new Error('STRIPE_SECRET_KEY não configurada');
  }

  // Sem `apiVersion` fixado de propósito: o SDK usa a versão com que foi
  // publicado, que é a que os tipos deste pacote descrevem. Fixar uma string de
  // data aqui faz os tipos e o comportamento do servidor divergirem no dia em
  // que o SDK for atualizado.
  cliente = new Stripe(chave);
  return cliente;
}

/** Segredo de assinatura do webhook (`whsec_...`). */
export function segredoDoWebhook(): string {
  const s = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!s) {
    throw new Error('STRIPE_WEBHOOK_SECRET não configurada');
  }
  return s;
}

/**
 * Aviso no boot. Billing desligado é um estado legítimo (é o estado atual), mas
 * precisa ser visível no log — não pode ser descoberto quando o primeiro
 * cliente não conseguir pagar.
 */
export function avisarEstadoDoBilling(): void {
  if (billingHabilitado()) {
    const modo = process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') ? 'PRODUÇÃO' : 'teste';
    console.log(`[Billing] habilitado — Stripe em modo ${modo}`);
    if (!process.env.STRIPE_WEBHOOK_SECRET?.trim()) {
      console.warn('[Billing] STRIPE_WEBHOOK_SECRET ausente — webhooks serão RECUSADOS');
    }
    return;
  }
  console.warn(
    '[Billing] DESABILITADO — nenhum limite de plano será aplicado. ' +
      'Defina BILLING_ENABLED=true e STRIPE_SECRET_KEY para ativar.',
  );
}
