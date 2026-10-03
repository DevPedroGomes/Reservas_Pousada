import { Router, Request, Response } from 'express';
import express from 'express';
import type Stripe from 'stripe';
import { db, type Executor } from '../db/index.js';
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
 *
 * Duas garantias de entrega:
 *
 * 1. Atomicidade. O registro do evento (idempotência) e os efeitos dele entram
 *    na MESMA transação. Antes o evento era marcado como processado primeiro;
 *    se o efeito falhasse, o reenvio do Stripe era tratado como duplicado e o
 *    evento nunca era aplicado — cliente pagava e continuava bloqueado.
 *
 * 2. Ordem. O Stripe não garante ordem de entrega. Um `subscription.updated`
 *    antigo chegando depois de um novo sobrescrevia o estado com dado velho.
 *    Por isso a assinatura é sempre relida da API no momento do processamento:
 *    qualquer evento aplica o estado ATUAL, não o do payload.
 */

/** Status do Stripe → o nosso. Desconhecido vira inadimplente, não ativo. */
export function traduzirStatus(s: Stripe.Subscription.Status): StatusAssinatura {
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

function idDe(v: string | { id: string } | null | undefined): string | undefined {
  return typeof v === 'string' ? v : v?.id;
}

/**
 * Id da assinatura de uma fatura. Nas versões novas da API ele fica em
 * `parent.subscription_details.subscription`; nas antigas, em `subscription`.
 */
export function assinaturaDaFatura(fatura: Stripe.Invoice): string | undefined {
  const nova = (fatura as unknown as {
    parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null;
  }).parent?.subscription_details?.subscription;
  const antiga = (fatura as unknown as { subscription?: string | { id: string } | null }).subscription;
  return idDe(nova ?? antiga ?? undefined);
}

export interface TaxaDaFatura {
  centavos: number;
  estimado: boolean;
}

/**
 * Taxa real cobrada pelo Stripe nesta fatura.
 *
 * Lê a `balance_transaction`, que é o número que o Stripe efetivamente
 * descontou — não uma estimativa a partir de um percentual de tabela. Taxa
 * varia por bandeira, parcelamento e meio de pagamento; estimar aqui seria
 * inventar o custo que o painel de margem existe justamente para medir.
 *
 * Só cai na estimativa quando o Stripe não expõe o encargo, e nesse caso o
 * lançamento vai marcado como estimado.
 */
async function taxaRealDaFatura(fatura: Stripe.Invoice): Promise<TaxaDaFatura> {
  try {
    // API atual: os pagamentos da fatura ficam em InvoicePayments.
    let paymentIntentId: string | undefined;
    let chargeId: string | undefined;
    if (fatura.id) {
      const pagamentos = await stripe().invoicePayments.list({ invoice: fatura.id, limit: 5 });
      const pago = pagamentos.data.find((p) => p.status === 'paid') ?? pagamentos.data[0];
      paymentIntentId = idDe(pago?.payment?.payment_intent as string | { id: string } | undefined);
      chargeId = idDe(pago?.payment?.charge as string | { id: string } | undefined);
    }
    // Versões antigas: direto na fatura.
    const legado = fatura as unknown as { charge?: string | { id: string }; payment_intent?: string | { id: string } };
    paymentIntentId ??= idDe(legado.payment_intent);
    chargeId ??= idDe(legado.charge);

    if (paymentIntentId) {
      const pi = await stripe().paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge.balance_transaction'] });
      const charge = pi.latest_charge as unknown as { balance_transaction?: { fee?: number } } | null;
      if (typeof charge?.balance_transaction?.fee === 'number') {
        return { centavos: charge.balance_transaction.fee, estimado: false };
      }
    }
    if (chargeId) {
      const charge = await stripe().charges.retrieve(chargeId, { expand: ['balance_transaction'] });
      const bt = charge.balance_transaction as unknown as { fee?: number } | null;
      if (typeof bt?.fee === 'number') return { centavos: bt.fee, estimado: false };
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
 * Leituras feitas na API do Stripe durante o processamento. Isoladas numa
 * interface para os testes substituírem a rede por dados controlados.
 */
export interface LeituraStripe {
  assinatura(id: string): Promise<Stripe.Subscription>;
  taxaDaFatura(fatura: Stripe.Invoice): Promise<TaxaDaFatura>;
}

const leituraReal: LeituraStripe = {
  assinatura: (id) => stripe().subscriptions.retrieve(id),
  taxaDaFatura: taxaRealDaFatura,
};

type Efeito = (tx: Executor) => Promise<void>;

/**
 * Aplica o estado atual de uma assinatura do Stripe à linha local.
 *
 * Proteção contra assinatura paralela: se o customer tiver uma assinatura
 * corrente diferente desta, só um estado ATIVO desta substitui a corrente.
 * Sem isso, o cancelamento (ou a expiração de um checkout abandonado) de uma
 * segunda assinatura derrubava o acesso de quem continua pagando a primeira.
 */
async function aplicarAssinatura(sub: Stripe.Subscription, tx: Executor): Promise<void> {
  const customerId = idDe(sub.customer as string | { id: string });
  if (!customerId) {
    console.error('[Stripe] assinatura sem customer:', sub.id);
    return;
  }

  const local = await AssinaturaModel.buscarPorCustomer(customerId, tx);
  if (!local) {
    // Customer que não bate com nenhuma pousada: conta criada fora do nosso
    // fluxo, ou ambiente trocado (chave de teste contra banco de produção).
    console.error(`[Stripe] customer ${customerId} não corresponde a nenhuma assinatura local`);
    return;
  }

  const status = traduzirStatus(sub.status);
  if (local.stripeSubscriptionId && local.stripeSubscriptionId !== sub.id && status !== 'ativa') {
    console.warn(
      `[Stripe] ignorando ${sub.id} (${sub.status}): a assinatura corrente da pousada ${local.pousadaId} é ${local.stripeSubscriptionId}`,
    );
    return;
  }

  const meta = sub.metadata ?? {};
  const derivado = pelaPrice(sub.items?.data?.[0]?.price?.id);
  const plano = (CODIGOS_PLANO as readonly string[]).includes(meta.plano)
    ? (meta.plano as CodigoPlano)
    : derivado.plano;
  const ciclo = meta.ciclo === 'mensal' || meta.ciclo === 'anual' ? meta.ciclo : derivado.ciclo;

  await AssinaturaModel.aplicarDoStripe({
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    status,
    plano,
    ciclo,
    periodoTerminaEm: fimDoPeriodo(sub),
    cancelaNoFim: Boolean(sub.cancel_at_period_end),
  }, tx);
}

/**
 * Lança receita e custo de uma fatura paga.
 *
 * A competência sai do PERÍODO da fatura, não da data do pagamento: uma fatura
 * de julho paga em agosto pertence a julho, senão a margem mensal fica torta.
 */
async function registrarFaturaPaga(fatura: Stripe.Invoice, taxa: TaxaDaFatura, tx: Executor): Promise<void> {
  const customerId = idDe(fatura.customer as string | { id: string } | null);
  if (!customerId || !fatura.id) return;

  const assinatura = await AssinaturaModel.buscarPorCustomer(customerId, tx);
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
  if (pago <= 0) return;

  await FinanceiroModel.registrar({
    pousadaId: assinatura.pousadaId,
    competencia,
    categoria: 'receita_assinatura',
    valorCentavos: pago,
    moeda: fatura.currency ?? 'brl',
    descricao: `Fatura ${fatura.number ?? fatura.id}`,
    referenciaExterna: fatura.id,
  }, tx);

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
    }, tx);
  }
}

/**
 * Faz as leituras externas do evento e devolve os efeitos a aplicar no banco.
 *
 * Separado da transação de propósito: chamada de rede dentro de transação
 * prende uma conexão do pool enquanto o Stripe responde.
 */
async function prepararEfeitos(evento: Stripe.Event, leitura: LeituraStripe): Promise<Efeito[]> {
  switch (evento.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = await leitura.assinatura((evento.data.object as Stripe.Subscription).id);
      return [(tx) => aplicarAssinatura(sub, tx)];
    }

    case 'checkout.session.completed': {
      // Grava o estado sem esperar o evento de subscription, que pode chegar depois.
      const sessao = evento.data.object as Stripe.Checkout.Session;
      const subId = idDe(sessao.subscription as string | { id: string } | null);
      if (!subId) return [];
      const sub = await leitura.assinatura(subId);
      return [(tx) => aplicarAssinatura(sub, tx)];
    }

    case 'invoice.payment_failed':
    case 'invoice.paid': {
      // O status vem do objeto de assinatura, não da fatura — a fatura conta
      // sobre uma cobrança, a assinatura conta sobre o direito de acesso.
      const fatura = evento.data.object as Stripe.Invoice;
      const efeitos: Efeito[] = [];
      const subId = assinaturaDaFatura(fatura);
      if (subId) {
        const sub = await leitura.assinatura(subId);
        efeitos.push((tx) => aplicarAssinatura(sub, tx));
      }
      if (evento.type === 'invoice.paid' && (fatura.amount_paid ?? 0) > 0) {
        const taxa = await leitura.taxaDaFatura(fatura);
        efeitos.push((tx) => registrarFaturaPaga(fatura, taxa, tx));
      }
      return efeitos;
    }

    default:
      // Evento que não nos interessa. Ainda é registrado (e respondido com 2xx),
      // senão o Stripe fica reenviando e acaba desabilitando o endpoint.
      return [];
  }
}

