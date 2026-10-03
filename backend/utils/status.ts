/**
 * Status de reserva — fonte única dos agrupamentos usados em consultas.
 * Mudou o ciclo de status, muda aqui (e na constraint anti-overbooking).
 */
export const STATUS_QUE_OCUPAM = ['ativa'] as const;
