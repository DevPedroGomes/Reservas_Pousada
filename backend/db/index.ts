import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

// Database connection URL from environment
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('ERRO CRÍTICO: DATABASE_URL não definido nas variáveis de ambiente');
  process.exit(1);
}

function inteiroDoAmbiente(nome: string, padrao: number): number {
  const v = Number(process.env[nome]);
  return Number.isInteger(v) && v > 0 ? v : padrao;
}

// Pool de conexões.
//
// - Tamanho configurável: a central-db é compartilhada com outros projetos,
//   então o teto de conexões desta API precisa caber no max_connections dela.
// - Espera por conexão de 5s (era 2s): num pico curto de requisições, 2s
//   transformavam fila em erro 500 antes de qualquer conexão liberar.
// - statement_timeout: uma consulta presa não segura a conexão para sempre e
//   derruba o pool em cascata. As migrations desligam o limite (db/migrate.ts).
// - application_name: identifica a API no pg_stat_activity do banco compartilhado.
const pool = new Pool({
  connectionString: databaseUrl,
  max: inteiroDoAmbiente('DB_POOL_MAX', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: inteiroDoAmbiente('DB_POOL_TIMEOUT_MS', 5000),
  statement_timeout: inteiroDoAmbiente('DB_STATEMENT_TIMEOUT_MS', 15000),
  idle_in_transaction_session_timeout: inteiroDoAmbiente('DB_IDLE_TX_TIMEOUT_MS', 30000),
  application_name: 'diaria-api',
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// Create Drizzle ORM instance with schema
export const db = drizzle(pool, { schema });

/**
 * Quem executa a consulta: o `db` (autocommit) ou uma transação aberta.
 * Models que participam de uma escrita composta recebem isto como parâmetro.
 */
export type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

// Export pool for direct access if needed
export { pool };

// Export schema for use in other modules
export * from './schema.js';

/**
 * Banco responde? Versão silenciosa para o healthcheck, que roda a cada 30s
 * e não pode encher o log de "conexão estabelecida".
 */
export async function bancoResponde(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('Conexão com PostgreSQL estabelecida com sucesso');
    return true;
  } catch (error) {
    console.error('Erro ao conectar com PostgreSQL:', error);
    return false;
  }
}

/**
 * Close database connection pool
 */
export async function closeConnection(): Promise<void> {
  await pool.end();
  console.log('Pool de conexões fechado');
}
