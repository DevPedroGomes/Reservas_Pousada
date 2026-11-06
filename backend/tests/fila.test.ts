/**
 * Fila: última tentativa alerta e o job vai para a fila de mortos.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, temBanco } from './helpers/banco.js';

// Este bloco vem primeiro porque db/index.ts lê DATABASE_URL no import.
describe('fila — pg-boss de verdade', { skip: !temBanco && 'DATABASE_URL não definida' }, () => {
  let descartar: () => Promise<void>;
  let fechar: () => Promise<void>;
  let pool: import('pg').Pool;
  let Fila: typeof import('../lib/fila.js');

  before(async () => {
    ({ descartar } = await prepararBanco('fila'));
    const dbmod = await import('../db/index.js');
    await (await import('../db/migrate.js')).runMigrations();
    pool = dbmod.pool;
    fechar = dbmod.closeConnection;
    Fila = await import('../lib/fila.js');
    Fila.registrarTrabalhador(Fila.FILAS.email, async () => { throw new Error('e-mail quebrou'); });
    await Fila.iniciarFila();
  });

  after(async () => {
    await Fila.pararFila();
    await fechar?.();
    await descartar?.();
  });

  it('toda fila tem dead letter, inclusive as agendadas', async () => {
    const { rows } = await pool.query(`SELECT name, dead_letter FROM pgboss.queue`);
    const porNome = new Map(rows.map((r) => [r.name, r.dead_letter]));
    for (const nome of Object.values(Fila.FILAS)) {
      assert.equal(porNome.get(nome), `${nome}-dlq`, `fila ${nome}`);
      assert.ok(porNome.has(`${nome}-dlq`), `a DLQ de ${nome} precisa existir`);
    }
  });

  it('a reconciliação com o Stripe está agendada', async () => {
    const { rows } = await pool.query(`SELECT 1 FROM pgboss.schedule WHERE name = $1`, [Fila.FILAS.reconciliarStripe]);
    assert.equal(rows.length, 1);
  });

  it('job sem tentativas restantes cai na DLQ', async () => {
    await Fila.enfileirar(Fila.FILAS.email, { para: 'x@t.com' }, { retryLimit: 0 });
    let caiu = 0;
    for (let i = 0; i < 40 && caiu === 0; i++) {
      await new Promise((ok) => setTimeout(ok, 250));
      caiu = (await pool.query(`SELECT 1 FROM pgboss.job WHERE name = 'email-dlq'`)).rows.length;
    }
    assert.equal(caiu, 1);
  });

  it('subir de novo sobre filas existentes não falha e mantém a dead letter', async () => {
    await pool.query(`UPDATE pgboss.queue SET dead_letter = NULL WHERE name = $1`, [Fila.FILAS.limpeza]);
    await Fila.pararFila();
    await Fila.iniciarFila();
    const { rows: [q] } = await pool.query(`SELECT dead_letter FROM pgboss.queue WHERE name = $1`, [Fila.FILAS.limpeza]);
    assert.equal(q.dead_letter, `${Fila.FILAS.limpeza}-dlq`, 'fila antiga, criada antes da DLQ, também passa a ter');
  });
});

describe('fila — última tentativa', () => {
  const job = (retryCount: number, retryLimit = 3) => ({ id: 'j1', data: { a: 1 }, retryCount, retryLimit });
  const falha = async () => { throw new Error('quebrou'); };

  it('antes da última tentativa só relança, para o pg-boss tentar de novo', async () => {
    const { processarLote } = await import('../lib/fila.js');
    const alertas: unknown[] = [];
    await assert.rejects(processarLote('email', falha, [job(1)], (e) => alertas.push(e)), /quebrou/);
    assert.equal(alertas.length, 0);
  });

  it('na última tentativa alerta com a fila e o job, e relança para ir à DLQ', async () => {
    const { processarLote } = await import('../lib/fila.js');
    const alertas: [unknown, Record<string, unknown>][] = [];
    await assert.rejects(processarLote('email', falha, [job(3)], (e, c) => alertas.push([e, c])), /quebrou/);
    assert.equal(alertas.length, 1);
    assert.equal((alertas[0][0] as Error).message, 'quebrou');
    assert.deepEqual(alertas[0][1], { fila: 'email', jobId: 'j1', tentativas: 4, dlq: 'email-dlq' });
  });

  it('sucesso não alerta', async () => {
    const { processarLote } = await import('../lib/fila.js');
    const alertas: unknown[] = [];
    const vistos: unknown[] = [];
    await processarLote('email', async (d) => { vistos.push(d); }, [job(3)], (e) => alertas.push(e));
    assert.deepEqual(vistos, [{ a: 1 }]);
    assert.equal(alertas.length, 0);
  });
});