/**
 * Processa um evento já verificado. Exportado para os testes.
 *
 * Devolve 'duplicado' quando o evento já tinha sido aplicado. Lança em
 * qualquer falha — e nesse caso NADA foi gravado, nem o registro do evento,
 * então o reenvio do Stripe processa de novo do zero.
 */
export async function processarEvento(
  evento: Stripe.Event,
  leitura: LeituraStripe = leituraReal,
): Promise<'processado' | 'duplicado'> {
  const efeitos = await prepararEfeitos(evento, leitura);

  return db.transaction(async (tx) => {
    const novo = await AssinaturaModel.registrarEvento(evento.id, evento.type, tx);
    if (!novo) return 'duplicado' as const;
    for (const efeito of efeitos) {
      await efeito(tx);
    }
    return 'processado' as const;
  });
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
    // Atalho barato: evento já aplicado não precisa nem consultar a API do
    // Stripe. A garantia de verdade é o insert dentro da transação.
    if (await AssinaturaModel.eventoJaProcessado(evento.id)) {
      return res.json({ recebido: true, duplicado: true });
    }
    const resultado = await processarEvento(evento);
    res.json({ recebido: true, duplicado: resultado === 'duplicado' });
  } catch (err) {
    // 500 faz o Stripe reenviar — é o que queremos numa falha transitória.
    console.error(`[Stripe] falha ao processar ${evento.type} (${evento.id}):`, err);
    res.status(500).json({ recebido: false });
  }
});

export default router;
