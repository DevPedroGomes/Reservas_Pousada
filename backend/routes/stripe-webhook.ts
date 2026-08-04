import { Router, Request, Response } from 'express';
import express from 'express';
import type Stripe from 'stripe';
import AssinaturaModel from '../models/Assinatura.js';
import { stripe, segredoDoWebhook } from '../lib/stripe.js';
import { CODIGOS_PLANO, stripePriceId, type Ciclo, type CodigoPlano } from '../config/planos.js';
import type { StatusAssinatura } from '../utils/assinatura.js';

const router = Router();

/**
 * O Stripe é a autoridade sobre o estado da assinatura.
 *
 * Nada aqui confia no navegador: o retorno do checkout é forjável e pode nem
 * chegar (o usuário fecha a aba). Só este endpoint, com assinatura verificada,
 * escreve status e período.
 */

/** Status do Stripe → o nosso. Desconhecido vira inadimplente, não ativo. */
function traduzirStatus(s: Stripe.Subscription.Status): StatusAssinatura {
  switch (s) {
    case 'active':
    case 'trialing':
      return 'ativa';
    case 'past_due':
    case 'unpaid':
    case 'incomplete':
      return 'inadimplente';
    case 'canceled':
    case 'incomplete_expired':
      return 'cancelada';
    case 'paused':
      return 'suspensa';
    default:
      // Status novo que ainda não conhecemos: tratar como inadimplente mantém
      // o acesso durante a tolerância e evita conceder acesso por omissão.
      return 'inadimplente';
  }
}

/** Descobre plano e ciclo pelo id do Price, quando o metadata não veio. */
function pelaPrice(priceId: string | undefined): { plano: CodigoPlano | null; ciclo: Ciclo | null } {
  if (!priceId) return { plano: null, ciclo: null };
  for (const plano of CODIGOS_PLANO) {
    for (const ciclo of ['mensal', 'anual'] as Ciclo[]) {
      if (stripePriceId(plano, ciclo) === priceId) return { plano, ciclo };
    }
  }
  return { plano: null, ciclo: null };
}

/**
 * Fim do período atual.
 *
 * O Stripe moveu `current_period_end` do nível da assinatura para o do item.
 * Lemos os dois: qual existe depende da versão de API da conta, e errar aqui
 * significa calcular a tolerância de inadimplência sobre uma data nula.
 */
function fimDoPeriodo(sub: Stripe.Subscription): Date | null {
  const noTopo = (sub as unknown as { current_period_end?: number }).current_period_end;
  const noItem = sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined;
  const ts = noTopo ?? noItem?.current_period_end;
  return typeof ts === 'number' ? new Date(ts * 1000) : null;
}

async function aplicarAssinatura(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  if (!customerId) {
    console.error('[Stripe] assinatura sem customer:', sub.id);
    return;
  }

  const meta = sub.metadata ?? {};
  const priceId = sub.items?.data?.[0]?.price?.id;
  const derivado = pelaPrice(priceId);

  const plano = (CODIGOS_PLANO as readonly string[]).includes(meta.plano)
    ? (meta.plano as CodigoPlano)
    : derivado.plano;
  const ciclo = meta.ciclo === 'mensal' || meta.ciclo === 'anual' ? meta.ciclo : derivado.ciclo;

  const aplicou = await AssinaturaModel.aplicarDoStripe({
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    status: traduzirStatus(sub.status),
    plano,
    ciclo,
    periodoTerminaEm: fimDoPeriodo(sub),
    cancelaNoFim: Boolean(sub.cancel_at_period_end),
  });

  if (!aplicou) {
    // Customer que não bate com nenhuma pousada: conta criada fora do nosso
    // fluxo, ou ambiente trocado (chave de teste contra banco de produção).
    // Registrar alto — é silencioso e paga-se por isso.
    console.error(`[Stripe] customer ${customerId} não corresponde a nenhuma assinatura local`);
  }
}

/**
 * `express.raw` é obrigatório: a verificação de assinatura roda sobre os BYTES
 * exatos do corpo. Um `express.json()` antes disto reserializa o JSON, muda os
 * bytes e faz toda verificação falhar — é o erro nº 1 de integração com Stripe,
 * e por isso esta rota é montada ANTES do parser global em server.ts.
 */
router.post('/', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  const assinaturaHeader = req.headers['stripe-signature'];
  if (!assinaturaHeader || typeof assinaturaHeader !== 'string') {
    return res.status(400).send('assinatura ausente');
  }

  let evento: Stripe.Event;
  try {
    evento = stripe().webhooks.constructEvent(req.body as Buffer, assinaturaHeader, segredoDoWebhook());
  } catch (err) {
    // Assinatura inválida = requisição não veio do Stripe. 400 sem detalhe.
    console.error('[Stripe] assinatura de webhook inválida:', err instanceof Error ? err.message : err);
    return res.status(400).send('assinatura inválida');
  }

  try {
    // Idempotência antes de qualquer efeito: o Stripe reenvia até receber 2xx e
    // pode reentregar mesmo após sucesso.
    const novo = await AssinaturaModel.registrarEvento(evento.id, evento.type);
    if (!novo) {
      return res.json({ recebido: true, duplicado: true });
    }

    switch (evento.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await aplicarAssinatura(evento.data.object as Stripe.Subscription);
        break;

      case 'checkout.session.completed': {
        // Busca a assinatura recém-criada para gravar o estado sem esperar o
        // evento de subscription, que pode chegar depois.
        const sessao = evento.data.object as Stripe.Checkout.Session;
        const subId = typeof sessao.subscription === 'string' ? sessao.subscription : sessao.subscription?.id;
        if (subId) {
          await aplicarAssinatura(await stripe().subscriptions.retrieve(subId));
        }
        break;
      }

      case 'invoice.payment_failed':
      case 'invoice.paid': {
        // O status vem do objeto de assinatura, não da fatura — a fatura conta
        // sobre uma cobrança, a assinatura conta sobre o direito de acesso.
        const fatura = evento.data.object as Stripe.Invoice;
        const subId = (fatura as unknown as { subscription?: string | { id: string } }).subscription;
        const id = typeof subId === 'string' ? subId : subId?.id;
        if (id) {
          await aplicarAssinatura(await stripe().subscriptions.retrieve(id));
        }
        break;
      }

      default:
        // Evento que não nos interessa. 2xx mesmo assim, senão o Stripe fica
        // reenviando para sempre e acaba desabilitando o endpoint.
        break;
    }

    res.json({ recebido: true });
  } catch (err) {
    // 500 faz o Stripe reenviar — é o que queremos numa falha transitória.
    console.error(`[Stripe] falha ao processar ${evento.type} (${evento.id}):`, err);
    res.status(500).json({ recebido: false });
  }
});

export default router;
