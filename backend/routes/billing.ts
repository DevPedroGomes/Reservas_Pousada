import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import AssinaturaModel from '../models/Assinatura.js';
import PousadaModel from '../models/Pousada.js';
import AuditoriaModel from '../models/Auditoria.js';
import { requireOwner } from '../middleware/auth.js';
import { billingHabilitado, stripe } from '../lib/stripe.js';
import { PLANOS, ehCiclo, ehCodigoPlano, planosVendaveis, stripePriceId } from '../config/planos.js';
import { limitesVigentes, motivosParaNaoCaber, temAssinaturaViva } from '../utils/assinatura.js';
import { aplicarAssinaturaAgora } from './stripe-webhook.js';
import { urlDoApp } from '../utils/origens.js';
import { chaveDeRateLimit } from '../utils/rede.js';

const router = Router();

// Criar sessão no Stripe custa uma chamada externa. Limite estreito para que um
// clique repetido não vire dezenas de sessões abertas nem uma conta inflada.
const limiteDeSessao = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req: any) => req.user?.id || chaveDeRateLimit(req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  message: { sucesso: false, mensagem: 'Muitas tentativas. Tente novamente em alguns minutos.' },
});

function exigirBilling(res: Response): boolean {
  if (billingHabilitado()) return true;
  res.status(503).json({
    sucesso: false,
    codigo: 'BILLING_OFF',
    mensagem: 'Cobrança ainda não está ativa neste ambiente.',
  });
  return false;
}

/**
 * GET /api/billing/situacao
 * Estado da assinatura do tenant ativo. Base do banner de trial e da tela de
 * planos. Qualquer membro pode ler — quem não é dono precisa entender por que a
 * tela está bloqueada, mesmo sem poder resolver.
 */
router.get('/situacao', async (req: Request, res: Response) => {
  const pousadaId = req.user?.pousadaId;
  if (!pousadaId) {
    return res.status(403).json({ sucesso: false, mensagem: 'Pousada não configurada', needsOnboarding: true });
  }

  const situacao = await AssinaturaModel.situacao(pousadaId);
  if (!situacao) {
    return res.json({ sucesso: true, billingHabilitado: billingHabilitado(), assinatura: null });
  }

  res.json({
    sucesso: true,
    billingHabilitado: billingHabilitado(),
    assinatura: {
      status: situacao.estado.status,
      plano: situacao.estado.plano,
      planoNome: situacao.estado.plano ? PLANOS[situacao.estado.plano].nome : null,
      ciclo: situacao.ciclo,
      assinaturaViva: situacao.assinaturaViva,
      cancelaNoFim: situacao.cancelaNoFim,
      trialTerminaEm: situacao.estado.trialTerminaEm,
      periodoTerminaEm: situacao.estado.periodoTerminaEm,
      liberado: situacao.veredito.liberado,
      motivo: situacao.veredito.motivo,
      diasRestantes: situacao.veredito.liberado ? situacao.veredito.diasRestantes ?? null : 0,
    },
    limites: situacao.limites,
    uso: { usuarios: situacao.usuarios },
  });
});

/**
 * GET /api/billing/planos
 * Só os planos com Price configurado no ambiente — um plano sem Price não é
 * vendável, e mostrá-lo levaria o usuário a um checkout que falha.
 */
router.get('/planos', async (req: Request, res: Response) => {
  const ciclo = req.query.ciclo === 'anual' ? 'anual' : 'mensal';
  res.json({
    sucesso: true,
    ciclo,
    planos: planosVendaveis(ciclo).map((p) => ({
      codigo: p.codigo,
      nome: p.nome,
      precoCentavos: ciclo === 'anual' ? p.precoAnualCentavos : p.precoMensalCentavos,
      maxQuartos: p.maxQuartos,
      maxUsuarios: p.maxUsuarios,
      maxPousadas: p.maxPousadas,
      destaques: p.destaques,
    })),
  });
});

/**
 * POST /api/billing/checkout
 * Abre uma sessão de checkout do Stripe. Só o dono — é quem tem a relação
 * comercial e o cartão.
 */
