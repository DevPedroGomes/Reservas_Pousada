"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useApp } from "../../../../components/app/ContextoApp"
import { ReservationForm } from "../../../../components/reservations/ReservationForm"
import { useReservations } from "../../../../hooks/useReservations"
import { useQuartos } from "../../../../hooks/useQuartos"
import type { Reserva } from "../../../../lib/types"

export default function EditarReserva() {
  const router = useRouter()
  const params = useParams()
  const id = Number(params.id)
  const { auth } = useApp()
  const r = useReservations(true, auth.pousada?.id)
  const [reserva, setReserva] = useState<Reserva | null>(null)
  const [naoEncontrada, setNaoEncontrada] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const { quartos, carregar: carregarQuartos } = useQuartos()
  useEffect(() => { void carregarQuartos() }, [carregarQuartos])
  // Na edição, o quarto atual entra mesmo se tiver sido desativado depois.
  const quartosDoFormulario = quartos.filter((q) => q.ativo || q.numero === Number(reserva?.quarto))

  useEffect(() => {
    if (!Number.isInteger(id)) { setNaoEncontrada(true); return }
    void (async () => {
      const dados = await r.editarReserva(id)
      if (!dados) { setNaoEncontrada(true); return }
      setReserva(dados)
      await r.carregarAuditoria(id)
    })()
  }, [id, auth.pousada?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function salvar(dados: Reserva) {
    setSalvando(true)
    const resultado = await r.salvarReserva(dados, id)
    setSalvando(false)
    auth.setMessage({ type: resultado.sucesso ? "success" : "error", text: resultado.mensagem })
    if (resultado.sucesso) router.push("/reservas")
  }

  if (naoEncontrada) {
    return <p className="text-sm text-muted-foreground">Reserva não encontrada nesta pousada.</p>
  }
  if (!reserva) {
    return <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  }

  return (
    <ReservationForm
      initialData={reserva}
      isEditing
      quartos={quartosDoFormulario}
      auditLogs={r.auditLogs}
      onSubmit={salvar}
      onCancel={() => router.push("/reservas")}
      loading={salvando}
    />
  )
}
