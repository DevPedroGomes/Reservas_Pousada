/**
 * Consentimento para cookies não essenciais (medição e anúncios).
 *
 * Fica no localStorage do visitante. Nada de medição carrega antes de um
 * "aceitar" explícito (LGPD, art. 7º, I). Quem recusa usa o site normalmente.
 */
export type Consentimento = { medicao: boolean; anuncios: boolean; em: string }

const CHAVE = "diaria:consentimento:v1"
export const EVENTO_CONSENTIMENTO = "diaria:consentimento"
/** Reabre o aviso de cookies (link "Preferências de cookies"). */
export const EVENTO_ABRIR_AVISO = "diaria:abrir-aviso-de-cookies"

export function abrirAvisoDeCookies(): void {
  window.dispatchEvent(new Event(EVENTO_ABRIR_AVISO))
}

export function lerConsentimento(): Consentimento | null {
  if (typeof window === "undefined") return null
  try {
    const bruto = window.localStorage.getItem(CHAVE)
    return bruto ? (JSON.parse(bruto) as Consentimento) : null
  } catch {
    return null
  }
}

/** Cookies que GA e Pixel gravam no domínio do site. */
function apagarCookiesDeRastreio(): void {
  const dominios = ["", window.location.hostname, `.${window.location.hostname.split(".").slice(-3).join(".")}`]
  for (const par of document.cookie.split("; ")) {
    const nome = par.split("=")[0]
    if (!/^(_ga|_gid|_fbp|_fbc)/.test(nome)) continue
    for (const d of dominios) {
      document.cookie = `${nome}=; Max-Age=0; path=/${d ? `; domain=${d}` : ""}`
    }
  }
}

/**
 * Leva a decisão ao servidor quando há sessão: é ele que manda as conversões da
 * Meta, então revogar aqui precisa parar o envio de lá. Sem sessão a chamada
 * volta 401 e não importa: a escolha vai no cadastro.
 */
function sincronizarComAConta(anuncios: boolean): void {
  const api = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api/conta/consentimento`
  fetch(api, {
    method: "PUT",
    credentials: "include",
    // A revogação recarrega a página logo em seguida: sem keepalive o envio é cortado.
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ anuncios }),
  }).catch(() => {})
}

export function gravarConsentimento(c: Omit<Consentimento, "em">): void {
  const anterior = lerConsentimento()
  const valor: Consentimento = { ...c, em: new Date().toISOString() }
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(valor))
  } catch {
    /* sem storage: vale só nesta página */
  }
  window.dispatchEvent(new CustomEvent(EVENTO_CONSENTIMENTO, { detail: valor }))
  sincronizarComAConta(c.anuncios)

  // Revogação: os scripts já carregados não descarregam. Apaga os cookies e
  // recarrega a página, que volta sem GA e sem Pixel.
  const revogou = (anterior?.medicao && !c.medicao) || (anterior?.anuncios && !c.anuncios)
  if (revogou) {
    apagarCookiesDeRastreio()
    window.location.reload()
  }
}

/** Há algum rastreador configurado? Sem nenhum, não existe o que consentir. */
export function temRastreadores(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_GA_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID)
}