router.post('/checkout', requireOwner, limiteDeSessao, async (req: Request, res: Response) => {
  if (!exigirBilling(res)) return;

  const pousadaId = req.user!.pousadaId;
  if (!pousadaId) {
    return res.status(403).json({ sucesso: false, mensagem: 'Pousada não configurada' });
  }

  const { plano, ciclo } = req.body ?? {};
  if (!ehCodigoPlano(plano) || !ehCiclo(ciclo)) {
    return res.status(400).json({ sucesso: false, mensagem: 'Plano ou ciclo inválido' });
  }

  const priceId = stripePriceId(plano, ciclo);
  if (!priceId) {
    return res.status(503).json({
      sucesso: false,
      mensagem: 'Este plano ainda não está disponível para contratação.',
    });
  }

  try {
    const [pousada, assinatura] = await Promise.all([
      PousadaModel.buscarPorId(pousadaId),
      AssinaturaModel.buscarPorPousada(pousadaId),
    ]);
    if (!pousada) {
      return res.status(404).json({ sucesso: false, mensagem: 'Pousada não encontrada' });
    }

    if (assinatura?.status === 'cortesia') {
      return res.status(409).json({ sucesso: false, mensagem: 'Esta conta é cortesia e não precisa de assinatura.' });
    }

    // Quem já assina troca de plano na assinatura existente. Um segundo
    // checkout criaria uma segunda assinatura: cobrança em dobro.
    if (assinatura && temAssinaturaViva(assinatura)) {
      return res.status(409).json({
        sucesso: false,
        codigo: 'BILLING_JA_ASSINA',
        mensagem: assinatura.status === 'ativa'
          ? 'Você já tem uma assinatura. Use "Mudar para este plano" para trocar.'
          : 'Sua assinatura tem um pagamento pendente. Regularize em "Gerenciar assinatura".',
        usarTrocaDePlano: assinatura.status === 'ativa',
      });
    }

    // Reaproveita o customer se já existe — criar um novo a cada checkout
    // espalharia o histórico de cobrança do mesmo cliente por vários registros
    // no Stripe.
    let customerId = assinatura?.stripeCustomerId ?? null;
    if (!customerId) {
      const customer = await stripe().customers.create({
        email: req.user!.email,
        name: pousada.nome,
        // Liga o registro do Stripe ao nosso tenant. É por aqui que o webhook
        // reencontra a pousada quando o Stripe avisa de uma cobrança.
        metadata: { pousada_id: String(pousadaId) },
      }, {
        // Dois cliques simultâneos geram a MESMA requisição: o Stripe devolve
        // o mesmo customer em vez de criar dois.
        idempotencyKey: `customer-pousada-${pousadaId}`,
      });
      await AssinaturaModel.vincularCustomer(pousadaId, customer.id);
      // Relê: se outra requisição venceu a corrida, vale o customer dela.
      customerId = (await AssinaturaModel.buscarPorPousada(pousadaId))?.stripeCustomerId ?? customer.id;
    }

    const appUrl = urlDoApp();
    // Mesma pousada + plano + ciclo no mesmo minuto = a mesma sessão. Impede
    // que um duplo clique abra duas sessões que, pagas, virariam duas
    // assinaturas.
    const janela = Math.floor(Date.now() / 60_000);
    const sessao = await stripe().checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      locale: 'pt-BR',
      // O trial de 14 dias já foi consumido antes do checkout (é nosso, sem
      // cartão), então aqui a cobrança começa imediatamente.
      subscription_data: { metadata: { pousada_id: String(pousadaId), plano, ciclo } },
      success_url: `${appUrl}/assinatura?status=sucesso`,
      cancel_url: `${appUrl}/assinatura?status=cancelado`,
    }, {
      idempotencyKey: `checkout-${pousadaId}-${plano}-${ciclo}-${janela}`,
    });

    AuditoriaModel.log(req.user!.id, 'checkout_iniciado', 'pousada', pousadaId, { plano, ciclo }, req.ip || null)
      .catch((e) => console.error('[Auditoria] checkout:', e.message));

    res.json({ sucesso: true, url: sessao.url });
  } catch (err) {
    console.error('[Billing] falha ao criar checkout:', err);
    res.status(502).json({ sucesso: false, mensagem: 'Não foi possível iniciar o pagamento. Tente novamente.' });
  }
});

/**
 * POST /api/billing/trocar-plano
 * Troca o plano (ou o ciclo) da assinatura existente, com pró-rata do Stripe.
 * Só o dono. Downgrade que deixaria a conta acima dos limites é recusado com
 * o motivo — melhor que aceitar e bloquear a operação no dia seguinte.
 */
