"use client"

import { useCallback, useEffect, useState } from "react"
import { API_URL, authenticatedFetch } from "../lib/api"
import type { Ciclo, LimitesPlano, PlanoDisponivel, SituacaoAssinatura } from "../lib/types"

interface UseAssinaturaReturn {
  situacao: SituacaoAssinatura | null
  limites: LimitesPlano | null
  usuarios: number
  billingHabilitado: boolean
  planos: PlanoDisponivel[]
  ciclo: Ciclo
  carregando: boolean
  redirecionando: boolean
  erro: string | null
  setCiclo: (c: Ciclo) => void
  recarregar: () => Promise<void>
  assinar: (plano: string) => Promise<void>
  abrirPortal: () => Promise<void>
}

export function useAssinatura(autenticado: boolean, pousadaId?: number | null): UseAssinaturaReturn {
  const [situacao, setSituacao] = useState<SituacaoAssinatura | null>(null)
  const [limites, setLimites] = useState<LimitesPlano | null>(null)
  const [usuarios, setUsuarios] = useState(0)
  const [billingHabilitado, setBillingHabilitado] = useState(false)
  const [planos, setPlanos] = useState<PlanoDisponivel[]>([])
  const [ciclo, setCiclo] = useState<Ciclo>("mensal")
  const [carregando, setCarregando] = useState(false)
  const [redirecionando, setRedirecionando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const recarregar = useCallback(async () => {
    if (!autenticado) return
    setCarregando(true)
    try {
      const r = await authenticatedFetch(`${API_URL}/billing/situacao`)
      const data = await r.json()
      if (data.sucesso) {
        setSituacao(data.assinatura ?? null)
        setLimites(data.limites ?? null)
        setUsuarios(data.uso?.usuarios ?? 0)
        setBillingHabilitado(Boolean(data.billingHabilitado))
      }
    } catch {
      // Falha ao ler a situação não pode quebrar a tela: o backend já erra para
      // o lado de liberar, então a ausência de banner é o comportamento certo.
    } finally {
      setCarregando(false)
    }
  }, [autenticado])

  const carregarPlanos = useCallback(async (c: Ciclo) => {
    if (!autenticado) return
    try {
      const r = await authenticatedFetch(`${API_URL}/billing/planos?ciclo=${c}`)
      const data = await r.json()
      if (data.sucesso) setPlanos(data.planos ?? [])
    } catch {
      setPlanos([])
    }
  }, [autenticado])

  useEffect(() => {
    recarregar()
  }, [recarregar, pousadaId])

  useEffect(() => {
    carregarPlanos(ciclo)
  }, [carregarPlanos, ciclo])

  /**
   * Manda para o checkout do Stripe.
   *
   * Não fecha o estado de "redirecionando" no sucesso de propósito: a navegação
   * para fora leva alguns instantes, e voltar o botão ao normal antes disso
   * convida um segundo clique — e uma segunda sessão de checkout.
   */
  const assinar = useCallback(async (plano: string) => {
    setErro(null)
    setRedirecionando(true)
    try {
      const r = await authenticatedFetch(`${API_URL}/billing/checkout`, {
        method: "POST",
        body: JSON.stringify({ plano, ciclo }),
      })
      const data = await r.json()
      if (data.sucesso && data.url) {
        window.location.href = data.url
        return
      }
      setErro(data.mensagem || "Não foi possível iniciar o pagamento.")
      setRedirecionando(false)
    } catch {
      setErro("Não foi possível conectar ao servidor.")
      setRedirecionando(false)
    }
  }, [ciclo])

  const abrirPortal = useCallback(async () => {
    setErro(null)
    setRedirecionando(true)
    try {
      const r = await authenticatedFetch(`${API_URL}/billing/portal`, { method: "POST" })
      const data = await r.json()
      if (data.sucesso && data.url) {
        window.location.href = data.url
        return
      }
      setErro(data.mensagem || "Não foi possível abrir o portal de assinatura.")
      setRedirecionando(false)
    } catch {
      setErro("Não foi possível conectar ao servidor.")
      setRedirecionando(false)
    }
  }, [])

  return {
    situacao, limites, usuarios, billingHabilitado, planos, ciclo,
    carregando, redirecionando, erro,
    setCiclo, recarregar, assinar, abrirPortal,
  }
}

/** Preço em centavos → "R$ 149,00". O backend fala em centavos; a tela, em reais. */
export function formatarPreco(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}
