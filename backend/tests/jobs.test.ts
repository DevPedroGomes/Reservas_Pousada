/**
 * Jobs em background, contra Postgres real.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, temBanco } from './helpers/banco.js';

describe('jobs — estadias e pré-reservas', { skip: !temBanco && 'DATABASE_URL não definida' }, () => {
  let descartar: () => Promise<void>;
  let fechar: () => Promise<void>;
  let pool: import('pg').Pool;
  let finalizar: typeof import('../jobs/estadias.js').finalizarEstadiasVencidas;
  let expirar: typeof import('../jobs/estadias.js').expirarPreReservas;

  before(async () => {
    ({ descartar } = await prepararBanco('jobs'));
    const dbmod = await import('../db/index.js');
    await (await import('../db/migrate.js')).runMigrations();
    pool = dbmod.pool;
    fechar = dbmod.closeConnection;
    ({ finalizarEstadiasVencidas: finalizar, expirarPreReservas: expirar } = await import('../jobs/estadias.js'));
    await pool.query(`INSERT INTO pousadas (id, nome, slug, num_quartos) VALUES (1, 'P', 'p', 10), (2, 'Pré', 'pre', 5)`);
    const r = (q: number, ent: string, sai: string, status = 'confirmada') =>
      pool.query(
        `INSERT INTO reservas (pousada_id, nome, cpf, quarto, data_entrada, data_saida, status) VALUES (1, $1, 'x', $2, $3, $4, $5)`,
        [`Q${q}`, q, ent, sai, status],
      );
    await r(1, '2026-09-01', '2026-09-05');            // venceu há muito: finaliza
    await r(2, '2026-09-28', '2026-09-30');            // saída anteontem (hoje=10-02): finaliza
    await r(3, '2026-09-29', '2026-10-01');            // saída ontem: tolerância, fica
    await r(4, '2026-10-01', '2026-10-05');            // em andamento: fica
    await r(5, '2026-09-01', '2026-09-03', 'cancelada'); // cancelada não muda
    await pool.query(`
      INSERT INTO reservas (pousada_id, nome, cpf, quarto, data_entrada, data_saida, status, expira_em) VALUES
        (2, 'Vencida', 'x', 1, current_date + 10, current_date + 12, 'pre_reserva', now() - interval '1 minute'),
        (2, 'No prazo', 'x', 2, current_date + 10, current_date + 12, 'pre_reserva', now() + interval '1 day')`);
  });

  after(async () => {
    await fechar?.();
    await descartar?.();
  });

  it('finaliza só o que venceu há mais de um dia e registra auditoria', async () => {
    const n = await finalizar('2026-10-02');
    assert.equal(n, 2);
    const { rows } = await pool.query(`SELECT nome, status FROM reservas WHERE pousada_id = 1 ORDER BY quarto`);
    assert.deepEqual(rows.map((x) => `${x.nome}:${x.status}`), [
      'Q1:finalizada', 'Q2:finalizada', 'Q3:confirmada', 'Q4:confirmada', 'Q5:cancelada',
    ]);
    const { rows: aud } = await pool.query(`SELECT count(*)::int AS n FROM auditoria WHERE action = 'finalizacao_automatica'`);
    assert.equal(aud[0].n, 2);
  });

  it('rodar de novo não faz nada (idempotente)', async () => {
    assert.equal(await finalizar('2026-10-02'), 0);
  });

  it('pré-reserva vencida é cancelada com motivo e o quarto fica livre', async () => {
    assert.equal(await expirar(), 1);
    const { rows } = await pool.query(`SELECT status, motivo_cancelamento FROM reservas WHERE pousada_id = 2 ORDER BY quarto`);
    assert.equal(rows[0].status, 'cancelada');
    assert.match(rows[0].motivo_cancelamento, /expirad/);
    assert.equal(rows[1].status, 'pre_reserva');
    await pool.query(`INSERT INTO reservas (pousada_id, nome, cpf, quarto, data_entrada, data_saida, status)
                      VALUES (2, 'Nova', 'x', 1, current_date + 10, current_date + 12, 'confirmada')`);
  });

  it('pré-reserva no prazo segura o quarto (anti-overbooking vale para ela)', async () => {
    await assert.rejects(
      pool.query(`INSERT INTO reservas (pousada_id, nome, cpf, quarto, data_entrada, data_saida, status)
                  VALUES (2, 'Choque', 'x', 2, current_date + 11, current_date + 13, 'confirmada')`),
      (e: { code?: string }) => e.code === '23P01',
    );
  });
});