router.post('/trocar-plano', requireOwner, limiteDeSessao, async (req: Request, res: Response) => {
  if (!exigirBilling(res)) return;

  const pousadaId = req.user!.pousadaId;
  if (!pousadaId) {
    return res.status(403).json({ sucesso: false, mensagem: 'Pousada não configurada' });
  }

  const { plano, ciclo } = req.body ?? {};
  if (!ehCodigoPlano(plano) || !ehCiclo(ciclo)) {
    return res.status(400).json({ sucesso: false, mensagem: 'Plano ou ciclo inválido' });
  }
  const priceId = stripePriceId(plano, ciclo);
  if (!priceId) {
    return res.status(503).json({ sucesso: false, mensagem: 'Este plano ainda não está disponível para contratação.' });
  }

  const [assinatura, pousada, situacao] = await Promise.all([
    AssinaturaModel.buscarPorPousada(pousadaId),
    PousadaModel.buscarPorId(pousadaId),
    AssinaturaModel.situacao(pousadaId),
  ]);
  if (!assinatura?.stripeSubscriptionId || assinatura.status !== 'ativa') {
    return res.status(409).json({
      sucesso: false,
      mensagem: assinatura?.status === 'inadimplente'
        ? 'Regularize o pagamento em "Gerenciar assinatura" antes de trocar de plano.'
        : 'Não há assinatura ativa para trocar. Escolha um plano para assinar.',
    });
  }
  if (assinatura.plano === plano && assinatura.ciclo === ciclo) {
    return res.status(400).json({ sucesso: false, mensagem: 'Este já é o seu plano atual.' });
  }

  const motivos = motivosParaNaoCaber(
    { quartos: pousada?.numQuartos ?? 0, usuarios: situacao?.usuarios ?? 0, pousadas: situacao?.pousadasDoDono || 1 },
    limitesVigentes({ status: 'ativa', plano }),
  );
  if (motivos.length > 0) {
    return res.status(409).json({
      sucesso: false,
      codigo: 'BILLING_NAO_CABE',
      mensagem: `Não é possível mudar para o plano ${PLANOS[plano].nome}: ${motivos.join('; ')}.`,
    });
  }

  try {
    const atual = await stripe().subscriptions.retrieve(assinatura.stripeSubscriptionId);
    const item = atual.items.data[0];
    if (!item) throw new Error(`assinatura ${atual.id} sem item`);

    const atualizada = await stripe().subscriptions.update(atual.id, {
      items: [{ id: item.id, price: priceId }],
      // Cobra/credita a diferença proporcional. Trocar mensal<->anual faz o
      // Stripe faturar na hora, como esperado.
      proration_behavior: 'create_prorations',
      metadata: { pousada_id: String(pousadaId), plano, ciclo },
    });

    // A tela reflete na hora; o webhook que chegar depois reaplica o mesmo.
    await aplicarAssinaturaAgora(atualizada);

    AuditoriaModel.log(req.user!.id, 'plano_trocado', 'pousada', pousadaId, {
      de: { plano: assinatura.plano, ciclo: assinatura.ciclo }, para: { plano, ciclo },
    }, req.ip || null).catch((e) => console.error('[Auditoria] troca de plano:', e.message));

    res.json({ sucesso: true, mensagem: `Plano alterado para ${PLANOS[plano].nome}.` });
  } catch (err) {
    console.error('[Billing] falha ao trocar plano:', err);
    res.status(502).json({ sucesso: false, mensagem: 'Não foi possível trocar o plano agora. Tente novamente.' });
  }
});

/**
 * POST /api/billing/portal
 * Portal do Stripe: trocar cartão, ver faturas, cancelar. Existe para que o
 * dono resolva sozinho o que senão viraria suporte manual.
 */
router.post('/portal', requireOwner, limiteDeSessao, async (req: Request, res: Response) => {
  if (!exigirBilling(res)) return;

  const pousadaId = req.user!.pousadaId;
  const assinatura = pousadaId ? await AssinaturaModel.buscarPorPousada(pousadaId) : null;
  if (!assinatura?.stripeCustomerId) {
    return res.status(409).json({
      sucesso: false,
      mensagem: 'Nenhuma assinatura encontrada para gerenciar.',
    });
  }

  try {
    const sessao = await stripe().billingPortal.sessions.create({
      customer: assinatura.stripeCustomerId,
      return_url: `${urlDoApp()}/assinatura`,
    });
    res.json({ sucesso: true, url: sessao.url });
  } catch (err) {
    console.error('[Billing] falha ao abrir portal:', err);
    res.status(502).json({ sucesso: false, mensagem: 'Não foi possível abrir o portal de assinatura.' });
  }
});

export default router;
