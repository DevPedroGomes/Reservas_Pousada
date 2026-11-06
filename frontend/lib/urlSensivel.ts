/**
 * Endereços que carregam credencial no caminho ou na query: link de
 * pré-check-in, convite, redefinição de senha, confirmação de e-mail. Quem
 * abre um deles não pode mandar esse endereço para GA ou Meta, que registram a
 * URL inteira da página e a de onde a pessoa veio.
 */
const CAMINHOS = ["/checkin/", "/convite/", "/reset-password", "/verify-email"]
const PARAMETROS = ["token", "convite"]

export function urlSensivel(endereco: string): boolean {
  let url: URL
  try {
    url = new URL(endereco, "https://diaria.invalid")
  } catch {
    return true // na dúvida, não mede
  }
  return CAMINHOS.some((c) => url.pathname.startsWith(c)) || PARAMETROS.some((p) => url.searchParams.has(p))
}

/** Caminho sem o token, para guardar como página de entrada. */
export function caminhoSemToken(caminho: string): string {
  return caminho.replace(/^\/(checkin|convite)\/[^/]+/, "/$1/:token")
}
