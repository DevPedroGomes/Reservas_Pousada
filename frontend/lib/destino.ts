/**
 * Caminho interno a partir de um destino que veio da URL (?proximo=), ou null.
 *
 * Resolve o destino como o navegador resolveria e só aceita a mesma origem.
 * O filtro antigo só barrava "//": "/%5Cevil.example" e "/%09/evil.example"
 * chegam aqui já decodificados ("/\evil.example", "/<tab>/evil.example") e o
 * navegador trata os dois como "//evil.example" — outro domínio.
 */
export function caminhoInterno(destino: string | null | undefined, origem: string): string | null {
  if (!destino) return null
  const base = new URL(origem).origin
  let url: URL
  try {
    url = new URL(destino, base)
  } catch {
    return null
  }
  if (url.origin !== base) return null

  // Defesa extra: o caminho ainda codificado ("/%5Cevil.example", vindo de
  // um valor duplamente codificado) não pode virar outro domínio se alguém
  // decodificá-lo mais adiante.
  try {
    if (new URL(decodeURIComponent(url.pathname), base).origin !== base) return null
  } catch {
    return null
  }

  return url.pathname + url.search + url.hash
}
