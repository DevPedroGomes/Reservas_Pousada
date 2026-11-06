/**
 * Verificação Cloudflare Turnstile do pedido público. Opcional: só vale com
 * TURNSTILE_SECRET_KEY presente.
 *
 * Token ausente ou recusado barra o pedido. Cloudflare fora do ar não barra:
 * perder venda de verdade é pior, e os limites por IP, pousada e e-mail seguem
 * valendo.
 */
import { reportarErro } from './observabilidade.js';

const URL_VERIFICACAO = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verificarTurnstile(token: unknown, ip: string | undefined): Promise<boolean> {
  const segredo = process.env.TURNSTILE_SECRET_KEY;
  if (!segredo) return true;
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  try {
    const corpo = new URLSearchParams({ secret: segredo, response: token, ...(ip ? { remoteip: ip } : {}) });
    const r = await fetch(URL_VERIFICACAO, { method: 'POST', body: corpo, signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error(`Turnstile respondeu ${r.status}`);
    const j = (await r.json()) as { success?: boolean };
    return j.success === true;
  } catch (err) {
    console.error('[Turnstile] verificação indisponível:', err instanceof Error ? err.message : err);
    reportarErro(err, { servico: 'turnstile' });
    return true;
  }
}
