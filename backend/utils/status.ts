/**
 * Ciclo de status da reserva — fonte única (migration 017).
 *
 *   pre_reserva -> confirmada -> hospedada -> finalizada
 *        \             \-> no_show
 *         \-> cancelada (também a partir de confirmada)
 */
export const STATUS_RESERVA = ['pre_reserva', 'confirmada', 'hospedada', 'finalizada', 'cancelada', 'no_show'] as const;
export type StatusReserva = (typeof STATUS_RESERVA)[number];

/** Status que seguram o quarto (entram na constraint anti-overbooking). */
export const STATUS_QUE_OCUPAM = ['pre_reserva', 'confirmada', 'hospedada'] as const;

/** Status de reserva "em aberto" para valores a receber. */
export const STATUS_A_RECEBER = ['pre_reserva', 'confirmada', 'hospedada', 'finalizada'] as const;

export function ehStatusReserva(v: unknown): v is StatusReserva {
  return typeof v === 'string' && (STATUS_RESERVA as readonly string[]).includes(v);
}

/**
 * Transições permitidas. Inclui os "desfazer" que a recepção precisa no dia
 * a dia (check-out feito por engano, cancelamento revertido) — o banco ainda
 * recusa reativar se o quarto já foi ocupado por outra reserva.
 */
const TRANSICOES: Record<StatusReserva, readonly StatusReserva[]> = {
  pre_reserva: ['confirmada', 'cancelada'],
  confirmada: ['hospedada', 'cancelada', 'no_show', 'pre_reserva'],
  hospedada: ['finalizada', 'confirmada'],
  finalizada: ['hospedada'],
  cancelada: ['confirmada', 'pre_reserva'],
  no_show: ['confirmada', 'cancelada'],
};

export function podeTransitar(de: string, para: string): boolean {
  if (de === para) return true;
  return ehStatusReserva(de) && ehStatusReserva(para) && TRANSICOES[de].includes(para);
}

export const ROTULO_STATUS: Record<StatusReserva, string> = {
  pre_reserva: 'pré-reserva',
  confirmada: 'confirmada',
  hospedada: 'hospedada',
  finalizada: 'finalizada',
  cancelada: 'cancelada',
  no_show: 'não compareceu',
};
