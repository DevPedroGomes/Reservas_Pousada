/**
 * Atribuição: de onde veio o visitante (primeiro toque).
 *
 * Guardado no localStorage na PRIMEIRA visita com informação útil (utm_*,
 * gclid, fbclid ou referrer externo) e enviado no cadastro. Visitas
 * seguintes não sobrescrevem — o canal que trouxe a pessoa é o que paga a
 * conta do anúncio.
 */
import { lerConsentimento } from "./consentimento"

const CHAVE = "diaria:origem:v1"
const PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"] as const

type Origem = Record<string, string | boolean>

function ler(): Origem | null {
  try {
    const v = window.localStorage.getItem(CHAVE)
    return v ? (JSON.parse(v) as Origem) : null
  } catch {
    return null
  }
}

export function capturarOrigem(): void {
  if (typeof window === "undefined" || ler()) return
  const url = new URL(window.location.href)
  const origem: Origem = {}
  for (const p of PARAMS) {
    const v = url.searchParams.get(p)
    if (v) origem[p] = v.slice(0, 300)
  }
  const ref = document.referrer
  if (ref && !ref.startsWith(window.location.origin)) origem.referrer = ref.slice(0, 300)
  if (Object.keys(origem).length === 0) return // visita direta: espera uma com informação
  origem.landing = url.pathname
  origem.primeira_visita = new Date().toISOString()
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(origem))
  } catch {
    /* sem storage */
  }
}

function cookie(nome: string): string | undefined {
  return document.cookie.split("; ").find((c) => c.startsWith(`${nome}=`))?.split("=")[1]
}

/** O que vai junto no cadastro: origem + ids dos rastreadores + consentimento. */
export function origemParaCadastro(): Origem | undefined {
  if (typeof window === "undefined") return undefined
  const origem: Origem = { ...(ler() ?? {}) }
  const consentimento = lerConsentimento()
  if (consentimento) origem.consentimento_anuncios = consentimento.anuncios
  // _ga = GA1.1.<client_id em duas partes>; só existe se o GA carregou (com consentimento).
  const ga = cookie("_ga")
  if (ga) origem.ga_client_id = ga.split(".").slice(-2).join(".")
  const fbp = cookie("_fbp")
  if (fbp) origem.fbp = fbp
  return Object.keys(origem).length > 0 ? origem : undefined
}
