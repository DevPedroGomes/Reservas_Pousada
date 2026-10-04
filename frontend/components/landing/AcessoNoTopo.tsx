"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSession } from "../../lib/auth-client"

/**
 * Botões do topo da página pública. Quem já está logado e abre o endereço do
 * site vai direto para o painel — é o que o dono da pousada espera ao abrir o
 * favorito de manhã.
 */
export function AcessoNoTopo() {
  const router = useRouter()
  const { data: sessao } = useSession()

  useEffect(() => {
    if (sessao?.user) router.replace("/painel")
  }, [sessao, router])

  return (
    <div className="flex items-center gap-2">
      <Link href="/entrar" className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">Entrar</Link>
      <Link href="/cadastro" className="rounded-lg bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
        Testar grátis
      </Link>
    </div>
  )
}
