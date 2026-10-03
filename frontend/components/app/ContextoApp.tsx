"use client"

import { createContext, useContext } from "react"
import { useAuth } from "../../hooks/useAuth"
import { useAssinatura } from "../../hooks/useAssinatura"

type ValorApp = {
  auth: ReturnType<typeof useAuth>
  assinatura: ReturnType<typeof useAssinatura>
}

const Contexto = createContext<ValorApp | null>(null)

/**
 * Sessão, pousada da aba e assinatura carregadas UMA vez para toda a área
 * logada. Com uma página por rota, cada tela chamando useAuth por conta
 * própria refaria as mesmas consultas a cada navegação.
 */
export function ProvedorApp({ children }: { children: React.ReactNode }) {
  const auth = useAuth()
  const assinatura = useAssinatura(auth.isAuthenticated, auth.pousada?.id)
  return <Contexto.Provider value={{ auth, assinatura }}>{children}</Contexto.Provider>
}

export function useApp(): ValorApp {
  const v = useContext(Contexto)
  if (!v) throw new Error("useApp fora do ProvedorApp")
  return v
}
