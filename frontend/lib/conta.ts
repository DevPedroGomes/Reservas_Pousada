/** Conta da reserva: formas e tipos de pagamento. */
export const FORMAS_PAGAMENTO = [
  { valor: "pix", rotulo: "Pix" },
  { valor: "dinheiro", rotulo: "Dinheiro" },
  { valor: "cartao_credito", rotulo: "Cartão de crédito" },
  { valor: "cartao_debito", rotulo: "Cartão de débito" },
  { valor: "transferencia", rotulo: "Transferência" },
  { valor: "ota", rotulo: "Pago na OTA (Booking, Airbnb...)" },
  { valor: "outro", rotulo: "Outro" },
] as const

export const TIPOS_PAGAMENTO = [
  { valor: "sinal", rotulo: "Sinal" },
  { valor: "pagamento", rotulo: "Pagamento" },
  { valor: "estorno", rotulo: "Estorno (devolução)" },
] as const

export const rotuloForma = (v: string) => FORMAS_PAGAMENTO.find((f) => f.valor === v)?.rotulo ?? v
export const rotuloTipo = (v: string) => TIPOS_PAGAMENTO.find((t) => t.valor === v)?.rotulo.replace(/ \(.*\)$/, "") ?? v

export const reais = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

/** Saldo de uma linha da listagem: diárias + consumos - pago (centavos). */
export function saldoDaReserva(r: { valor?: number | string | null; consumos_centavos?: number; pago_centavos?: number }): number {
  const diarias = r.valor === null || r.valor === undefined || r.valor === "" ? 0 : Math.round(Number(r.valor) * 100)
  return diarias + (r.consumos_centavos ?? 0) - (r.pago_centavos ?? 0)
}
