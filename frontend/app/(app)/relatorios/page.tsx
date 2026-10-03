"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useApp } from "../../../components/app/ContextoApp"
import { Button } from "../../../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card"
import { Input } from "../../../components/ui/input"
import { Label } from "../../../components/ui/label"
import { API_URL, authenticatedFetch } from "../../../lib/api"
import { formatarData, getStatusLabel } from "../../../lib/formatters"
import { reais, rotuloForma } from "../../../lib/conta"
import { rotuloCanal } from "../../../lib/hospedes"
import { hojeNaPousada } from "../../../lib/status"
import { cn } from "../../../lib/utils"

interface Relatorio {
  inicio: string; fim: string; dias: number; quartosAtivos: number
  noitesDisponiveis: number; noitesVendidas: number; reservas: number; ocupacao: number
  receitaHospedagemCentavos: number; adrCentavos: number; revparCentavos: number; consumosCentavos: number
  porCanal: { canal: string; reservas: number; noites: number; receitaCentavos: number }[]
  ocupacaoPorDia: { dia: string; ocupados: number; percentual: number }[]
  recebidoCentavos: number
  recebidoPorForma: { forma: string; centavos: number; lancamentos: number }[]
  cancelamentos: { canceladas: number; no_show: number; total: number }
  aReceberCentavos: number
  aReceber: { id: number; nome: string; quarto: number; data_entrada: string; data_saida: string; status: string; saldo_centavos: number }[]
}

const soma = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10)
const ultimoDiaDoMes = (d: string) => soma(`${soma(`${d.slice(0, 7)}-28`, 4).slice(0, 7)}-01`, -1)

function periodos(hoje: string) {
  const mesPassado = soma(`${hoje.slice(0, 7)}-01`, -1)
  return [
    { rotulo: "Este mês", inicio: `${hoje.slice(0, 7)}-01`, fim: ultimoDiaDoMes(hoje) },
    { rotulo: "Mês passado", inicio: `${mesPassado.slice(0, 7)}-01`, fim: mesPassado },
    { rotulo: "Próximos 30 dias", inicio: hoje, fim: soma(hoje, 29) },
    { rotulo: "Este ano", inicio: `${hoje.slice(0, 4)}-01-01`, fim: `${hoje.slice(0, 4)}-12-31` },
  ]
}

function Indicador({ titulo, valor, detalhe }: { titulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="rounded-lg border border-border bg-white px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{titulo}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{valor}</div>
      {detalhe && <div className="text-xs text-muted-foreground">{detalhe}</div>}
    </div>
  )
}

