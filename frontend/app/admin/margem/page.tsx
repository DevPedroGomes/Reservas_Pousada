"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { API_URL, authenticatedFetch } from "../../../lib/api"
import { Button } from "../../../components/ui/button"
import { Badge } from "../../../components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table"
import { cn } from "../../../lib/utils"
import { formatarPreco } from "../../../hooks/useAssinatura"

interface Margem {
  receitaCentavos: number
  custoCentavos: number
  custoPorCategoria: { taxa_stripe: number; custo_ia: number; custo_email: number }
  infraCentavos: number
  margemCentavos: number
  margemPercentual: number | null
  contemEstimativa: boolean
}

interface Linha {
  pousadaId: number
  nome: string
  plano: string | null
  status: string
  margem: Margem
  ciclosNegativos: number
}

interface Relatorio {
  competencia: string
  infraTotalCentavos: number
  infraPorTenantCentavos: number
  tenantsPagantes: number
  linhas: Linha[]
  totais: { receitaCentavos: number; custoCentavos: number; margemCentavos: number; margemPercentual: number | null }
  avisos: string[]
}

function mesAtual(): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7)
}

function mesAnterior(c: string): string {
  const [a, m] = c.split("-").map(Number)
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`
}

function mesSeguinte(c: string): string {
  const [a, m] = c.split("-").map(Number)
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`
}

