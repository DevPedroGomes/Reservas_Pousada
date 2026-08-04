/**
 * Testes de integração contra Postgres real.
 *
 * O que está aqui NÃO pode ser testado em memória: a garantia contra
 * overbooking é uma constraint EXCLUDE do banco, e a única prova que vale é
 * duas transações concorrentes disputando o mesmo quarto.
 *
 * Pula automaticamente quando não há DATABASE_URL (rodada local sem banco).
 * No CI, o job `test` sobe um serviço postgres e define a variável.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const URL_BANCO = process.env.DATABASE_URL;
const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

const NATAL_ENTRADA = '2026-12-24';
const NATAL_SAIDA = '2026-12-27';

let pool: pg.Pool;

describe('banco — garantias que só o Postgres pode dar', { skip: !URL_BANCO && 'DATABASE_URL não definida' }, () => {
  before(async () => {
    pool = new pg.Pool({ connectionString: URL_BANCO, max: 6 });

    // Schema do zero, na ordem numérica — é também o teste de que um deploy
    // limpo sobe. A migration 005 já falhou aqui antes por não criar a tabela
    // `user_pousadas` que ela mesma altera.
    const arquivos = readdirSync(MIGRATIONS)
      .filter((f) => /^\d+_.*\.sql$/.test(f))
      .sort((a, b) => parseInt(a) - parseInt(b));

    for (const arquivo of arquivos) {
      await pool.query(readFileSync(join(MIGRATIONS, arquivo), 'utf8'));
    }

    await pool.query(`
      INSERT INTO pousadas (id, nome, slug, num_quartos) VALUES (1, 'Teste', 'teste', 20)
      ON CONFLICT (id) DO NOTHING`);
  });

  after(async () => {
    await pool?.end();
  });

  async function limparQuarto(quarto: number) {
    await pool.query('DELETE FROM reservas WHERE quarto = $1', [quarto]);
  }

  async function reservar(quarto: number, entrada: string, saida: string, nome = 'Hospede') {
    return pool.query(
      `INSERT INTO reservas (pousada_id, nome, cpf, quarto, data_entrada, data_saida, status)
       VALUES (1, $1, 'cifrado', $2, $3, $4, 'ativa')`,
      [nome, quarto, entrada, saida],
    );
  }

  it('aplica todas as migrations num banco vazio (deploy do zero sobe)', async () => {
    const { rows } = await pool.query(
      `SELECT to_regclass('user_pousadas') AS t, to_regclass('reservas') AS r`,
    );
    assert.ok(rows[0].t, 'user_pousadas precisa existir — a 005 a altera');
    assert.ok(rows[0].r);
  });

  it('cria a constraint anti-overbooking', async () => {
    const { rows } = await pool.query(
      `SELECT 1 FROM pg_constraint
       WHERE conname = 'reservas_sem_overbooking' AND conrelid = 'reservas'::regclass`,
    );
    assert.equal(rows.length, 1);
  });

  it('PERMITE troca de hóspede no mesmo dia (sai 12, entra 12)', async () => {
    await limparQuarto(5);
    await reservar(5, '2026-08-10', '2026-08-12', 'sai-dia-12');
    await assert.doesNotReject(
      () => reservar(5, '2026-08-12', '2026-08-14', 'entra-dia-12'),
      'a diária de saída não é ocupada — este é o caso mais comum em alta temporada',
    );
  });

  it('BLOQUEIA sobreposição real', async () => {
    await limparQuarto(6);
    await reservar(6, '2026-08-10', '2026-08-12');
    await assert.rejects(() => reservar(6, '2026-08-11', '2026-08-13'), /exclusion constraint/);
  });

  it('reserva cancelada não segura o quarto', async () => {
    await limparQuarto(8);
    await pool.query(
      `INSERT INTO reservas (pousada_id, nome, cpf, quarto, data_entrada, data_saida, status)
       VALUES (1, 'cancelou', 'cifrado', 8, $1, $2, 'cancelada')`,
      [NATAL_ENTRADA, NATAL_SAIDA],
    );
    await assert.doesNotReject(() => reservar(8, NATAL_ENTRADA, NATAL_SAIDA));
  });

  it('reserva com soft-delete não segura o quarto', async () => {
    await limparQuarto(10);
    await pool.query(
      `INSERT INTO reservas (pousada_id, nome, cpf, quarto, data_entrada, data_saida, status, deleted_at)
       VALUES (1, 'apagada', 'cifrado', 10, $1, $2, 'ativa', NOW())`,
      [NATAL_ENTRADA, NATAL_SAIDA],
    );
    await assert.doesNotReject(() => reservar(10, NATAL_ENTRADA, NATAL_SAIDA));
  });

  it('recusa período invertido (saída antes da entrada)', async () => {
    await limparQuarto(11);
    await assert.rejects(() => reservar(11, '2026-08-12', '2026-08-10'), /reservas_periodo_valido/);
  });

  it('CORRIDA: duas reservas simultâneas no mesmo quarto — só uma sobrevive', async () => {
    await limparQuarto(7);

    // Cada "família" abre a própria transação, faz a checagem de
    // disponibilidade da aplicação (as duas veem livre), espera, e só então
    // grava. Era exatamente nesta janela que o overbooking acontecia.
    async function tentativa(nome: string) {
      const cliente = await pool.connect();
      try {
        await cliente.query('BEGIN');
        const { rows } = await cliente.query(
          `SELECT id FROM reservas
           WHERE pousada_id = 1 AND quarto = 7 AND status = 'ativa' AND deleted_at IS NULL
             AND data_entrada < $2 AND data_saida > $1`,
          [NATAL_ENTRADA, NATAL_SAIDA],
        );
        if (rows.length > 0) {
          await cliente.query('ROLLBACK');
          return 'recusada-pela-checagem';
        }
        await new Promise((r) => setTimeout(r, 200));
        await cliente.query(
          `INSERT INTO reservas (pousada_id, nome, cpf, quarto, data_entrada, data_saida, status)
           VALUES (1, $1, 'cifrado', 7, $2, $3, 'ativa')`,
          [nome, NATAL_ENTRADA, NATAL_SAIDA],
        );
        await cliente.query('COMMIT');
        return 'gravou';
      } catch {
        await cliente.query('ROLLBACK').catch(() => {});
        return 'bloqueada-pelo-banco';
      } finally {
        cliente.release();
      }
    }

    const resultados = await Promise.all([tentativa('familia-1'), tentativa('familia-2')]);

    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM reservas WHERE quarto = 7 AND status = 'ativa'`,
    );
    assert.equal(
      rows[0].n,
      1,
      `duas famílias com a mesma reserva no Natal. resultados: ${resultados.join(', ')}`,
    );
    assert.equal(resultados.filter((r) => r === 'gravou').length, 1);
  });
});
