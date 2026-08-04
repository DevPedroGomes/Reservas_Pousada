import { Request, Response, NextFunction } from 'express';
import AssinaturaModel from '../models/Assinatura.js';
import { billingHabilitado } from '../lib/stripe.js';
import { avaliarAcesso, limitesVigentes, mensagemDeBloqueio } from '../utils/assinatura.js';

/**
 * Exige assinatura em dia para usar a operação da pousada.
 *
 * Vai nas rotas que ENTREGAM o produto (reservas), não nas de configuração e
 * cobrança — quem está bloqueado precisa continuar conseguindo ver o próprio
 * estado e escolher um plano, senão o bloqueio vira uma porta trancada por
 * dentro.
 *
 * Com billing desligado é passagem livre, de propósito: a flag é o interruptor
 * de rollout, e o boot já grita no log quando está desligada.
 */
export async function requerAssinaturaAtiva(req: Request, res: Response, next: NextFunction) {
  if (!billingHabilitado()) return next();

  const pousadaId = req.user?.pousadaId;
  if (!pousadaId) return next(); // requirePousada já trata a ausência de tenant

  try {
    const row = await AssinaturaModel.buscarPorPousada(pousadaId);

    // Pousada sem linha de assinatura não deveria existir (a criação abre uma
    // na mesma transação). Se existir, é dado anterior ao billing — libera e
    // registra, porque bloquear um cliente por falha nossa de migração é pior
    // que o inverso.
    if (!row) {
      console.warn(`[Billing] pousada ${pousadaId} sem linha de assinatura — liberando`);
      return next();
    }

    const veredito = avaliarAcesso(AssinaturaModel.paraEstado(row));
    if (veredito.liberado) return next();

    return res.status(402).json({
      sucesso: false,
      codigo: 'BILLING_001',
      mensagem: mensagemDeBloqueio(veredito.motivo),
      motivo: veredito.motivo,
      precisaAssinar: true,
    });
  } catch (err) {
    // Falha ao consultar o próprio banco não pode derrubar o acesso de quem
    // paga. Erra para o lado de liberar e deixa rastro alto no log.
    console.error('[Billing] erro ao avaliar assinatura — liberando por segurança:', err);
    return next();
  }
}

/**
 * O plano comporta esse número de quartos?
 *
 * Chamado na criação e na edição da pousada. Devolve null quando cabe, ou a
 * mensagem de erro quando estoura.
 */
export async function excedeLimiteDeQuartos(
  pousadaId: number | null,
  numQuartos: number,
): Promise<string | null> {
  if (!billingHabilitado()) return null;

  const row = pousadaId ? await AssinaturaModel.buscarPorPousada(pousadaId) : null;
  const limites = limitesVigentes(
    row ? AssinaturaModel.paraEstado(row) : { status: 'trial', plano: null },
  );

  if (numQuartos > limites.maxQuartos) {
    return `Seu plano permite até ${limites.maxQuartos} quartos. Faça upgrade para cadastrar ${numQuartos}.`;
  }
  return null;
}

/**
 * Cabe mais um usuário na equipe?
 *
 * Conta os membros atuais da junction — é o número que o dono vê na tela, e
 * contar convites pendentes junto faria o limite parecer estourado antes de
 * alguém realmente entrar.
 */
export async function excedeLimiteDeUsuarios(pousadaId: number): Promise<string | null> {
  if (!billingHabilitado()) return null;

  const situacao = await AssinaturaModel.situacao(pousadaId);
  if (!situacao) return null;

  const max = situacao.limites.maxUsuarios;
  if (max !== null && situacao.usuarios >= max) {
    return `Seu plano permite até ${max} usuários. Faça upgrade para adicionar mais.`;
  }
  return null;
}
