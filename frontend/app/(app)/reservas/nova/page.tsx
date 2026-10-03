"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useApp } from "../../../../components/app/ContextoApp"
import { ReservationForm } from "../../../../components/reservations/ReservationForm"
import { useReservations } from "../../../../hooks/useReservations"
import { useQuartos } from "../../../../hooks/useQuartos"
import { API_URL, authenticatedFetch } from "../../../../lib/api"
import { hospedeDaApi } from "../../../../lib/adaptadores"
import { formatarTelefone, mascaraCpf } from "../../../../lib/hospedes"
import { initialReservaForm, type Reserva } from "../../../../lib/types"

export default function NovaReserva() {
  const router = useRouter()
  const { auth } = useApp()
  const r = useReservations(true, auth.pousada?.id)
  const [salvando, setSalvando] = useState(false)
  const { quartos, carregar: carregarQuartos } = useQuartos()
  useEffect(() => { void carregarQuartos() }, [carregarQuartos])
  const quartosDoFormulario = quartos.filter((q) => q.ativo)
  // Vindo da ficha do hóspede (?hospede=ID): o formulário já abre com ele.
  const [inicial, setInicial] = useState<Reserva | null>(null)
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("hospede"))
    if (!Number.isInteger(id) || id <= 0) return
    void (async () => {
      const r = await authenticatedFetch(`${API_URL}/hospedes/${id}`)
      const d = await r.json()
      if (!d.sucesso) return
      const h = hospedeDaApi(d.hospede)
      setInicial({
        ...initialReservaForm,
        hospede_id: h.id, nome: h.nome, telefone: formatarTelefone(h.telefone), email: h.email, nacionalidade: h.nacionalidade,
        tipo_documento: h.tipo_documento, documento: h.tipo_documento === "cpf" ? mascaraCpf(h.documento) : h.documento,
      })
    })()
  }, [])

  async function salvar(dados: Reserva) {
    setSalvando(true)
    const resultado = await r.salvarReserva(dados, null)
    setSalvando(false)
    auth.setMessage({ type: resultado.sucesso ? "success" : "error", text: resultado.mensagem })
    if (resultado.sucesso) router.push("/reservas")
  }

  return (
    <ReservationForm
      initialData={inicial}
      isEditing={false}
      quartos={quartosDoFormulario}
      auditLogs={[]}
      onSubmit={salvar}
      onCancel={() => router.push("/reservas")}
      loading={salvando}
    />
  )
}
