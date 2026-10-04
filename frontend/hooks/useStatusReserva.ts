"use client"

import { useCallback, useState } from "react"
import { API_URL, authenticatedFetch } from "../lib/api"
import type { StatusReserva } from "../lib/status"

/** Muda o status de uma reserva (check-in, check-out, confirmar, cancelar...). */
export function useStatusReserva() {
  const [mudando, setMudando] = useState<number | null>(null)

  const mudarStatus = useCallback(async (
    id: number,
    status: StatusReserva,
    extra: { motivo?: string; prazo_horas?: number } = {},
  ): Promise<{ sucesso: boolean; mensagem: string }> => {
    setMudando(id)
    try {
      const r = await authenticatedFetch(`${API_URL}/reservas/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, ...extra }),
      })
      const d = await r.json()
      return { sucesso: Boolean(d.sucesso), mensagem: d.mensagem || "Não foi possível mudar o status." }
    } catch {
      return { sucesso: false, mensagem: "Não foi possível conectar ao servidor." }
    } finally {
      setMudando(null)
    }
  }, [])

  return { mudarStatus, mudando }
}
