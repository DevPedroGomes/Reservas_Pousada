/**
 * Cálculo de margem.
 *
 * É a conta que decide se um cliente fica ou sai. Um erro aqui não derruba
 * nada — só faz o negócio tomar a decisão errada em silêncio, que é pior.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  calcularMargem,
  competenciaAnterior,
  competenciaDe,
  ehCompetencia,
  formatarCentavos,
  ratearInfra,
  type Lancamento,
} from '../utils/margem.js';

const receita = (v: number, estimado = false): Lancamento => ({ categoria: 'receita_assinatura', valorCentavos: v, estimado });
const taxa = (v: number, estimado = false): Lancamento => ({ categoria: 'taxa_stripe', valorCentavos: v, estimado });
const ia = (v: number): Lancamento => ({ categoria: 'custo_ia', valorCentavos: v, estimado: false });

describe('margem — o caso comum', () => {
  it('receita menos taxa menos rateio de infra', () => {
    // R$ 149,00 de assinatura, R$ 6,33 de taxa, R$ 5,00 de infra rateada
    const m = calcularMargem([receita(14900), taxa(633)], 500);
    assert.equal(m.receitaCentavos, 14900);
    assert.equal(m.custoCentavos, 1133);
    assert.equal(m.margemCentavos, 13767);
    assert.equal(m.margemPercentual, 92.4);
  });

  it('soma vários lançamentos da mesma categoria', () => {
    const m = calcularMargem([receita(8900), receita(8900), taxa(200), taxa(200)]);
    assert.equal(m.receitaCentavos, 17800);
    assert.equal(m.custoPorCategoria.taxa_stripe, 400);
  });

  it('separa custo por categoria — é o que mostra ONDE o dinheiro vai', () => {
    const m = calcularMargem([receita(14900), taxa(600), ia(2000)]);
    assert.equal(m.custoPorCategoria.taxa_stripe, 600);
    assert.equal(m.custoPorCategoria.custo_ia, 2000);
    assert.equal(m.custoCentavos, 2600);
  });
});

describe('margem — os casos que enganam', () => {
  it('cliente que só gerou custo tem margem NEGATIVA, não zero', () => {
    const m = calcularMargem([ia(5000)], 500);
    assert.equal(m.margemCentavos, -5500);
  });

  it('sem receita, percentual é null — 0% faria parecer equilibrado', () => {
    const m = calcularMargem([ia(5000)]);
    assert.equal(m.margemPercentual, null, 'dividir por zero não pode virar 0%');
  });

  it('custo maior que a receita produz percentual negativo', () => {
    const m = calcularMargem([receita(8900), ia(20000)]);
    assert.ok(m.margemCentavos < 0);
    assert.ok((m.margemPercentual ?? 0) < 0);
  });

  it('propaga que houve estimativa — o painel precisa distinguir isso de fato', () => {
    assert.equal(calcularMargem([receita(14900), taxa(600, true)]).contemEstimativa, true);
    assert.equal(calcularMargem([receita(14900), taxa(600, false)]).contemEstimativa, false);
  });

  it('sem lançamento nenhum não quebra', () => {
    const m = calcularMargem([]);
    assert.equal(m.receitaCentavos, 0);
    assert.equal(m.margemCentavos, 0);
    assert.equal(m.margemPercentual, null);
  });
});

describe('rateio de infraestrutura', () => {
  it('divide entre os pagantes', () => {
    assert.equal(ratearInfra(10000, 4), 2500);
  });

  it('sem pagante não rateia — não pode dividir por zero', () => {
    assert.equal(ratearInfra(10000, 0), 0);
  });

  it('custo zero não rateia', () => {
    assert.equal(ratearInfra(0, 10), 0);
  });

  it('arredonda para centavo inteiro', () => {
    assert.equal(ratearInfra(10000, 3), 3333);
    assert.ok(Number.isInteger(ratearInfra(10000, 7)));
  });
});

describe('competência', () => {
  it('extrai YYYY-MM no fuso da operação, não em UTC', () => {
    // 2026-09-01T02:00Z é ainda 31/08 em São Paulo — mês diferente.
    assert.equal(competenciaDe(new Date('2026-09-01T02:00:00Z'), 'America/Sao_Paulo'), '2026-08');
    assert.equal(competenciaDe(new Date('2026-09-01T02:00:00Z'), 'UTC'), '2026-09');
  });

  it('volta um mês, inclusive na virada do ano', () => {
    assert.equal(competenciaAnterior('2026-08'), '2026-07');
    assert.equal(competenciaAnterior('2026-01'), '2025-12');
    assert.equal(competenciaAnterior('2026-10'), '2026-09');
  });

  it('valida o formato e rejeita mês inexistente', () => {
    assert.equal(ehCompetencia('2026-08'), true);
    assert.equal(ehCompetencia('2026-13'), false);
    assert.equal(ehCompetencia('2026-00'), false);
    assert.equal(ehCompetencia('2026-8'), false);
    assert.equal(ehCompetencia('agosto'), false);
    assert.equal(ehCompetencia(null), false);
  });
});

describe('formatação de dinheiro', () => {
  it('centavos viram reais', () => {
    assert.match(formatarCentavos(14900), /149,00/);
    assert.match(formatarCentavos(0), /0,00/);
  });

  it('negativo aparece como negativo', () => {
    assert.match(formatarCentavos(-5500), /-|−/);
  });
});
