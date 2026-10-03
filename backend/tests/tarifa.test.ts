/**
 * Cotação pelo tarifário — regra pura, sem banco.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cotar, noitesDe, type RegraTarifa } from '../models/Tarifa.js';

const regra = (r: Partial<RegraTarifa> & { id: number; nome: string }): RegraTarifa => ({
  quartoNumero: null, dataInicio: null, dataFim: null, diasSemana: null,
  precoCentavos: null, ajustePercentual: null, minimoNoites: null, ...r,
});

// 2027-01-04 é segunda; 2027-01-08 sexta; 2027-01-09 sábado.
const REGRAS: RegraTarifa[] = [
  regra({ id: 1, nome: 'Fim de semana', diasSemana: [5, 6], ajustePercentual: 20 }),
  regra({ id: 2, nome: 'Alta temporada', dataInicio: '2027-01-15', dataFim: '2027-02-28', ajustePercentual: 50 }),
  regra({ id: 3, nome: 'Suíte', quartoNumero: 9, precoCentavos: 45000 }),
  regra({ id: 4, nome: 'Réveillon', dataInicio: '2026-12-30', dataFim: '2027-01-01', precoCentavos: 80000, minimoNoites: 4 }),
];

describe('tarifário — cotação', () => {
  it('conta as noites de [entrada, saída)', () => {
    assert.deepEqual(noitesDe('2027-01-04', '2027-01-07'), ['2027-01-04', '2027-01-05', '2027-01-06']);
    assert.deepEqual(noitesDe('2027-01-04', '2027-01-04'), []);
  });

  it('sem regra, vale o preço base; noite de sexta e sábado com +20%', () => {
    const c = cotar(20000, REGRAS, 1, '2027-01-07', '2027-01-10'); // qui, sex, sáb
    assert.deepEqual(c.noites.map((n) => n.valorCentavos), [20000, 24000, 24000]);
    assert.deepEqual(c.noites.map((n) => n.regra), [null, 'Fim de semana', 'Fim de semana']);
    assert.equal(c.totalCentavos, 68000);
    assert.equal(c.atendeMinimo, true);
  });

  it('com período vence dia da semana (sexta na alta temporada = +50%)', () => {
    const c = cotar(20000, REGRAS, 1, '2027-01-22', '2027-01-23'); // sexta
    assert.equal(c.noites[0].valorCentavos, 30000);
    assert.equal(c.noites[0].regra, 'Alta temporada');
  });

  it('regra do quarto vence as gerais', () => {
    const c = cotar(20000, REGRAS, 9, '2027-01-22', '2027-01-24');
    assert.deepEqual(c.noites.map((n) => n.valorCentavos), [45000, 45000]);
  });

  it('pacote: preço fixo e mínimo de noites mesmo para quem só encosta no período', () => {
    const c = cotar(20000, REGRAS, 1, '2026-12-31', '2027-01-03');
    // 31/12 e 01/01 no pacote; 02/01/2027 é sábado (fim de semana, +20%).
    assert.deepEqual(c.noites.map((n) => n.valorCentavos), [80000, 80000, 24000]);
    assert.equal(c.minimoNoites, 4);
    assert.equal(c.atendeMinimo, false);
    assert.equal(cotar(20000, REGRAS, 1, '2026-12-29', '2027-01-02').atendeMinimo, true);
  });

  it('empate de especificidade: vale a regra mais recente', () => {
    const regras = [
      regra({ id: 10, nome: 'Antiga', dataInicio: '2027-03-01', dataFim: '2027-03-31', ajustePercentual: 10 }),
      regra({ id: 11, nome: 'Nova', dataInicio: '2027-03-10', dataFim: '2027-03-20', ajustePercentual: -10 }),
    ];
    assert.equal(cotar(10000, regras, 1, '2027-03-15', '2027-03-16').noites[0].valorCentavos, 9000);
  });

  it('quarto sem preço base: percentual não tem sobre o que agir; preço fixo resolve', () => {
    const c = cotar(null, REGRAS, 1, '2027-01-07', '2027-01-09');
    assert.equal(c.semPreco, true);
    assert.equal(c.totalCentavos, null);
    const fixo = cotar(null, REGRAS, 9, '2027-01-07', '2027-01-09');
    assert.equal(fixo.semPreco, false);
    assert.equal(fixo.totalCentavos, 90000);
  });
});
