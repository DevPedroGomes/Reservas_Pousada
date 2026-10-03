/** Limpeza periódica: sessões expiradas e janelas de rate limit vencidas. */
import { pool } from '../db/index.js';
import { limparRateLimitsVencidos } from '../utils/rateLimitStore.js';

export async function limpeza(): Promise<{ sessoes: number; rateLimits: number }> {
  const sessoes = (await pool.query('DELETE FROM session WHERE expires_at < NOW()')).rowCount ?? 0;
  const rateLimits = await limparRateLimitsVencidos(pool);
  return { sessoes, rateLimits };
}
