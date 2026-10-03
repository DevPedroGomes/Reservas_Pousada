"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useApp } from "../../../../components/app/ContextoApp"
import { ReservationForm } from "../../../../components/reservations/ReservationForm"
import { useReservations } from "../../../../hooks/useReservations"
import { useQuartos } from "../../../../hooks/useQuartos"
import type { Reserva } from "../../../../lib/types"

export default function NovaReserva() {
  const router = useRouter()
  const { auth } = useApp()
  const r = useReservations(true, auth.pousada?.id)
  const [salvando, setSalvando] = useState(false)
  const { quartos, carregar: carregarQuartos } = useQuartos()
  useEffect(() => { void carregarQuartos() }, [carregarQuartos])
  const quartosDoFormulario = quartos.filter((q) => q.ativo)

  async function salvar(dados: Reserva) {
    setSalvando(true)
    const resultado = await r.salvarReserva(dados, null)
    setSalvando(false)
    auth.setMessage({ type: resultado.sucesso ? "success" : "error", text: resultado.mensagem })
    if (resultado.sucesso) router.push("/reservas")
  }

  return (
    <ReservationForm
      initialData={null}
      isEditing={false}
      quartos={quartosDoFormulario}
      auditLogs={[]}
      onSubmit={salvar}
      onCancel={() => router.push("/reservas")}
      loading={salvando}
    />
  )
}