export default function MargemPage() {
  const [competencia, setCompetencia] = useState(mesAtual())
  const [relatorio, setRelatorio] = useState<Relatorio | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [semAcesso, setSemAcesso] = useState(false)
  const [aberta, setAberta] = useState<number | null>(null)

  const carregar = useCallback(async (c: string) => {
    setCarregando(true)
    try {
      const r = await authenticatedFetch(`${API_URL}/admin/margem?competencia=${c}`)
      // 404 é a resposta para quem não é admin: a área não revela que existe.
      if (r.status === 404 || r.status === 401) {
        setSemAcesso(true)
        setRelatorio(null)
        return
      }
      const data = await r.json()
      if (data.sucesso) {
        setRelatorio(data)
        setSemAcesso(false)
      }
    } catch {
      setRelatorio(null)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar(competencia) }, [carregar, competencia])

  if (semAcesso) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Página não encontrada</CardTitle>
            <CardDescription>O endereço acessado não existe.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/"><Button variant="outline">Ir para o início</Button></Link>
          </CardContent>
        </Card>
      </main>
    )
  }

  const t = relatorio?.totais

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 h-14">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="" className="h-8 w-8 rounded-lg object-cover" />
            <span className="text-sm font-semibold">Diária · Margem</span>
          </div>
          <Link href="/"><Button variant="ghost" size="sm">Voltar ao painel</Button></Link>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Margem por cliente</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Receita menos custo, mês a mês.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setCompetencia(mesAnterior(competencia))}>←</Button>
            <span className="text-sm font-medium tabular-nums w-20 text-center">{competencia}</span>
            <Button
              variant="outline" size="sm"
              disabled={competencia >= mesAtual()}
              onClick={() => setCompetencia(mesSeguinte(competencia))}
            >→</Button>
          </div>
        </div>

        {relatorio?.avisos?.map((a) => (
          <div key={a} className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-4 py-3">
            <p className="text-sm text-amber-800">{a}</p>
          </div>
        ))}

        <div className="grid gap-4 sm:grid-cols-3">
          <Resumo titulo="Receita" valor={t?.receitaCentavos ?? 0} />
          <Resumo titulo="Custo" valor={t?.custoCentavos ?? 0} />
          <Resumo
            titulo="Margem"
            valor={t?.margemCentavos ?? 0}
            destaque
            sufixo={t?.margemPercentual !== null && t?.margemPercentual !== undefined ? `${t.margemPercentual}%` : undefined}
          />
        </div>

        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>Cliente</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                  <TableHead className="text-right">Stripe</TableHead>
                  <TableHead className="text-right">Infra</TableHead>
                  <TableHead className="text-right">IA</TableHead>
                  <TableHead className="text-right">Margem</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {carregando ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : !relatorio?.linhas.length ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nenhum cliente neste mês.</TableCell></TableRow>
                ) : (
                  relatorio.linhas.map((l) => {
                    const negativa = l.margem.margemCentavos < 0
                    const alerta = l.ciclosNegativos >= 2
                    return (
                      <TableRow key={l.pousadaId} className={cn(alerta && "bg-rose-50/50")}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {l.nome}
                            {alerta && <Badge variant="destructive">{l.ciclosNegativos} ciclos no vermelho</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{l.plano ?? l.status}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatarPreco(l.margem.receitaCentavos)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatarPreco(l.margem.custoPorCategoria.taxa_stripe)}
                          {l.margem.contemEstimativa && <span className="ml-1 text-xs" title="Contém estimativa">~</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{formatarPreco(l.margem.infraCentavos)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{formatarPreco(l.margem.custoPorCategoria.custo_ia)}</TableCell>
                        <TableCell className={cn("text-right tabular-nums font-medium", negativa ? "text-rose-700" : "text-emerald-700")}>
                          {formatarPreco(l.margem.margemCentavos)}
                        </TableCell>
                        <TableCell className={cn("text-right tabular-nums", negativa && "text-rose-700")}>
                          {l.margem.margemPercentual === null ? "—" : `${l.margem.margemPercentual}%`}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => setAberta(aberta === l.pousadaId ? null : l.pousadaId)}
                          >
                            {aberta === l.pousadaId ? "Fechar" : "Detalhe"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        {aberta !== null && <Lancamentos pousadaId={aberta} competencia={competencia} />}

        <p className="text-xs text-muted-foreground">
          O til (~) marca valores estimados. A taxa do Stripe é lida da transação real sempre que
          o provedor a expõe; a estimativa só entra quando ele não expõe.
        </p>
      </div>
    </main>
  )
}

function Resumo({ titulo, valor, destaque, sufixo }: { titulo: string; valor: number; destaque?: boolean; sufixo?: string }) {
  const negativo = valor < 0
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{titulo}</CardDescription>
        <CardTitle className={cn("text-2xl tabular-nums", destaque && (negativo ? "text-rose-700" : "text-emerald-700"))}>
          {formatarPreco(valor)}
          {sufixo && <span className="text-sm font-normal text-muted-foreground ml-2">{sufixo}</span>}
        </CardTitle>
      </CardHeader>
    </Card>
  )
}

/** De onde veio o número — agregado que não se audita não serve para decidir. */
function Lancamentos({ pousadaId, competencia }: { pousadaId: number; competencia: string }) {
  const [itens, setItens] = useState<Record<string, unknown>[]>([])

  useEffect(() => {
    let vivo = true
    authenticatedFetch(`${API_URL}/admin/margem/${pousadaId}?competencia=${competencia}`)
      .then((r) => r.json())
      .then((d) => { if (vivo && d.sucesso) setItens(d.lancamentos ?? []) })
      .catch(() => setItens([]))
    return () => { vivo = false }
  }, [pousadaId, competencia])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Lançamentos de {competencia}</CardTitle>
        <CardDescription>Cada linha tem a referência no provedor para conferência.</CardDescription>
      </CardHeader>
      <CardContent>
        {itens.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum lançamento neste mês.</p>
        ) : (
          <div className="space-y-1.5">
            {itens.map((i, idx) => (
              <div key={idx} className="flex items-center justify-between gap-4 text-sm border-b border-border/40 pb-1.5 last:border-0">
                <span className="text-muted-foreground">
                  {String(i.categoria)}
                  {i.estimado ? " (estimado)" : ""}
                  {i.referencia_externa ? ` · ${String(i.referencia_externa)}` : ""}
                </span>
                <span className="tabular-nums">{formatarPreco(Number(i.valor_centavos) || 0)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
