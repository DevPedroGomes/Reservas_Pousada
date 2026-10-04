/**
 * Ciclo de status da reserva — espelho de backend/utils/status.ts.
 *
 * O servidor é quem decide (recusa com 409 o que não pode); aqui serve só
 * para a tela oferecer os botões e opções que fazem sentido.
 */
export const STATUS_RESERVA = ["pre_reserva", "confirmada", "hospedada", "finalizada", "cancelada", "no_show"] as const
export type StatusReserva = (typeof STATUS_RESERVA)[number]

/** Status que seguram o quarto. */
export const STATUS_QUE_OCUPAM: readonly StatusReserva[] = ["pre_reserva", "confirmada", "hospedada"]

/** Com que status uma reserva pode nascer. */
export const STATUS_INICIAIS: readonly StatusReserva[] = ["confirmada", "pre_reserva", "hospedada"]

export const ROTULO_STATUS: Record<StatusReserva, string> = {
  pre_reserva: "Pré-reserva",
  confirmada: "Confirmada",
  hospedada: "Hospedada",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
  no_show: "Não compareceu",
}

export const COR_STATUS: Record<StatusReserva, "default" | "secondary" | "success" | "warning" | "destructive"> = {
  pre_reserva: "warning",
  confirmada: "default",
  hospedada: "success",
  finalizada: "secondary",
  cancelada: "destructive",
  no_show: "destructive",
}

/** Como a ação aparece num botão ("passar para X"). */
export const ROTULO_ACAO: Record<StatusReserva, string> = {
  pre_reserva: "Voltar para pré-reserva",
  confirmada: "Confirmar",
  hospedada: "Check-in",
  finalizada: "Check-out",
  cancelada: "Cancelar",
  no_show: "Não compareceu",
}

const TRANSICOES: Record<StatusReserva, readonly StatusReserva[]> = {
  pre_reserva: ["confirmada", "cancelada"],
  confirmada: ["hospedada", "cancelada", "no_show", "pre_reserva"],
  hospedada: ["finalizada", "confirmada"],
  finalizada: ["hospedada"],
  cancelada: ["confirmada", "pre_reserva"],
  no_show: ["confirmada", "cancelada"],
}

export function ehStatusReserva(v: unknown): v is StatusReserva {
  return typeof v === "string" && (STATUS_RESERVA as readonly string[]).includes(v)
}

export function rotuloStatus(status: string): string {
  return ehStatusReserva(status) ? ROTULO_STATUS[status] : status
}

/** Para onde a reserva pode ir, respeitando a data (check-in e no-show só a partir da entrada). */
export function proximosStatus(atual: string, dataEntrada: string, hoje: string): StatusReserva[] {
  if (!ehStatusReserva(atual)) return []
  return TRANSICOES[atual].filter((s) => !((s === "hospedada" || s === "no_show") && dataEntrada > hoje))
}

/**
 * O próximo passo natural, para um botão de um clique: confirmar a
 * pré-reserva, fazer o check-in no dia da chegada, o check-out de quem está.
 */
export function acaoPrincipal(atual: string, dataEntrada: string, hoje: string): StatusReserva | null {
  if (atual === "pre_reserva") return "confirmada"
  if (atual === "confirmada" && dataEntrada <= hoje) return "hospedada"
  if (atual === "hospedada") return "finalizada"
  return null
}

/** Hoje no fuso da pousada (mesma referência do servidor), em YYYY-MM-DD. */
export function hojeNaPousada(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
}
