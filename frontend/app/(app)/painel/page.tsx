"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useApp } from "../../../components/app/ContextoApp"
import { StatsGrid } from "../../../components/dashboard/StatsGrid"
import { AgendaDoDia } from "../../../components/dashboard/Agenda"
import { Button } from "../../../components/ui/button"
import { usePainel } from "../../../hooks/usePainel"
import { useAtualizacaoAutomatica } from "../../../hooks/useAtualizacaoAutomatica"
import { useStatusReserva } from "../../../hooks/useStatusReserva"
import { useQuartos } from "../../../hooks/useQuartos"
import type { StatusReserva } from "../../../lib/status"

export default function Painel() {
  const { auth } = useApp()
  const pousada = auth.pousada!
  const { estatisticas, agenda, erro, carregar } = usePainel(pousada.id)
  const { mudarStatus, mudando } = useStatusReserva()
  const { quartos, carregar: carregarQuartos } = useQuartos()
  useEffect(() => { void carregarQuartos() }, [carregarQuartos, pousada.id])
  const nomesDosQuartos = Object.fromEntries(quartos.map((q) => [q.numero, q.nome]))
  const somenteLeitura = auth.user?.role === "auditoria" && !auth.user?.is_owner

  async function mudar(id: number, status: StatusReserva) {
    const res = await mudarStatus(id, status)
    auth.setMessage({ type: res.sucesso ? "success" : "error", text: res.mensagem })
    if (res.sucesso) void carregar()
  }

  useEffect(() => { void carregar() }, [carregar])
  useAtualizacaoAutomatica(carregar, 60_000)

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Painel</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {[pousada.cidade && pousada.estado ? `${pousada.cidade} - ${pousada.estado}` : null, pousada.telefone]
              .filter(Boolean).join(" | ")}
          </p>
        </div>
        <Link href="/reservas/nova"><Button>Nova reserva</Button></Link>
      </div>

      {erro && (
        <div className="rounded-lg border border-rose-200/80 bg-rose-50/80 px-4 py-3 flex items-center justify-between gap-4">
          <p className="text-sm text-rose-800">{erro}</p>
          <Button variant="outline" size="sm" onClick={() => void carregar()}>Tentar novamente</Button>
        </div>
      )}

      <StatsGrid
        quartosOcupados={estatisticas?.quartos_ocupados ?? 0}
        totalQuartos={pousada.num_quartos}
        taxaOcupacao={estatisticas?.taxa_ocupacao ?? 0}
        chegadasHoje={agenda?.chegadas.length ?? 0}
        saidasHoje={agenda?.saidas.length ?? 0}
        aReceber={estatisticas?.receita_pendente ?? 0}
      />

      {agenda && (
        <AgendaDoDia
          {...agenda}
          onMudarStatus={somenteLeitura ? undefined : (id, status) => void mudar(id, status)}
          mudando={mudando}
          pousada={somenteLeitura ? undefined : pousada}
          nomesDosQuartos={nomesDosQuartos}
        />
      )}
    </div>
  )
}
