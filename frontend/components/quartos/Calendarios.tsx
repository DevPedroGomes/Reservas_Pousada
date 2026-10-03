"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "../ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Select } from "../ui/select"
import { API_URL, authenticatedFetch } from "../../lib/api"
import { formatarDataHora } from "../../lib/formatters"
import { cn } from "../../lib/utils"
import type { Message } from "../../lib/types"

interface LinkExportado { quarto: number; nome: string; url: string }
interface Importado {
  id: number; quarto: number; nome: string; canal: string; url: string
  ultimaSincronizacao: string | null; aviso: string | null; eventos: number | null
}

const ORIGENS = [
  { canal: "airbnb", nome: "Airbnb" },
  { canal: "booking", nome: "Booking.com" },
  { canal: "expedia", nome: "Expedia" },
  { canal: "decolar", nome: "Decolar" },
  { canal: "outro", nome: "Outro" },
]

/**
 * Sincronização por iCal com Booking, Airbnb e afins: o link de cada quarto
 * para colar na OTA, e os calendários da OTA importados aqui (a cada 30 min).
 */
export function Calendarios() {
  const [exportar, setExportar] = useState<LinkExportado[]>([])
  const [importar, setImportar] = useState<Importado[]>([])
  const [mensagem, setMensagem] = useState<Message | null>(null)
  const [novo, setNovo] = useState({ quarto: "", canal: "airbnb", url: "" })
  const [ocupado, setOcupado] = useState(false)
  const [copiado, setCopiado] = useState<number | null>(null)

  const carregar = useCallback(async () => {
    const r = await authenticatedFetch(`${API_URL}/ical`)
    const d = await r.json()
    if (d.sucesso) { setExportar(d.exportar); setImportar(d.importar) }
  }, [])
  useEffect(() => { void carregar() }, [carregar])

  async function copiar(l: LinkExportado) {
    try {
      await navigator.clipboard.writeText(l.url)
      setCopiado(l.quarto)
      setTimeout(() => setCopiado(null), 2000)
    } catch {
      window.prompt("Copie o link:", l.url)
    }
  }

  async function adicionar(e: React.FormEvent) {
    e.preventDefault()
    setOcupado(true); setMensagem(null)
    const origem = ORIGENS.find((o) => o.canal === novo.canal)!
    const r = await authenticatedFetch(`${API_URL}/ical/importacoes`, {
      method: "POST",
      body: JSON.stringify({ quarto: Number(novo.quarto), canal: novo.canal, nome: origem.nome, url: novo.url }),
    })
    const d = await r.json()
    setOcupado(false)
    if (d.sucesso) {
      const res = d.resumo
      setMensagem(res?.erro
        ? { type: "error", text: `Calendário salvo, mas não foi possível ler agora: ${res.erro}` }
        : { type: "success", text: `Calendário ligado: ${res.criadas} reserva(s) importada(s)${res.conflitos?.length ? `; atenção a ${res.conflitos.length} choque(s) de datas` : ""}.` })
      setNovo({ quarto: "", canal: novo.canal, url: "" })
      await carregar()
    } else {
      setMensagem({ type: "error", text: [d.mensagem, ...(d.erros ?? [])].filter(Boolean).join(" ") })
    }
  }

  async function sincronizar(i: Importado) {
    setOcupado(true)
    const r = await authenticatedFetch(`${API_URL}/ical/importacoes/${i.id}/sincronizar`, { method: "POST" })
    const d = await r.json()
    setOcupado(false)
    setMensagem(d.sucesso
      ? { type: "success", text: `${i.nome}: ${d.resumo.criadas} nova(s), ${d.resumo.atualizadas} alterada(s), ${d.resumo.canceladas} cancelada(s).` }
      : { type: "error", text: d.mensagem })
    await carregar()
  }

  async function remover(i: Importado) {
    if (!window.confirm(`Desligar o calendário ${i.nome} do quarto ${i.quarto}? As reservas futuras que vieram dele serão canceladas.`)) return
    await authenticatedFetch(`${API_URL}/ical/importacoes/${i.id}`, { method: "DELETE" })
    await carregar()
  }

  async function novoLink(l: LinkExportado) {
    if (!window.confirm(`Gerar um link novo para ${l.nome}? O atual para de funcionar e precisa ser trocado na OTA.`)) return
    await authenticatedFetch(`${API_URL}/ical/quartos/${l.quarto}/novo-link`, { method: "POST" })
    await carregar()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Calendários (Booking, Airbnb)</CardTitle>
        <CardDescription>
          Evite reservar o mesmo quarto duas vezes: cole o link do quarto na OTA (ela passa a ver o que foi vendido aqui) e
          cole aqui o link de calendário da OTA (as reservas de lá entram no mapa a cada 30 minutos).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {mensagem && (
          <div className={cn("rounded-lg border px-3 py-2 text-sm", mensagem.type === "success" ? "border-emerald-200/80 bg-emerald-50/80 text-emerald-800" : "border-rose-200/80 bg-rose-50/80 text-rose-800")}>
            {mensagem.text}
          </div>
        )}

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">1. Link de cada quarto (cole na OTA)</h3>
          <p className="text-xs text-muted-foreground">
            Airbnb: Calendário → Disponibilidade → Conectar calendários → Importar. Booking: Calendário → Sincronizar calendários → Importar.
            O link só mostra “Reservado” — nenhum dado de hóspede sai daqui.
          </p>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {exportar.map((l) => (
              <li key={l.quarto} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{l.nome}</span>
                  <span className="block truncate text-xs text-muted-foreground">{l.url}</span>
                </span>
                <span className="flex shrink-0 gap-1">
                  <Button variant="outline" size="sm" onClick={() => void copiar(l)}>{copiado === l.quarto ? "Copiado" : "Copiar"}</Button>
                  <Button variant="ghost" size="sm" onClick={() => void novoLink(l)} title="Se o link vazou">Novo link</Button>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">2. Calendários das OTAs (importados aqui)</h3>
          {importar.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {importar.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium">{i.nome}</span>
                    <span className="text-muted-foreground"> → {exportar.find((l) => l.quarto === i.quarto)?.nome ?? `quarto ${i.quarto}`}</span>
                    <span className="block text-xs text-muted-foreground">
                      {i.ultimaSincronizacao ? `Lido em ${formatarDataHora(i.ultimaSincronizacao)} · ${i.eventos ?? 0} evento(s)` : "Ainda não lido"}
                    </span>
                    {i.aviso && <span className="block text-xs text-amber-700">{i.aviso}</span>}
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <Button variant="outline" size="sm" disabled={ocupado} onClick={() => void sincronizar(i)}>Sincronizar</Button>
                    <Button variant="ghost" size="sm" className="text-rose-600 hover:text-rose-700" onClick={() => void remover(i)}>Desligar</Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={adicionar} className="grid gap-3 md:grid-cols-[1fr_1fr_2.5fr_auto] items-end">
            <div className="space-y-1">
              <Label htmlFor="ic-quarto" className="text-xs">Quarto</Label>
              <Select id="ic-quarto" value={novo.quarto} onChange={(e) => setNovo((x) => ({ ...x, quarto: e.target.value }))} required>
                <option value="">Escolha</option>
                {exportar.map((l) => <option key={l.quarto} value={l.quarto}>{l.nome}</option>)}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ic-canal" className="text-xs">De onde</Label>
              <Select id="ic-canal" value={novo.canal} onChange={(e) => setNovo((x) => ({ ...x, canal: e.target.value }))}>
                {ORIGENS.map((o) => <option key={o.canal} value={o.canal}>{o.nome}</option>)}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ic-url" className="text-xs">Link do calendário (.ics) da OTA</Label>
              <Input id="ic-url" type="url" value={novo.url} onChange={(e) => setNovo((x) => ({ ...x, url: e.target.value }))} placeholder="https://www.airbnb.com.br/calendar/ical/..." required />
            </div>
            <Button type="submit" disabled={ocupado}>{ocupado ? "Lendo..." : "Ligar"}</Button>
          </form>
        </section>
      </CardContent>
    </Card>
  )
}
