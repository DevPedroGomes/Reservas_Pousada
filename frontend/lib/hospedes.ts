/**
 * Hóspede: documento, WhatsApp e canal de origem da reserva.
 */
export type TipoDocumento = "cpf" | "passaporte" | "outro"

export const ROTULO_DOCUMENTO: Record<TipoDocumento, string> = {
  cpf: "CPF",
  passaporte: "Passaporte",
  outro: "Outro documento",
}

/** De onde veio a reserva — espelho de CANAIS_RESERVA no backend. */
export const CANAIS = [
  { valor: "direto", rotulo: "Direto / balcão" },
  { valor: "whatsapp", rotulo: "WhatsApp" },
  { valor: "telefone", rotulo: "Telefone" },
  { valor: "instagram", rotulo: "Instagram" },
  { valor: "site", rotulo: "Site" },
  { valor: "booking", rotulo: "Booking.com" },
  { valor: "airbnb", rotulo: "Airbnb" },
  { valor: "expedia", rotulo: "Expedia" },
  { valor: "decolar", rotulo: "Decolar" },
  { valor: "outro", rotulo: "Outro" },
] as const

export function rotuloCanal(valor: string | null | undefined): string {
  return CANAIS.find((c) => c.valor === valor)?.rotulo ?? (valor || "-")
}

/**
 * O servidor guarda o telefone com DDI, só dígitos ("5548999990000"). Número
 * digitado no formulário sem "+" e com 10–11 dígitos ainda não passou por lá:
 * é brasileiro.
 */
function comDdi(digitos: string): string {
  return digitos.length <= 11 ? `55${digitos}` : digitos
}

/** "(48) 98888-7777" para número brasileiro; "+48 600100200" para estrangeiro. */
export function formatarTelefone(telefone: string | null | undefined): string {
  const bruto = (telefone || "").trim()
  const d = bruto.replace(/\D/g, "")
  if (!d) return ""
  const br = !bruto.startsWith("+") && d.length <= 11 ? d : d.startsWith("55") && (d.length === 12 || d.length === 13) ? d.slice(2) : null
  if (br?.length === 11) return `(${br.slice(0, 2)}) ${br.slice(2, 7)}-${br.slice(7)}`
  if (br?.length === 10) return `(${br.slice(0, 2)}) ${br.slice(2, 6)}-${br.slice(6)}`
  return `+${d}`
}

/** Link do WhatsApp (wa.me), opcionalmente com mensagem pronta. */
export function linkWhatsApp(telefone: string | null | undefined, mensagem?: string): string | null {
  const bruto = (telefone || "").trim()
  const d = bruto.replace(/\D/g, "")
  if (d.length < 10) return null
  const numero = bruto.startsWith("+") ? d : comDdi(d)
  return `https://wa.me/${numero}${mensagem ? `?text=${encodeURIComponent(mensagem)}` : ""}`
}

/** Máscara de digitação do CPF: 000.000.000-00. */
export function mascaraCpf(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 11)
  if (d.length > 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  if (d.length > 6) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  if (d.length > 3) return `${d.slice(0, 3)}.${d.slice(3)}`
  return d
}
