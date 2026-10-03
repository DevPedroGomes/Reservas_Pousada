"use client"

import { useState } from "react"
import Link from "next/link"
import { useApp } from "../../../../components/app/ContextoApp"
import { Button } from "../../../../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../../components/ui/card"
import { Select } from "../../../../components/ui/select"
import { API_URL, authenticatedFetch } from "../../../../lib/api"
import { formatarData, getStatusLabel } from "../../../../lib/formatters"
import { CAMPOS, csvModelo, lerArquivo, lerCsv, mapearColunas, type CampoPlanilha } from "../../../../lib/planilha"
import { cn } from "../../../../lib/utils"

interface Resultado {
  linha: number; ok: boolean; erro?: string; aviso?: string
  resumo?: { nome: string; quarto: number; entrada: string; saida: string; status: string; valor: number | null }
}

const MAX = 2000

/**
 * Importação de reservas por planilha: escolher o arquivo, conferir as
 * colunas, ver a prévia (o servidor valida tudo sem gravar) e importar.
 */
export default function ImportarPlanilha() {
  const { auth } = useApp()
  const podeImportar = Boolean(auth.user?.is_owner) || auth.user?.role === "admin"
  const [arquivo, setArquivo] = useState<string>("")
  const [cabecalho, setCabecalho] = useState<string[]>([])
  const [dados, setDados] = useState<string[][]>([])
  const [mapa, setMapa] = useState<Partial<Record<CampoPlanilha, number>>>({})
  const [previa, setPrevia] = useState<Resultado[] | null>(null)
  const [final, setFinal] = useState<{ criadas: number; comErro: number; resultados: Resultado[] } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  if (!podeImportar) return <p className="text-sm text-muted-foreground">Só o dono ou a administração importam planilhas.</p>

  async function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setErro(null); setPrevia(null); setFinal(null)
    const linhas = lerCsv(await lerArquivo(f))
    if (linhas.length < 2) { setErro("A planilha precisa de uma linha de cabeçalho e ao menos uma reserva."); return }
    if (linhas.length - 1 > MAX) { setErro(`São ${linhas.length - 1} linhas; importe no máximo ${MAX} por vez (divida o arquivo).`); return }
    setArquivo(f.name)
    setCabecalho(linhas[0])
    setDados(linhas.slice(1))
    setMapa(mapearColunas(linhas[0]))
  }

  function baixarModelo() {
    const url = URL.createObjectURL(new Blob([csvModelo()], { type: "text/csv;charset=utf-8" }))
    const a = document.createElement("a")
    a.href = url; a.download = "modelo-reservas.csv"; a.click()
    URL.revokeObjectURL(url)
  }

  const faltando = CAMPOS.filter((c) => c.obrigatorio && mapa[c.campo] === undefined)
  const linhasMapeadas = () => dados.map((cel) =>
    Object.fromEntries(CAMPOS.filter((c) => mapa[c.campo] !== undefined).map((c) => [c.campo, cel[mapa[c.campo]!] ?? ""])),
  )

  async function enviar(simular: boolean) {
    setOcupado(true); setErro(null)
    try {
      const r = await authenticatedFetch(`${API_URL}/reservas/importar`, {
        method: "POST",
        body: JSON.stringify({ linhas: linhasMapeadas(), simular }),
      })
      const d = await r.json()
      if (!d.sucesso) { setErro(d.mensagem || "Não foi possível importar."); return }
      if (simular) setPrevia(d.resultados)
      else { setFinal(d); setPrevia(null) }
    } catch {
      setErro("Não foi possível conectar ao servidor.")
    } finally {
      setOcupado(false)
    }
  }

  const prontas = previa?.filter((r) => r.ok && !r.aviso).length ?? 0
  const repetidas = previa?.filter((r) => r.aviso).length ?? 0
  const comErro = previa?.filter((r) => !r.ok) ?? []

  return (
    <div className="space-y-5">
      <div>
        <Link href="/reservas" className="text-xs text-muted-foreground hover:underline">← Reservas</Link>
        <h1 className="text-2xl font-semibold tracking-tight">Importar planilha</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Traga as reservas do Excel, do Google Planilhas ou do sistema antigo (salve como CSV). Nada é gravado antes da sua conferência.
        </p>
      </div>

      {erro && <p className="rounded-lg border border-rose-200/80 bg-rose-50/80 px-4 py-3 text-sm text-rose-800">{erro}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Arquivo</CardTitle>
          <CardDescription>
            Uma reserva por linha. Datas em dd/mm/aaaa, valor como “R$ 1.234,56”, quarto pelo número ou nome.
            Estadias que já passaram entram como finalizadas; “Pago: sim” vira pagamento lançado.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted/50">
            <input type="file" accept=".csv,.txt,text/csv" className="sr-only" onChange={(e) => void escolher(e)} aria-label="Escolher planilha CSV" />
            Escolher arquivo CSV
          </label>
          {arquivo && <span className="text-sm text-muted-foreground">{arquivo} · {dados.length} linha(s)</span>}
          <button type="button" onClick={baixarModelo} className="text-sm underline text-muted-foreground hover:text-foreground">Baixar modelo</button>
        </CardContent>
      </Card>

      {cabecalho.length > 0 && !final && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Colunas</CardTitle>
            <CardDescription>Confira de qual coluna da planilha vem cada informação.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CAMPOS.map((c) => (
                <div key={c.campo} className="space-y-1">
                  <label htmlFor={`map-${c.campo}`} className="text-xs font-medium">{c.rotulo}{c.obrigatorio && " *"}</label>
                  <Select
                    id={`map-${c.campo}`}
                    value={mapa[c.campo] ?? ""}
                    onChange={(e) => { setPrevia(null); setMapa((m) => ({ ...m, [c.campo]: e.target.value === "" ? undefined : Number(e.target.value) })) }}
                    className={cn(c.obrigatorio && mapa[c.campo] === undefined && "border-rose-300")}
                  >
                    <option value="">— não importar —</option>
                    {cabecalho.map((h, i) => <option key={i} value={i}>{h || `Coluna ${i + 1}`}{dados[0]?.[i] ? ` (ex.: ${dados[0][i].slice(0, 24)})` : ""}</option>)}
                  </Select>
                </div>
              ))}
            </div>
            <Button onClick={() => void enviar(true)} disabled={ocupado || faltando.length > 0}>
              {ocupado && !previa ? "Conferindo..." : "Conferir"}
            </Button>
            {faltando.length > 0 && <p className="text-xs text-rose-700">Indique: {faltando.map((c) => c.rotulo).join(", ")}.</p>}
          </CardContent>
        </Card>
      )}

      {previa && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Prévia</CardTitle>
            <CardDescription>
              {prontas} pronta(s) para importar{repetidas ? ` · ${repetidas} já existe(m) e será(ão) ignorada(s)` : ""}{comErro.length ? ` · ${comErro.length} com problema (ficam de fora)` : ""}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {comErro.length > 0 && (
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-rose-700">Linhas com problema — corrija na planilha e importe de novo depois</h3>
                <ul className="max-h-64 overflow-y-auto divide-y divide-border rounded-lg border border-rose-200 text-sm">
                  {comErro.map((r) => (
                    <li key={r.linha} className="flex gap-3 px-3 py-1.5">
                      <span className="w-16 shrink-0 text-muted-foreground">Linha {r.linha}</span>
                      <span className="w-40 shrink-0 truncate">{dados[r.linha - 2]?.[mapa.nome ?? 0]}</span>
                      <span className="text-rose-700">{r.erro}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {prontas > 0 && (
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Primeiras reservas</h3>
                <ul className="divide-y divide-border rounded-lg border border-border text-sm">
                  {previa.filter((r) => r.ok && r.resumo).slice(0, 8).map((r) => (
                    <li key={r.linha} className="flex flex-wrap gap-x-3 px-3 py-1.5">
                      <span className="font-medium">{r.resumo!.nome}</span>
                      <span className="text-muted-foreground">quarto {r.resumo!.quarto} · {formatarData(r.resumo!.entrada)} a {formatarData(r.resumo!.saida)} · {getStatusLabel(r.resumo!.status)}{r.resumo!.valor !== null ? ` · ${r.resumo!.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Button onClick={() => void enviar(false)} disabled={ocupado || prontas === 0}>
              {ocupado ? "Importando..." : `Importar ${prontas} reserva(s)`}
            </Button>
          </CardContent>
        </Card>
      )}

      {final && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pronto</CardTitle>
            <CardDescription>{final.criadas} reserva(s) importada(s){final.comErro ? `; ${final.comErro} linha(s) ficaram de fora` : ""}.</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Link href="/reservas"><Button>Ver reservas</Button></Link>
            <Link href="/mapa"><Button variant="outline">Ver no mapa</Button></Link>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
