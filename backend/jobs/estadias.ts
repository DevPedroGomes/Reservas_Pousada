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
 */
import { pool } from '../db/index.js';
import { hojeLocal } from '../utils/datas.js';

export async function finalizarEstadiasVencidas(hoje: string = hojeLocal()): Promise<number> {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query<{ id: number }>(
      `UPDATE reservas
          SET status = 'finalizada', version = version + 1, updated_at = now()
        WHERE status = 'ativa'
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
    await cliente.query('COMMIT');
    return rows.length;
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}
