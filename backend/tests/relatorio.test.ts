/**
 * Relatórios contra Postgres real, com números conferidos à mão.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, temBanco } from './helpers/banco.js';

describe('relatórios — ocupação, ADR, RevPAR, canais e caixa', { skip: !temBanco && 'DATABASE_URL não definida' }, () => {
  let descartar: () => Promise<void>;
  let fechar: () => Promise<void>;
  let pool: import('pg').Pool;
  let rel: Awaited<ReturnType<typeof import('../models/Relatorio.js').relatorio>>;

  before(async () => {
    ({ descartar } = await prepararBanco('relatorio'));
    const dbmod = await import('../db/index.js');
    await (await import('../db/migrate.js')).runMigrations();
    pool = dbmod.pool;
    fechar = dbmod.closeConnection;
    await pool.query(`
      INSERT INTO pousadas (id, nome, slug, num_quartos) VALUES (1, 'P', 'p', 4), (2, 'Outra', 'outra', 2);
      INSERT INTO quartos (pousada_id, numero, nome) VALUES (1, 1, 'Q1'), (1, 2, 'Q2'), (1, 3, 'Q3'), (1, 4, 'Q4'), (2, 1, 'X1'), (2, 2, 'X2')
        ON CONFLICT (pousada_id, numero) DO NOTHING;
      INSERT INTO reservas (id, pousada_id, nome, quarto, data_entrada, data_saida, status, valor, canal) VALUES
        (1, 1, 'R1', 1, '2026-11-01', '2026-11-04', 'confirmada', 600, 'direto'),
        (2, 1, 'R2', 2, '2026-10-30', '2026-11-02', 'finalizada', 300, 'booking'),
        (3, 1, 'R3', 3, '2026-11-09', '2026-11-12', 'confirmada', 900, 'airbnb'),
        (4, 1, 'R4', 4, '2026-11-05', '2026-11-07', 'cancelada', 400, 'direto'),
        (5, 1, 'R5', 4, '2026-11-05', '2026-11-06', 'pre_reserva', NULL, 'whatsapp'),
        (6, 2, 'Outra pousada', 1, '2026-11-01', '2026-11-10', 'confirmada', 5000, 'direto');
      INSERT INTO pagamentos (pousada_id, reserva_id, valor_centavos, forma, tipo, recebido_em) VALUES
        (1, 1, 20000, 'pix', 'sinal', '2026-11-01'),
        (1, 3, 90000, 'cartao_credito', 'pagamento', '2026-11-09'),
        (1, 2, 30000, 'outro', 'pagamento', '2026-10-30');
      INSERT INTO consumos (pousada_id, reserva_id, descricao, quantidade, valor_unitario_centavos, lancado_em) VALUES
        (1, 1, 'Frigobar', 2, 1000, '2026-11-02');
    `);
    // Só os 4 quartos do teste ativos (a migração de quartos pode ter criado outros).
    await pool.query(`UPDATE quartos SET ativo = (numero <= 4) WHERE pousada_id = 1`);
    rel = await (await import('../models/Relatorio.js')).relatorio(1, '2026-11-01', '2026-11-10');
  });

  after(async () => {
    await fechar?.();
    await descartar?.();
  });

  it('noites vendidas só de negócio fechado, recortadas ao período', () => {
    assert.equal(rel.dias, 10);
    assert.equal(rel.noitesDisponiveis, 40);
    assert.equal(rel.noitesVendidas, 6, '3 (R1) + 1 (R2, só 01/11) + 2 (R3, 09 e 10/11)');
    assert.equal(rel.ocupacao, 15);
  });

  it('receita por competência, ADR e RevPAR', () => {
    assert.equal(rel.receitaHospedagemCentavos, 130000, '600 + 100 + 600');
    assert.equal(rel.adrCentavos, 21667);
    assert.equal(rel.revparCentavos, 3250);
  });

  it('receita por canal', () => {
    const porCanal = Object.fromEntries(rel.porCanal.map((c) => [c.canal, [c.reservas, c.noites, c.receitaCentavos]]));
    assert.deepEqual(porCanal, { direto: [1, 3, 60000], airbnb: [1, 2, 60000], booking: [1, 1, 10000] });
  });

  it('caixa do período por forma, consumos e cancelamentos', () => {
    assert.equal(rel.recebidoCentavos, 110000);
    assert.deepEqual(rel.recebidoPorForma.map((f) => [f.forma, f.centavos]), [['cartao_credito', 90000], ['pix', 20000]]);
    assert.equal(rel.consumosCentavos, 2000);
    assert.equal(rel.cancelamentos.canceladas, 1);
  });

  it('a receber: saldo atual das reservas em aberto', () => {
    assert.deepEqual(rel.aReceber.map((r) => [r.id, r.saldo_centavos]), [[1, 42000]]);
    assert.equal(rel.aReceberCentavos, 42000);
  });

  it('ocupação por dia', () => {
    const dia = Object.fromEntries(rel.ocupacaoPorDia.map((d) => [d.dia, d.percentual]));
    assert.equal(dia['2026-11-01'], 50);
    assert.equal(dia['2026-11-05'], 0, 'cancelada e pré-reserva não contam');
    assert.equal(dia['2026-11-09'], 25);
  });
});
