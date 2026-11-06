/**
 * Finalização automática de estadias vencidas.
 *
 * Nada mudava o status de uma reserva cuja saída já passou: ela ficava
 * "ativa" para sempre, inflando "reservas ativas" no painel e aparecendo em
 * "próximas reservas". Quase nenhuma recepção marca "finalizada" à mão.
 *
 * Um dia de tolerância depois da saída, para não fechar a estadia de quem
 * ainda está fazendo check-out tarde. Cada finalização vira registro na
 * auditoria (sem usuário: foi o sistema).
 *
 * Só finaliza reserva com check-in. Confirmada vencida pode ser no-show:
 * finalizar virava receita de estadia que não houve. Ela fica em revisão,
 * visível na agenda, até a decisão manual. A exceção é a data fechada na OTA,
 * que não é estadia nem receita e não tem o que revisar.
 */
import { pool } from '../db/index.js';
import { cancelarNoGateway, type CobrancaEncerrada } from '../models/Pix.js';
import { hojeLocal } from '../utils/datas.js';

export async function finalizarEstadiasVencidas(hoje: string = hojeLocal()): Promise<number> {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query<{ id: number }>(
      `UPDATE reservas
          SET status = 'finalizada', version = version + 1, updated_at = now(),
              check_out_em = COALESCE(check_out_em, now())
        WHERE (status = 'hospedada' OR (status = 'confirmada' AND ical_bloqueio AND COALESCE(valor, 0) = 0))
          AND deleted_at IS NULL
          AND data_saida < ($1::date - 1)
      RETURNING id`,
      [hoje],
    );
    if (rows.length > 0) {
      await cliente.query(
        `INSERT INTO auditoria (user_id, action, entity, entity_id, details)
         SELECT NULL, 'finalizacao_automatica', 'reserva', id, '{"motivo":"saída vencida"}'::jsonb
           FROM unnest($1::int[]) AS id`,
        [rows.map((r) => r.id)],
      );
    }
    const { rows: paraRevisar } = await cliente.query<{ id: number }>(
      `UPDATE reservas
          SET revisao_em = now(), revisao_motivo = 'Saída vencida sem check-in', updated_at = now()
        WHERE status = 'confirmada' AND deleted_at IS NULL AND revisao_em IS NULL
          AND data_saida < ($1::date - 1)
      RETURNING id`,
      [hoje],
    );
    if (paraRevisar.length > 0) {
      await cliente.query(
        `INSERT INTO auditoria (user_id, action, entity, entity_id, details)
         SELECT NULL, 'revisao_automatica', 'reserva', id, '{"motivo":"saída vencida sem check-in"}'::jsonb
           FROM unnest($1::int[]) AS id`,
        [paraRevisar.map((r) => r.id)],
      );
    }
    // Data corrigida para a frente: não há mais o que revisar.
    await cliente.query(
      `UPDATE reservas SET revisao_em = NULL, revisao_motivo = NULL
        WHERE revisao_em IS NOT NULL AND data_saida >= ($1::date - 1)`,
      [hoje],
    );
    await cliente.query('COMMIT');
    return rows.length;
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

/**
 * Pré-reservas vencidas: o prazo para o sinal passou sem confirmação. O
 * quarto é liberado (cancelada) e o motivo fica registrado.
 */
export async function expirarPreReservas(): Promise<number> {
  const cliente = await pool.connect();
  let encerradas: CobrancaEncerrada[] = [];
  let expiradas = 0;
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query<{ id: number }>(
      `UPDATE reservas
          SET status = 'cancelada', cancelada_em = now(), motivo_cancelamento = 'Pré-reserva expirada sem confirmação',
              version = version + 1, updated_at = now()
        WHERE status = 'pre_reserva' AND deleted_at IS NULL AND expira_em IS NOT NULL AND expira_em < now()
      RETURNING id`,
    );
    if (rows.length > 0) {
      await cliente.query(
        `INSERT INTO auditoria (user_id, action, entity, entity_id, details)
         SELECT NULL, 'pre_reserva_expirada', 'reserva', id, '{"motivo":"prazo do sinal vencido"}'::jsonb
           FROM unnest($1::int[]) AS id`,
        [rows.map((r) => r.id)],
      );
      // O Pix do sinal dessas pré-reservas deixa de valer.
      const cobrancas = await cliente.query<CobrancaEncerrada>(
        `UPDATE cobrancas_pix SET status = 'expirada' WHERE reserva_id = ANY($1::int[]) AND status = 'pendente'
         RETURNING pousada_id, provedor, provedor_id`,
        [rows.map((r) => r.id)],
      );
      encerradas = cobrancas.rows;
    }
    await cliente.query('COMMIT');
    expiradas = rows.length;
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
  // Depois do commit e sem conexão presa: é chamada de rede.
  await cancelarNoGateway(encerradas);
  return expiradas;
}
