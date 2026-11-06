"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSession } from "../../lib/auth-client"

/**
 * Botões do topo da página pública. Quem já está logado e abre o endereço do
 * site vai direto para o painel, que é o que o dono da pousada espera ao abrir
 * o favorito de manhã.
 */
export function AcessoNoTopo() {
  const router = useRouter()
  const { data: sessao } = useSession()

  useEffect(() => {
    if (sessao?.user) router.replace("/painel")
  }, [sessao, router])

  return (
    <div className="topo-acesso">
      <Link href="/entrar" className="topo-entrar">Entrar</Link>
      <Link href="/cadastro" className="topo-testar">Testar grátis</Link>
    </div>
  )
}
