/**
 * Banco descartável por arquivo de teste.
 *
 * O `node --test` roda cada arquivo num processo próprio e em paralelo. Se dois
 * arquivos usassem o mesmo banco, um aplicaria migrations enquanto o outro
 * apaga tabelas. Cada suite de integração cria aqui um banco só dela, derivado
 * do DATABASE_URL, e o remove no fim.
 *
 * Uso: chamar `prepararBanco()` ANTES de importar qualquer módulo que leia
 * DATABASE_URL (db/index.ts lê no import) — por isso os testes importam a
 * aplicação com `await import(...)`.
 */
import pg from 'pg';

const URL_BASE = process.env.DATABASE_URL;

export const temBanco = Boolean(URL_BASE);

function comBanco(url: string, nome: string): string {
  const u = new URL(url);
  u.pathname = `/${nome}`;
  return u.toString();
}

export async function prepararBanco(sufixo: string): Promise<{ url: string; descartar: () => Promise<void> }> {
  if (!URL_BASE) throw new Error('DATABASE_URL ausente');
  const nome = `${new URL(URL_BASE).pathname.slice(1)}_${sufixo}_${process.pid}`.replace(/[^a-z0-9_]/gi, '_').toLowerCase();

  const admin = new pg.Client({ connectionString: URL_BASE });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${nome}`);
  await admin.query(`CREATE DATABASE ${nome}`);
  await admin.end();

  const url = comBanco(URL_BASE, nome);
  process.env.DATABASE_URL = url;

  return {
    url,
    async descartar() {
      const c = new pg.Client({ connectionString: URL_BASE });
      await c.connect();
      await c.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`);
      await c.end();
    },
  };
}
