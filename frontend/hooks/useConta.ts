"use client"

import { useCallback, useState } from "react"
import { API_URL, authenticatedFetch } from "../lib/api"
import { contaDaApi } from "../lib/adaptadores"
import type { ContaDaReserva } from "../lib/types"

type Resultado = { sucesso: boolean; mensagem: string }

/** Conta de uma reserva: carregar, lançar e remover pagamentos e consumos. */
export function useConta(reservaId: number) {
  const [conta, setConta] = useState<ContaDaReserva | null>(null)
  const [enviando, setEnviando] = useState(false)

  const chamar = useCallback(async (caminho: string, metodo: string, corpo?: unknown, ok = "Lançado."): Promise<Resultado> => {
    setEnviando(true)
    try {
      const r = await authenticatedFetch(`${API_URL}/reservas/${reservaId}${caminho}`, {
        method: metodo,
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      })
      const d = await r.json()
      if (d.sucesso) {
        setConta(contaDaApi(d.conta))
        return { sucesso: true, mensagem: ok }
      }
      return { sucesso: false, mensagem: [d.mensagem, ...(d.erros ?? [])].filter(Boolean).join(" ") }
    } catch {
      return { sucesso: false, mensagem: "Não foi possível conectar ao servidor." }
    } finally {
      setEnviando(false)
    }
  }, [reservaId])

  const carregar = useCallback(() => chamar("/conta", "GET"), [chamar])
  const lancarPagamento = useCallback((dados: Record<string, unknown>) => chamar("/pagamentos", "POST", dados, "Pagamento lançado."), [chamar])
  const removerPagamento = useCallback((id: number) => chamar(`/pagamentos/${id}`, "DELETE", undefined, "Pagamento removido."), [chamar])
  const lancarConsumo = useCallback((dados: Record<string, unknown>) => chamar("/consumos", "POST", dados, "Consumo lançado."), [chamar])
  const removerConsumo = useCallback((id: number) => chamar(`/consumos/${id}`, "DELETE", undefined, "Consumo removido."), [chamar])

  return { conta, enviando, carregar, lancarPagamento, removerPagamento, lancarConsumo, removerConsumo }
}
