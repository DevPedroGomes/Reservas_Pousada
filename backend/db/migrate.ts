/**
 * Runner de migrations versionadas, idempotente, executado no boot do servidor.
 *
 * Motivacao: as migrations deste projeto eram aplicadas na mao e nada registrava
 * quais ja tinham rodado. Em 2026-07-25 descobrimos que a 004 e a 005 nunca
 * foram aplicadas na central-db — enquanto a 006 e a 007 foram. A coluna
 * `deleted_at` faltava e TODA query de reserva (listar, buscar, checar conflito
 * de datas, estatisticas, soft-delete) respondia 500 em producao.
 *
 * Contrato:
 * - Arquivos em `migrations/NNN_nome.sql`, aplicados em ordem numerica.
 * - Cada arquivo roda UMA vez, dentro de UMA transacao, e fica registrado em
 *   `schema_migrations`. Falha => rollback daquele arquivo e o servidor NAO sobe.
 * - Migration ja registrada e pulada. Rodar de novo e no-op.
 * - Lock advisory serializa instancias concorrentes subindo ao mesmo tempo.
 *
 * As migrations 001..007 sao idempotentes (IF NOT EXISTS / DO $$ ... IF NOT
 * EXISTS), entao registrar o baseline num banco que ja tem o schema e seguro.
 */
import { readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { pool } from './index.js';

// db/migrate.ts -> db/ -> backend/ -> backend/migrations
// Em producao roda a partir de dist/db/migrate.js, entao subimos dois niveis a
// partir do proprio arquivo e caimos em backend/ nos dois casos so se o
// Dockerfile copiar migrations/ pra junto de dist/. Ver MIGRATIONS_DIR abaixo.
const __dirname_ = dirname(fileURLToPath(import.meta.url));

// Permite override explicito (usado no container, onde o layout difere do fonte).
const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR || join(__dirname_, '..', 'migrations');

// Numero arbitrario mas fixo: identifica ESTE runner no pg_advisory_lock.
const LOCK_KEY = 8270114512004;

function discover(): string[] {
  let files: string[];
  try {
    files = readdirSync(MIGRATIONS_DIR);
  } catch (err) {
    console.warn(`[migrate] diretorio nao encontrado: ${MIGRATIONS_DIR} — nada a aplicar`);
    return [];
  }
  return files
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/^(\d+)_/)![1], 10);
      const nb = parseInt(b.match(/^(\d+)_/)![1], 10);
      return na - nb || a.localeCompare(b);
    });
}

export async function runMigrations(): Promise<void> {
  const migrations = discover();
  if (migrations.length === 0) {
    console.log('[migrate] nenhuma migration encontrada');
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const client = await pool.connect();
  try {
    // Lock de SESSAO: sobrevive aos commits abaixo, cai no unlock/release.
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);

    const { rows } = await client.query<{ version: string }>('SELECT version FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.version));
    const pending = migrations.filter((m) => !applied.has(m));

    if (pending.length === 0) {
      console.log(`[migrate] schema em dia (${applied.size} aplicadas)`);
      return;
    }

    console.log(`[migrate] ${pending.length} pendente(s): ${pending.join(', ')}`);
    for (const version of pending) {
      const sql = readFileSync(join(MIGRATIONS_DIR, version), 'utf8');
      // Transacao por migration: uma falha nao deixa schema meio-aplicado.
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
        await client.query('COMMIT');
        console.log(`[migrate] aplicada ${version}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[migrate] FALHOU em ${version} — schema inalterado`, err);
        throw err;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    client.release();
  }
}
