/**
 * Consentimento para cookies não essenciais (medição e anúncios).
 *
 * Fica no localStorage do visitante. Nada de medição carrega antes de um
 * "aceitar" explícito (LGPD, art. 7º, I). Quem recusa usa o site normalmente.
 */
export type Consentimento = { medicao: boolean; anuncios: boolean; em: string }

const CHAVE = "diaria:consentimento:v1"
export const EVENTO_CONSENTIMENTO = "diaria:consentimento"

export function lerConsentimento(): Consentimento | null {
  if (typeof window === "undefined") return null
  try {
    const bruto = window.localStorage.getItem(CHAVE)
    return bruto ? (JSON.parse(bruto) as Consentimento) : null
  } catch {
    return null
  }
}

export function gravarConsentimento(c: Omit<Consentimento, "em">): void {
  const valor: Consentimento = { ...c, em: new Date().toISOString() }
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(valor))
  } catch {
    /* sem storage: vale só nesta página */
  }
  window.dispatchEvent(new CustomEvent(EVENTO_CONSENTIMENTO, { detail: valor }))
}

/** Há algum rastreador configurado? Sem nenhum, não existe o que consentir. */
export function temRastreadores(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_GA_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID)
}