/** Números do negócio: ocupação, diária média, RevPAR, canais e caixa. */
export default function Relatorios() {
  const { auth } = useApp()
  const hoje = hojeNaPousada()
  const [periodo, setPeriodo] = useState(() => periodos(hoje)[0])
  const [rel, setRel] = useState<Relatorio | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      const r = await authenticatedFetch(`${API_URL}/relatorios?inicio=${periodo.inicio}&fim=${periodo.fim}`)
      const d = await r.json()
      if (d.sucesso) { setRel(d.relatorio); setErro(null) } else setErro(d.mensagem || "Não foi possível gerar o relatório.")
    } catch {
      setErro("Não foi possível conectar ao servidor.")
    }
  }, [periodo])
  useEffect(() => { void carregar() }, [carregar, auth.pousada?.id])

  const maxCanal = Math.max(1, ...(rel?.porCanal.map((c) => c.receitaCentavos) ?? [1]))

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {formatarData(periodo.inicio)} a {formatarData(periodo.fim)} · conta reservas confirmadas, hospedadas e finalizadas
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {periodos(hoje).map((p) => (
            <Button key={p.rotulo} size="sm" variant={p.rotulo === periodo.rotulo ? "default" : "outline"} onClick={() => setPeriodo(p)}>{p.rotulo}</Button>
          ))}
          <div className="flex items-end gap-1">
            <div><Label htmlFor="rel-ini" className="text-[11px]">De</Label><Input id="rel-ini" type="date" className="h-9" value={periodo.inicio} onChange={(e) => e.target.value && setPeriodo((p) => ({ ...p, rotulo: "", inicio: e.target.value }))} /></div>
            <div><Label htmlFor="rel-fim" className="text-[11px]">Até</Label><Input id="rel-fim" type="date" className="h-9" value={periodo.fim} onChange={(e) => e.target.value && setPeriodo((p) => ({ ...p, rotulo: "", fim: e.target.value }))} /></div>
          </div>
        </div>
      </div>

      {erro && <p className="rounded-lg border border-rose-200/80 bg-rose-50/80 px-4 py-3 text-sm text-rose-800">{erro}</p>}

      {rel && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Indicador titulo="Ocupação" valor={`${rel.ocupacao.toLocaleString("pt-BR")}%`} detalhe={`${rel.noitesVendidas} de ${rel.noitesDisponiveis} noites (${rel.quartosAtivos} quartos)`} />
            <Indicador titulo="Diária média (ADR)" valor={reais(rel.adrCentavos)} detalhe="Receita de hospedagem ÷ noites vendidas" />
            <Indicador titulo="RevPAR" valor={reais(rel.revparCentavos)} detalhe="Receita ÷ noites disponíveis" />
            <Indicador titulo="Receita de hospedagem" valor={reais(rel.receitaHospedagemCentavos)} detalhe={`${rel.reservas} reserva(s) no período${rel.consumosCentavos ? ` · consumos ${reais(rel.consumosCentavos)}` : ""}`} />
            <Indicador titulo="Recebido no período" valor={reais(rel.recebidoCentavos)} detalhe="Pagamentos lançados nessas datas" />
            <Indicador titulo="A receber (hoje)" valor={reais(rel.aReceberCentavos)} detalhe={`${rel.aReceber.length} reserva(s) com saldo`} />
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Ocupação por noite</CardTitle></CardHeader>
            <CardContent>
              <div className="flex h-36 items-end gap-px overflow-x-auto" role="img" aria-label="Ocupação por noite">
                {rel.ocupacaoPorDia.map((d) => (
                  <div key={d.dia} className="group relative flex h-full min-w-[6px] flex-1 flex-col justify-end" title={`${formatarData(d.dia)}: ${d.percentual}% (${d.ocupados} quarto${d.ocupados === 1 ? "" : "s"})`}>
                    <div
                      className={cn("rounded-t-sm", d.dia === hoje ? "bg-primary" : d.percentual >= 80 ? "bg-emerald-500" : "bg-primary/40")}
                      style={{ height: `${Math.max(d.percentual, 1)}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                <span>{formatarData(rel.inicio)}</span><span>{formatarData(rel.fim)}</span>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Receita por canal</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {rel.porCanal.length === 0 && <p className="text-sm text-muted-foreground">Sem reservas no período.</p>}
                {rel.porCanal.map((c) => (
                  <div key={c.canal} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{rotuloCanal(c.canal)}</span>
                      <span className="tabular-nums">{reais(c.receitaCentavos)} <span className="text-xs text-muted-foreground">· {c.reservas} res. · {c.noites} noites</span></span>
                    </div>
                    <div className="h-2 rounded bg-muted"><div className="h-2 rounded bg-primary/60" style={{ width: `${(c.receitaCentavos / maxCanal) * 100}%` }} /></div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Recebido por forma de pagamento</CardTitle></CardHeader>
              <CardContent>
                {rel.recebidoPorForma.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum pagamento lançado no período.</p> : (
                  <ul className="divide-y divide-border text-sm">
                    {rel.recebidoPorForma.map((f) => (
                      <li key={f.forma} className="flex justify-between py-1.5">
                        <span>{rotuloForma(f.forma)} <span className="text-xs text-muted-foreground">· {f.lancamentos} lançamento(s)</span></span>
                        <span className="tabular-nums font-medium">{reais(f.centavos)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {(rel.cancelamentos.canceladas > 0 || rel.cancelamentos.no_show > 0) && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Chegadas no período: {rel.cancelamentos.total} · canceladas {rel.cancelamentos.canceladas} · não compareceram {rel.cancelamentos.no_show}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">A receber</CardTitle></CardHeader>
            <CardContent>
              {rel.aReceber.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum saldo em aberto.</p> : (
                <ul className="divide-y divide-border text-sm">
                  {rel.aReceber.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-1.5">
                      <Link href={`/reservas/${r.id}`} className="min-w-0 hover:underline">
                        <span className="font-medium">{r.nome}</span>
                        <span className="text-xs text-muted-foreground"> · quarto {r.quarto} · {formatarData(r.data_entrada)} a {formatarData(r.data_saida)} · {getStatusLabel(r.status)}</span>
                      </Link>
                      <span className="tabular-nums font-medium text-amber-700">{reais(r.saldo_centavos)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
