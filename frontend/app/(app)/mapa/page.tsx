"use client"

import { useCallback, useEffect, useState } from "react"
import { useApp } from "../../../components/app/ContextoApp"
import { Button } from "../../../components/ui/button"
import { Select } from "../../../components/ui/select"
import { LEGENDA, MapaOcupacao, somarDias, type QuartoDoMapa, type ReservaDoMapa } from "../../../components/mapa/MapaOcupacao"
import { useAtualizacaoAutomatica } from "../../../hooks/useAtualizacaoAutomatica"
import { API_URL, authenticatedFetch } from "../../../lib/api"
import { cn } from "../../../lib/utils"
import { hojeNaPousada, rotuloStatus } from "../../../lib/status"
import { formatarData } from "../../../lib/formatters"

/** Mapa de ocupação: a visão de quem atende o telefone e precisa dizer "tem vaga". */
export default function Mapa() {
  const { auth } = useApp()
  const hoje = hojeNaPousada()
  const [inicio, setInicio] = useState(() => somarDias(hoje, -2))
  const [dias, setDias] = useState(14)
  const [dados, setDados] = useState<{ quartos: QuartoDoMapa[]; reservas: ReservaDoMapa[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const podeCriar = Boolean(auth.user?.is_owner) || auth.user?.role === "admin" || auth.user?.role === "recepcao"

  const carregar = useCallback(async () => {
    try {
      const r = await authenticatedFetch(`${API_URL}/reservas/mapa?inicio=${inicio}&dias=${dias}`)
      const d = await r.json()
      if (!d.sucesso) { setErro(d.mensagem || "Não foi possível carregar o mapa."); return }
      setErro(null)
      setDados({
        quartos: d.quartos,
        reservas: (d.reservas as Record<string, unknown>[]).map((x) => ({
          id: x.id as number,
          quarto: x.quarto as number,
          nome: String(x.nome ?? ""),
          data_entrada: String(x.dataEntrada),
          data_saida: String(x.dataSaida),
          status: String(x.status),
          pago: Boolean(x.pago),
          adultos: Number(x.adultos ?? 1),
          criancas: Number(x.criancas ?? 0),
          canal: String(x.canal ?? ""),
        })),
      })
    } catch {
      setErro("Não foi possível conectar ao servidor.")
    }
  }, [inicio, dias])

  useEffect(() => { void carregar() }, [carregar, auth.pousada?.id])
  useAtualizacaoAutomatica(carregar, 60_000)

  const passo = dias === 14 ? 7 : 14
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mapa de ocupação</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {formatarData(inicio)} a {formatarData(somarDias(inicio, dias - 1))}
            {podeCriar && " · clique num espaço livre para reservar"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setInicio((d) => somarDias(d, -passo))} aria-label="Período anterior">←</Button>
          <Button variant="outline" size="sm" onClick={() => setInicio(somarDias(hoje, -2))}>Hoje</Button>
          <Button variant="outline" size="sm" onClick={() => setInicio((d) => somarDias(d, passo))} aria-label="Próximo período">→</Button>
          <Select aria-label="Dias no mapa" value={dias} onChange={(e) => setDias(Number(e.target.value))} className="h-9 w-28">
            <option value={14}>14 dias</option>
            <option value={30}>30 dias</option>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {LEGENDA.map((l) => (
          <span key={l.status} className="flex items-center gap-1.5">
            <span className={cn("inline-block h-3 w-5 rounded border", l.classe)} />
            {rotuloStatus(l.status)}
          </span>
        ))}
        <span className="flex items-center gap-1.5"><span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" /> a pagar</span>
      </div>

      {erro && (
        <div className="rounded-lg border border-rose-200/80 bg-rose-50/80 px-4 py-3 flex items-center justify-between gap-4">
          <p className="text-sm text-rose-800">{erro}</p>
          <Button variant="outline" size="sm" onClick={() => void carregar()}>Tentar novamente</Button>
        </div>
      )}

      {dados && (
        dados.quartos.length === 0
          ? <p className="text-sm text-muted-foreground">Cadastre os quartos em Quartos para ver o mapa.</p>
          : <MapaOcupacao inicio={inicio} dias={dias} hoje={hoje} quartos={dados.quartos} reservas={dados.reservas} podeCriar={podeCriar} />
      )}
    </div>
  )
}
