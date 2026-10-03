/**
 * Jobs em background, contra Postgres real.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, temBanco } from './helpers/banco.js';

describe('jobs — finalização automática de estadias', { skip: !temBanco && 'DATABASE_URL não definida' }, () => {
  let descartar: () => Promise<void>;
  let fechar: () => Promise<void>;
  let pool: import('pg').Pool;
  let finalizar: typeof import('../jobs/estadias.js').finalizarEstadiasVencidas;

  before(async () => {
    ({ descartar } = await prepararBanco('jobs'));
    const dbmod = await import('../db/index.js');
    await (await import('../db/migrate.js')).runMigrations();
    pool = dbmod.pool;
    fechar = dbmod.closeConnection;
    ({ finalizarEstadiasVencidas: finalizar } = await import('../jobs/estadias.js'));
    await pool.query(`INSERT INTO pousadas (id, nome, slug, num_quartos) VALUES (1, 'P', 'p', 10)`);
    const r = (q: number, ent: string, sai: string, status = 'ativa') =>
      pool.query(
        `INSERT INTO reservas (pousada_id, nome, cpf, quarto, data_entrada, data_saida, status) VALUES (1, $1, 'x', $2, $3, $4, $5)`,
        [`Q${q}`, q, ent, sai, status],
      );
    await r(1, '2026-09-01', '2026-09-05');            // venceu há muito: finaliza
    await r(2, '2026-09-28', '2026-09-30');            // saída anteontem (hoje=10-02): finaliza
    await r(3, '2026-09-29', '2026-10-01');            // saída ontem: tolerância, fica
    await r(4, '2026-10-01', '2026-10-05');            // em andamento: fica
    await r(5, '2026-09-01', '2026-09-03', 'cancelada'); // cancelada não muda
  });

  after(async () => {
    await fechar?.();
    await descartar?.();
  });

  it('finaliza só o que venceu há mais de um dia e registra auditoria', async () => {
    const n = await finalizar('2026-10-02');
    assert.equal(n, 2);
    const { rows } = await pool.query(`SELECT nome, status FROM reservas ORDER BY quarto`);
    assert.deepEqual(rows.map((x) => `${x.nome}:${x.status}`), [
      'Q1:finalizada', 'Q2:finalizada', 'Q3:ativa', 'Q4:ativa', 'Q5:cancelada',
    ]);
    const { rows: aud } = await pool.query(`SELECT count(*)::int AS n FROM auditoria WHERE action = 'finalizacao_automatica'`);
    assert.equal(aud[0].n, 2);
  });

  it('rodar de novo não faz nada (idempotente)', async () => {
    assert.equal(await finalizar('2026-10-02'), 0);
  });
});
