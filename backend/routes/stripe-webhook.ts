import { Router, Request, Response } from 'express';
import express from 'express';
import type Stripe from 'stripe';
import AssinaturaModel from '../models/Assinatura.js';
import { stripe, segredoDoWebhook } from '../lib/stripe.js';
import { CODIGOS_PLANO, stripePriceId, type Ciclo, type CodigoPlano } from '../config/planos.js';
import type { StatusAssinatura } from '../utils/assinatura.js';
import FinanceiroModel from '../models/Financeiro.js';
import { competenciaDe } from '../utils/margem.js';
import { TIMEZONE } from '../utils/datas.js';

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

/**
 * Taxa real cobrada pelo Stripe nesta fatura.
 *
 * Lê a `balance_transaction`, que é o número que o Stripe efetivamente
 * descontou — não uma estimativa a partir de um percentual de tabela. Taxa
 * varia por bandeira, parcelamento e meio de pagamento; estimar aqui seria
 * inventar o custo que este painel existe justamente para medir.
 *
 * Só cai na estimativa quando o Stripe não expõe o encargo (o formato mudou
 * entre versões da API), e nesse caso o lançamento vai marcado como estimado.
 */
async function taxaDaFatura(fatura: Stripe.Invoice): Promise<{ centavos: number; estimado: boolean }> {
  const bruto = fatura as unknown as {
    charge?: string | { id: string };
    payment_intent?: string | { id: string };
  };

  try {
    const chargeId = typeof bruto.charge === 'string' ? bruto.charge : bruto.charge?.id;
    if (chargeId) {
      const charge = await stripe().charges.retrieve(chargeId, { expand: ['balance_transaction'] });
      const bt = charge.balance_transaction as unknown as { fee?: number } | null;
      if (typeof bt?.fee === 'number') return { centavos: bt.fee, estimado: false };
    }

    const piId = typeof bruto.payment_intent === 'string' ? bruto.payment_intent : bruto.payment_intent?.id;
    if (piId) {
      const pi = await stripe().paymentIntents.retrieve(piId, { expand: ['latest_charge.balance_transaction'] });
      const charge = pi.latest_charge as unknown as { balance_transaction?: { fee?: number } } | null;
      if (typeof charge?.balance_transaction?.fee === 'number') {
        return { centavos: charge.balance_transaction.fee, estimado: false };
      }
    }
  } catch (err) {
    console.warn('[Stripe] não foi possível ler a taxa real da fatura:', err instanceof Error ? err.message : err);
  }

  // Estimativa, marcada como tal. Percentual e fixo vêm do ambiente para que
  // ninguém precise editar código quando a tarifa mudar.
  const pct = Number(process.env.STRIPE_TAXA_PERCENTUAL ?? '3.99');
  const fixo = Number(process.env.STRIPE_TAXA_FIXA_CENTAVOS ?? '39');
  const pago = fatura.amount_paid ?? 0;
  return { centavos: Math.round((pago * pct) / 100 + fixo), estimado: true };
}

/**
 * Lança receita e custo de uma fatura paga.
 *
 * A competência sai do PERÍODO da fatura, não da data do pagamento: uma fatura
 * de julho paga em agosto pertence a julho, senão a margem mensal fica torta.
 */
async function registrarFaturaPaga(fatura: Stripe.Invoice) {
  const customerId = typeof fatura.customer === 'string' ? fatura.customer : fatura.customer?.id;
  if (!customerId || !fatura.id) return;

  const assinatura = await AssinaturaModel.buscarPorCustomer(customerId);
  if (!assinatura) {
    console.error(`[Stripe] fatura ${fatura.id} de customer ${customerId} sem pousada correspondente`);
    return;
  }

  const inicioPeriodo =
    (fatura.lines?.data?.[0] as unknown as { period?: { start?: number } } | undefined)?.period?.start ??
    (fatura as unknown as { period_start?: number }).period_start ??
    fatura.created;
  const competencia = competenciaDe(new Date((inicioPeriodo ?? 0) * 1000), TIMEZONE);

  const pago = fatura.amount_paid ?? 0;
  if (pago > 0) {
    await FinanceiroModel.registrar({
      pousadaId: assinatura.pousadaId,
      competencia,
      categoria: 'receita_assinatura',
      valorCentavos: pago,
      moeda: fatura.currency ?? 'brl',
      descricao: `Fatura ${fatura.number ?? fatura.id}`,
      referenciaExterna: fatura.id,
    });

    const taxa = await taxaDaFatura(fatura);
    if (taxa.centavos > 0) {
      await FinanceiroModel.registrar({
        pousadaId: assinatura.pousadaId,
        competencia,
        categoria: 'taxa_stripe',
        valorCentavos: taxa.centavos,
        moeda: fatura.currency ?? 'brl',
        estimado: taxa.estimado,
        descricao: taxa.estimado ? 'Taxa estimada do Stripe' : 'Taxa cobrada pelo Stripe',
        referenciaExterna: fatura.id,
      });
    }
  }
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
        if (evento.type === 'invoice.paid') {
          await registrarFaturaPaga(fatura);
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
