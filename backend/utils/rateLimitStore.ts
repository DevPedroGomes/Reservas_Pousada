/**
 * Store do express-rate-limit no Postgres.
 *
 * Um contador por chave (prefixo do limitador + cliente), com janela fixa:
 * o upsert reinicia a contagem quando a janela vence. Uma ida ao banco por
 * requisição, atômica — duas réplicas contando o mesmo cliente somam no mesmo
 * lugar.
 */
import type { IncrementResponse, Options, Store } from 'express-rate-limit';
import type { Pool } from 'pg';

export class StorePostgres implements Store {
  prefix: string;
  // Contadores compartilhados entre instâncias (não são locais ao processo).
  localKeys = false;
  private janelaMs = 60_000;

  constructor(private readonly pool: Pool, prefixo: string) {
    this.prefix = `${prefixo}:`;
  }

  init(options: Options): void {
    this.janelaMs = options.windowMs;
  }

  async increment(chave: string): Promise<IncrementResponse> {
    const { rows } = await this.pool.query<{ hits: number; reset_em: Date }>(
      `INSERT INTO rate_limits (chave, hits, reset_em)
       VALUES ($1, 1, now() + ($2 || ' milliseconds')::interval)
       ON CONFLICT (chave) DO UPDATE SET
         hits = CASE WHEN rate_limits.reset_em <= now() THEN 1 ELSE rate_limits.hits + 1 END,
         reset_em = CASE WHEN rate_limits.reset_em <= now() THEN EXCLUDED.reset_em ELSE rate_limits.reset_em END
       RETURNING hits, reset_em`,
      [this.prefix + chave, String(this.janelaMs)],
    );
    return { totalHits: rows[0].hits, resetTime: rows[0].reset_em };
  }

  async decrement(chave: string): Promise<void> {
    await this.pool.query(
      `UPDATE rate_limits SET hits = GREATEST(hits - 1, 0) WHERE chave = $1 AND reset_em > now()`,
      [this.prefix + chave],
    );
  }

  async resetKey(chave: string): Promise<void> {
    await this.pool.query(`DELETE FROM rate_limits WHERE chave = $1`, [this.prefix + chave]);
  }
}

/** Remove janelas vencidas. Chamado pela limpeza periódica. */
export async function limparRateLimitsVencidos(pool: Pool): Promise<number> {
  const r = await pool.query(`DELETE FROM rate_limits WHERE reset_em < now() - interval '1 hour'`);
  return r.rowCount ?? 0;
}
