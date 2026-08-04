/**
 * Regras de acesso e limite — lógica pura, sem banco e sem Stripe.
 *
 * Fica separada de propósito: é a regra que decide se um cliente pagante
 * consegue ou não usar o sistema, e uma regra dessas precisa ser testável sem
 * subir Postgres nem falar com API externa. Todo o resto do billing é
 * encanamento em volta destas funções.
 */

import {
  DIAS_DE_TOLERANCIA,
  PLANOS,
  type CodigoPlano,
} from '../config/planos.js';

export const STATUS_ASSINATURA = [
  'trial',
  'ativa',
  'inadimplente',
  'suspensa',
  'cancelada',
  'cortesia',
] as const;
export type StatusAssinatura = (typeof STATUS_ASSINATURA)[number];

export interface EstadoAssinatura {
  status: StatusAssinatura;
  plano: CodigoPlano | null;
  trialTerminaEm: Date | null;
  periodoTerminaEm: Date | null;
}

export type MotivoLiberado = 'cortesia' | 'ativa' | 'trial' | 'tolerancia';
export type MotivoBloqueio =
  | 'trial_expirado'
  | 'tolerancia_esgotada'
  | 'suspensa'
  | 'cancelada';

export type Veredito =
  | { liberado: true; motivo: MotivoLiberado; diasRestantes?: number }
  | { liberado: false; motivo: MotivoBloqueio };

const MS_POR_DIA = 24 * 60 * 60 * 1000;

function diasAte(alvo: Date, agora: Date): number {
  return Math.ceil((alvo.getTime() - agora.getTime()) / MS_POR_DIA);
}

/**
 * O tenant pode usar o sistema agora?
 *
 * `inadimplente` continua liberado durante a tolerância: cartão expirado é o
 * motivo mais comum de falha de cobrança e não significa que o cliente quis
 * sair. Cortar no mesmo dia transforma um problema de cadastro em churn.
 */
export function avaliarAcesso(e: EstadoAssinatura, agora: Date = new Date()): Veredito {
  switch (e.status) {
    case 'cortesia':
      return { liberado: true, motivo: 'cortesia' };

    case 'ativa':
      return { liberado: true, motivo: 'ativa' };

    case 'trial': {
      // Sem data de término registrada, trata como expirado em vez de liberar:
      // um campo nulo não pode virar acesso ilimitado por acidente.
      if (!e.trialTerminaEm) return { liberado: false, motivo: 'trial_expirado' };
      if (e.trialTerminaEm.getTime() <= agora.getTime()) {
        return { liberado: false, motivo: 'trial_expirado' };
      }
      return { liberado: true, motivo: 'trial', diasRestantes: diasAte(e.trialTerminaEm, agora) };
    }

    case 'inadimplente': {
      if (!e.periodoTerminaEm) return { liberado: false, motivo: 'tolerancia_esgotada' };
      const limite = new Date(e.periodoTerminaEm.getTime() + DIAS_DE_TOLERANCIA * MS_POR_DIA);
      if (limite.getTime() <= agora.getTime()) {
        return { liberado: false, motivo: 'tolerancia_esgotada' };
      }
      return { liberado: true, motivo: 'tolerancia', diasRestantes: diasAte(limite, agora) };
    }

    case 'suspensa':
      return { liberado: false, motivo: 'suspensa' };

    case 'cancelada':
      // Cancelamento agendado ainda tem período pago pela frente.
      if (e.periodoTerminaEm && e.periodoTerminaEm.getTime() > agora.getTime()) {
        return { liberado: true, motivo: 'ativa', diasRestantes: diasAte(e.periodoTerminaEm, agora) };
      }
      return { liberado: false, motivo: 'cancelada' };
  }
}

export interface Limites {
  maxQuartos: number;
  maxUsuarios: number | null;
  maxPousadas: number;
}

/**
 * Limites em vigor.
 *
 * Durante o trial vale o plano `pousada` — generoso o bastante para o dono
 * conhecer o produto de verdade, e limitado o bastante para não virar uma conta
 * gratuita permanente. `cortesia` não tem limite prático.
 */
export function limitesVigentes(e: Pick<EstadoAssinatura, 'status' | 'plano'>): Limites {
  if (e.status === 'cortesia') {
    return { maxQuartos: 100, maxUsuarios: null, maxPousadas: 10 };
  }
  const plano = e.plano ? PLANOS[e.plano] : PLANOS.pousada;
  return {
    maxQuartos: plano.maxQuartos,
    maxUsuarios: plano.maxUsuarios,
    maxPousadas: plano.maxPousadas,
  };
}

/** Mensagem para o usuário final. Nunca expõe estado interno de cobrança. */
export function mensagemDeBloqueio(motivo: MotivoBloqueio): string {
  switch (motivo) {
    case 'trial_expirado':
      return 'Seu período de teste terminou. Escolha um plano para continuar usando.';
    case 'tolerancia_esgotada':
      return 'Não conseguimos confirmar o pagamento da sua assinatura. Atualize a forma de pagamento para reativar o acesso.';
    case 'suspensa':
      return 'Sua assinatura está suspensa. Entre em contato com o suporte.';
    case 'cancelada':
      return 'Sua assinatura foi cancelada. Escolha um plano para voltar a usar.';
  }
}
