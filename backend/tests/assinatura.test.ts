/**
 * Regras de acesso e limite do billing.
 *
 * É a lógica que decide se um cliente pagante consegue usar o sistema. Cada
 * caso aqui é um jeito de errar que custa dinheiro: liberar quem não pagou, ou
 * — pior — bloquear quem pagou.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  avaliarAcesso,
  limitesVigentes,
  mensagemDeBloqueio,
  type EstadoAssinatura,
  type MotivoBloqueio,
} from '../utils/assinatura.js';
import { DIAS_DE_TOLERANCIA, PLANOS } from '../config/planos.js';

const AGORA = new Date('2026-08-04T12:00:00Z');
const DIA = 24 * 60 * 60 * 1000;
const emDias = (n: number) => new Date(AGORA.getTime() + n * DIA);

function estado(over: Partial<EstadoAssinatura> = {}): EstadoAssinatura {
  return { status: 'trial', plano: null, trialTerminaEm: null, periodoTerminaEm: null, ...over };
}

describe('acesso — trial', () => {
  it('libera dentro do prazo e informa os dias restantes', () => {
    const v = avaliarAcesso(estado({ status: 'trial', trialTerminaEm: emDias(5) }), AGORA);
    assert.equal(v.liberado, true);
    assert.equal(v.liberado && v.motivo, 'trial');
    assert.equal(v.liberado && v.diasRestantes, 5);
  });

  it('bloqueia depois de vencido', () => {
    const v = avaliarAcesso(estado({ status: 'trial', trialTerminaEm: emDias(-1) }), AGORA);
    assert.equal(v.liberado, false);
    assert.equal(!v.liberado && v.motivo, 'trial_expirado');
  });

  it('bloqueia exatamente no instante do vencimento', () => {
    const v = avaliarAcesso(estado({ status: 'trial', trialTerminaEm: AGORA }), AGORA);
    assert.equal(v.liberado, false);
  });

  it('SEM data de término, bloqueia — campo nulo não pode virar acesso ilimitado', () => {
    const v = avaliarAcesso(estado({ status: 'trial', trialTerminaEm: null }), AGORA);
    assert.equal(v.liberado, false);
    assert.equal(!v.liberado && v.motivo, 'trial_expirado');
  });
});

describe('acesso — assinatura paga', () => {
  it('ativa libera', () => {
    assert.equal(avaliarAcesso(estado({ status: 'ativa', plano: 'pousada' }), AGORA).liberado, true);
  });

  it('cortesia libera e nunca expira', () => {
    const v = avaliarAcesso(estado({ status: 'cortesia', trialTerminaEm: emDias(-999) }), AGORA);
    assert.equal(v.liberado, true);
    assert.equal(v.liberado && v.motivo, 'cortesia');
  });

  it('suspensa bloqueia', () => {
    const v = avaliarAcesso(estado({ status: 'suspensa' }), AGORA);
    assert.equal(v.liberado, false);
    assert.equal(!v.liberado && v.motivo, 'suspensa');
  });
});

describe('acesso — inadimplência e tolerância', () => {
  it('libera durante a tolerância — cartão vencido não é pedido de cancelamento', () => {
    const v = avaliarAcesso(
      estado({ status: 'inadimplente', plano: 'pousada', periodoTerminaEm: emDias(-2) }),
      AGORA,
    );
    assert.equal(v.liberado, true);
    assert.equal(v.liberado && v.motivo, 'tolerancia');
  });

  it('bloqueia depois da tolerância', () => {
    const v = avaliarAcesso(
      estado({ status: 'inadimplente', periodoTerminaEm: emDias(-(DIAS_DE_TOLERANCIA + 1)) }),
      AGORA,
    );
    assert.equal(v.liberado, false);
    assert.equal(!v.liberado && v.motivo, 'tolerancia_esgotada');
  });

  it('sem data de período, bloqueia em vez de liberar por omissão', () => {
    const v = avaliarAcesso(estado({ status: 'inadimplente', periodoTerminaEm: null }), AGORA);
    assert.equal(v.liberado, false);
  });
});

describe('acesso — cancelamento', () => {
  it('cancelada com período pago pela frente continua liberada', () => {
    const v = avaliarAcesso(
      estado({ status: 'cancelada', plano: 'pousada', periodoTerminaEm: emDias(10) }),
      AGORA,
    );
    assert.equal(v.liberado, true, 'quem pagou até o dia 14 usa até o dia 14');
  });

  it('cancelada com período vencido bloqueia', () => {
    const v = avaliarAcesso(estado({ status: 'cancelada', periodoTerminaEm: emDias(-1) }), AGORA);
    assert.equal(v.liberado, false);
    assert.equal(!v.liberado && v.motivo, 'cancelada');
  });
});

describe('limites por plano', () => {
  it('cada plano carrega os próprios limites', () => {
    for (const p of ['essencial', 'pousada', 'rede'] as const) {
      const l = limitesVigentes({ status: 'ativa', plano: p });
      assert.equal(l.maxQuartos, PLANOS[p].maxQuartos);
      assert.equal(l.maxUsuarios, PLANOS[p].maxUsuarios);
      assert.equal(l.maxPousadas, PLANOS[p].maxPousadas);
    }
  });

  it('trial roda com os limites do plano Pousada', () => {
    const l = limitesVigentes({ status: 'trial', plano: null });
    assert.equal(l.maxQuartos, PLANOS.pousada.maxQuartos);
    assert.equal(l.maxUsuarios, null);
  });

  it('cortesia não é limitada na prática', () => {
    const l = limitesVigentes({ status: 'cortesia', plano: null });
    assert.equal(l.maxUsuarios, null);
    assert.ok(l.maxQuartos >= 100);
    assert.ok(l.maxPousadas >= 3);
  });

  it('Essencial é o único com teto de usuários', () => {
    assert.equal(limitesVigentes({ status: 'ativa', plano: 'essencial' }).maxUsuarios, 3);
    assert.equal(limitesVigentes({ status: 'ativa', plano: 'pousada' }).maxUsuarios, null);
  });
});

describe('mensagem de bloqueio', () => {
  const motivos: MotivoBloqueio[] = ['trial_expirado', 'tolerancia_esgotada', 'suspensa', 'cancelada'];

  it('existe para todo motivo, e nenhuma vaza estado interno de cobrança', () => {
    for (const m of motivos) {
      const msg = mensagemDeBloqueio(m);
      assert.ok(msg.length > 10, `mensagem vazia para ${m}`);
      assert.ok(!/stripe|subscription|past_due|webhook/i.test(msg), `mensagem de ${m} vaza detalhe interno`);
    }
  });
});
