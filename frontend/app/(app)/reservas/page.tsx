"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useApp } from "../../../components/app/ContextoApp"
import { ReservationFilters } from "../../../components/reservations/ReservationFilters"
import { ReservationTable } from "../../../components/reservations/ReservationTable"
import { ConfirmDialog } from "../../../components/confirm-dialog"
import { Button } from "../../../components/ui/button"
import { useReservations } from "../../../hooks/useReservations"
import { useStatusReserva } from "../../../hooks/useStatusReserva"
import { useAtualizacaoAutomatica } from "../../../hooks/useAtualizacaoAutomatica"
import type { StatusReserva } from "../../../lib/status"

export default function ListaDeReservas() {
  const router = useRouter()
  const { auth } = useApp()
  const r = useReservations(true, auth.pousada?.id)
  const [excluindo, setExcluindo] = useState<number | null>(null)
  const { mudarStatus, mudando } = useStatusReserva()

  useEffect(() => { void r.carregarReservas() }, [auth.pousada?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useAtualizacaoAutomatica(() => { void r.carregarReservas() }, 60_000)

  async function confirmarExclusao() {
    if (excluindo === null) return
    const ok = await r.excluirReserva(excluindo)
    auth.setMessage(ok
      ? { type: "success", text: "Reserva excluída." }
      : { type: "error", text: "Não foi possível excluir a reserva." })
    setExcluindo(null)
    if (ok) void r.carregarReservas()
  }

  async function mudar(id: number, status: StatusReserva) {
    const res = await mudarStatus(id, status)
    auth.setMessage({ type: res.sucesso ? "success" : "error", text: res.mensagem })
    if (res.sucesso) void r.carregarReservas(r.meta.pagina || 1)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Reservas</h1>
        {(auth.user?.is_owner || auth.user?.role === "admin" || auth.user?.role === "recepcao") && (
          <Link href="/reservas/nova"><Button>Nova reserva</Button></Link>
        )}
      </div>

      {r.error && (
        <div className="rounded-lg border border-rose-200/80 bg-rose-50/80 px-4 py-3 flex items-center justify-between gap-4">
          <p className="text-sm text-rose-800">{r.error}</p>
          <Button variant="outline" size="sm" onClick={() => { r.clearError(); void r.carregarReservas() }}>Tentar novamente</Button>
        </div>
      )}

      <ReservationFilters
        filters={r.filters}
        onFiltersChange={r.setFilters}
        onApply={() => r.carregarReservas(1)}
        onExport={r.exportarCsv}
        onClear={r.clearFilters}
        total={r.meta.total}
        loading={r.loading}
        exporting={r.exporting}
      />

      <ReservationTable
        reservas={r.reservas}
        meta={r.meta}
        onPageChange={r.carregarReservas}
        onEdit={(id) => router.push(`/reservas/${id}`)}
        onDelete={(id) => setExcluindo(id)}
        onMudarStatus={auth.user?.role === "auditoria" && !auth.user?.is_owner ? undefined : (id, status) => void mudar(id, status)}
        mudando={mudando}
        loading={r.loading}
        userRole={auth.user?.is_owner ? "admin" : auth.user?.role}
      />

      <ConfirmDialog
        open={excluindo !== null}
        message="Tem certeza que deseja excluir esta reserva?"
        onCancel={() => setExcluindo(null)}
        onConfirm={confirmarExclusao}
      />
    </div>
  )
}
