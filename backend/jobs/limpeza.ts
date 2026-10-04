/** Limpeza periódica: sessões expiradas, janelas de rate limit vencidas e conversas antigas do WhatsApp. */
import { pool } from '../db/index.js';
import { limparRateLimitsVencidos } from '../utils/rateLimitStore.js';

/** Mensagens do WhatsApp (dado pessoal) ficam 90 dias: o bastante para o atendimento. */
const DIAS_WHATSAPP = 90;

export async function limpeza(): Promise<{ sessoes: number; rateLimits: number; mensagensWhatsapp: number }> {
  const sessoes = (await pool.query('DELETE FROM session WHERE expires_at < NOW()')).rowCount ?? 0;
  const rateLimits = await limparRateLimitsVencidos(pool);
  const mensagensWhatsapp = (await pool.query(
    `DELETE FROM whatsapp_mensagens WHERE created_at < now() - make_interval(days => $1)`, [DIAS_WHATSAPP],
  )).rowCount ?? 0;
  // Conversa sem mensagem nenhuma: sai, menos a de quem pediu para não receber (o "parar" precisa valer).
  await pool.query(
    `DELETE FROM whatsapp_conversas c WHERE NOT c.optout AND c.ultima_mensagem_em < now() - make_interval(days => $1)
       AND NOT EXISTS (SELECT 1 FROM whatsapp_mensagens m WHERE m.conversa_id = c.id)`,
    [DIAS_WHATSAPP],
  );
  return { sessoes, rateLimits, mensagensWhatsapp };
}
