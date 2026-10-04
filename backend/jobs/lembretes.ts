/**
 * Lembrete de chegada (véspera) pelo WhatsApp, para pousadas que ligaram a
 * opção. Sai pelo número da própria pousada quando ela conectou o WhatsApp
 * Business (modelo lembrete_chegada, criado na conexão); senão, pelo número
 * da plataforma, se houver (lib/whatsapp.ts). Quem respondeu "parar" no
 * WhatsApp da pousada não recebe.
 *
 * Não importa models/WhatsappBusiness.ts de propósito: este arquivo é
 * carregado por lib/fila.ts, e aquele registra trabalhador na fila.
 */
import { pool } from '../db/index.js';
import { enviarModelo, whatsappApiConfigurada } from '../lib/whatsapp.js';
import { meta } from '../lib/metaWhatsapp.js';
import { decifrarSegredo } from '../utils/crypto.js';
import { hojeLocal } from '../utils/datas.js';

export async function lembretesDeChegada(
  enviar: typeof enviarModelo = enviarModelo,
): Promise<{ enviados: number; falhas: number }> {
  const plataforma = whatsappApiConfigurada();
  const amanha = new Date(Date.parse(`${hojeLocal()}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);
  const { rows } = await pool.query(
    `SELECT r.id, h.nome AS hospede, h.telefone, p.nome AS pousada, q.nome AS quarto, r.data_entrada::text AS entrada,
            w.phone_number_id, w.token_cifrado
       FROM reservas r
       JOIN pousadas p ON p.id = r.pousada_id
       JOIN hospedes h ON h.id = r.hospede_id
       LEFT JOIN quartos q ON q.pousada_id = r.pousada_id AND q.numero = r.quarto
       LEFT JOIN whatsapp_contas w ON w.pousada_id = r.pousada_id
      WHERE r.data_entrada = $1 AND r.status = 'confirmada' AND r.deleted_at IS NULL AND r.lembrete_enviado_em IS NULL
        AND h.telefone IS NOT NULL AND p.excluida_em IS NULL
        AND (p.configuracoes->>'whatsapp_lembrete')::boolean IS TRUE
        AND (w.pousada_id IS NOT NULL OR $2::boolean)
        AND NOT EXISTS (SELECT 1 FROM whatsapp_conversas c WHERE c.pousada_id = r.pousada_id AND c.contato = h.telefone AND c.optout)
      LIMIT 1000`,
    [amanha, plataforma],
  );
  const modelo = process.env.WHATSAPP_MODELO_LEMBRETE || 'lembrete_chegada';
  let enviados = 0;
  let falhas = 0;
  for (const r of rows) {
    try {
      // Marca antes de enviar (e desfaz se falhar): duas execuções simultâneas não mandam em dobro.
      const { rowCount } = await pool.query(
        `UPDATE reservas SET lembrete_enviado_em = now() WHERE id = $1 AND lembrete_enviado_em IS NULL`, [r.id],
      );
      if (!rowCount) continue;
      const parametros = [r.hospede.split(' ')[0], r.pousada, `${r.entrada.slice(8, 10)}/${r.entrada.slice(5, 7)}`, r.quarto ?? ''];
      try {
        if (r.phone_number_id) {
          await meta().enviarModelo(r.phone_number_id, decifrarSegredo(r.token_cifrado), r.telefone, 'lembrete_chegada', parametros);
        } else {
          await enviar(r.telefone, modelo, parametros);
        }
        enviados++;
      } catch (err) {
        await pool.query(`UPDATE reservas SET lembrete_enviado_em = NULL WHERE id = $1`, [r.id]);
        throw err;
      }
    } catch (err) {
      falhas++;
      console.error(`[WhatsApp] lembrete da reserva ${r.id} falhou:`, err instanceof Error ? err.message : err);
    }
  }
  return { enviados, falhas };
}
