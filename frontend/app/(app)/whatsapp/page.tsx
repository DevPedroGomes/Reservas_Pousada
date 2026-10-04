"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useApp } from "../../../components/app/ContextoApp"
import { Button } from "../../../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card"
import { Textarea } from "../../../components/ui/textarea"
import { API_URL, authenticatedFetch } from "../../../lib/api"
import { cn } from "../../../lib/utils"

interface Conversa {
  id: number
  contato: string
  nome: string | null
  optout: boolean
  ultimaEm: string
  equipeAte: string | null
  janelaAberta: boolean
  ultima: string
}
interface Mensagem { id: number; direcao: "entrada" | "agente" | "equipe" | "sistema"; texto: string; em: string }

const ATUALIZAR_MS = 8000

const hora = (iso: string) => {
  const d = new Date(iso)
  const hoje = new Date().toDateString() === d.toDateString()
  return d.toLocaleString("pt-BR", hoje ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}
const telefone = (c: string) => (c.startsWith("55") && c.length >= 12 ? `(${c.slice(2, 4)}) ${c.slice(4, -4)}-${c.slice(-4)}` : `+${c}`)

const ROTULO: Record<Mensagem["direcao"], string> = { entrada: "", agente: "Atendente virtual", equipe: "Equipe", sistema: "Aviso automático" }

function Conversas() {
  const { auth } = useApp()
  const router = useRouter()
  const params = useSearchParams()
  const aberta = Number(params.get("conversa")) || null
  const [conectado, setConectado] = useState<boolean | null>(null)
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [texto, setTexto] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const fim = useRef<HTMLDivElement>(null)
  const gerencia = Boolean(auth.user?.is_owner) || auth.user?.role === "admin"

  const carregarLista = useCallback(async () => {
    const d = await authenticatedFetch(`${API_URL}/whatsapp/conversas`).then((r) => r.json()).catch(() => null)
    if (d?.sucesso) setConversas(d.conversas)
  }, [])
  const carregarConversa = useCallback(async (id: number) => {
    const d = await authenticatedFetch(`${API_URL}/whatsapp/conversas/${id}`).then((r) => r.json()).catch(() => null)
    if (d?.sucesso) setMensagens(d.mensagens)
  }, [])

  useEffect(() => {
    void authenticatedFetch(`${API_URL}/whatsapp/conta`).then((r) => r.json()).then((d) => setConectado(Boolean(d?.conta?.conectado))).catch(() => setConectado(false))
  }, [])

  useEffect(() => {
    void carregarLista()
    const t = setInterval(() => { if (document.visibilityState === "visible") void carregarLista() }, ATUALIZAR_MS)
    return () => clearInterval(t)
  }, [carregarLista])

  useEffect(() => {
    setMensagens([])
    setErro(null)
    if (!aberta) return
    void carregarConversa(aberta)
    const t = setInterval(() => { if (document.visibilityState === "visible") void carregarConversa(aberta) }, ATUALIZAR_MS)
    return () => clearInterval(t)
  }, [aberta, carregarConversa])

  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }) }, [mensagens.length])

  const atual = conversas.find((c) => c.id === aberta) ?? null

  async function responder(e: React.FormEvent) {
    e.preventDefault()
    if (!aberta || !texto.trim()) return
    setEnviando(true)
    setErro(null)
    const d = await authenticatedFetch(`${API_URL}/whatsapp/conversas/${aberta}/responder`, { method: "POST", body: JSON.stringify({ texto }) })
      .then((r) => r.json()).catch(() => ({ sucesso: false }))
    setEnviando(false)
    if (!d.sucesso) { setErro(d.mensagem || "Não foi possível enviar."); return }
    setTexto("")
    await Promise.all([carregarConversa(aberta), carregarLista()])
  }

  async function devolver() {
    if (!aberta) return
    await authenticatedFetch(`${API_URL}/whatsapp/conversas/${aberta}/agente`, { method: "POST" })
    await carregarLista()
  }

  if (conectado === false) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>WhatsApp</CardTitle>
          <CardDescription>
            Conecte o WhatsApp Business da pousada para ver e responder as conversas aqui, com o atendente virtual ajudando.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {gerencia
            ? <Link href="/configuracoes"><Button>Conectar nas configurações</Button></Link>
            : <p className="text-sm text-muted-foreground">Peça para o responsável pela pousada conectar o WhatsApp em Configurações.</p>}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">WhatsApp</h1>
      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <Card className={cn("overflow-hidden", aberta && "hidden lg:block")}>
          {conversas.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nenhuma conversa ainda. Quando um hóspede escrever para o número da pousada, ela aparece aqui.</p>
          ) : (
            <ul className="divide-y divide-border">
              {conversas.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/whatsapp?conversa=${c.id}`)}
                    className={cn("w-full px-4 py-3 text-left hover:bg-muted/50", c.id === aberta && "bg-muted/60")}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-medium">{c.nome || telefone(c.contato)}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{hora(c.ultimaEm)}</span>
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">{c.ultima}</span>
                    <span className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                      {c.equipeAte && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">com a equipe</span>}
                      {c.optout && <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-700">pediu para parar</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {aberta ? (
          <Card className="flex min-h-[28rem] flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <button type="button" onClick={() => router.push("/whatsapp")} className="mr-2 text-sm text-primary lg:hidden">← Conversas</button>
                <span className="font-medium">{atual?.nome || (atual ? telefone(atual.contato) : "")}</span>
                {atual && <span className="ml-2 text-xs text-muted-foreground">{telefone(atual.contato)}</span>}
              </div>
              {atual?.equipeAte && (
                <Button variant="outline" size="sm" onClick={() => void devolver()}>Devolver ao atendente virtual</Button>
              )}
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto bg-muted/20 p-4" style={{ maxHeight: "60vh" }}>
              {mensagens.map((m) => (
                <div key={m.id} className={cn("flex", m.direcao === "entrada" ? "justify-start" : "justify-end")}>
                  <div className={cn(
                    "max-w-[85%] whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-sm shadow-sm",
                    m.direcao === "entrada" ? "bg-white" : m.direcao === "equipe" ? "bg-emerald-100" : m.direcao === "sistema" ? "bg-zinc-100 text-zinc-700" : "bg-sky-50",
                  )}>
                    {ROTULO[m.direcao] && <span className="mb-0.5 block text-[11px] font-medium text-muted-foreground">{ROTULO[m.direcao]}</span>}
                    {m.texto}
                    <span className="mt-0.5 block text-right text-[10px] text-muted-foreground">{hora(m.em)}</span>
                  </div>
                </div>
              ))}
              <div ref={fim} />
            </div>
            <form onSubmit={responder} className="space-y-2 border-t border-border p-3">
              {erro && <p className="text-sm text-rose-700">{erro}</p>}
              {atual && !atual.janelaAberta ? (
                <p className="text-sm text-muted-foreground">
                  Passaram 24 horas desde a última mensagem do hóspede: a Meta só deixa responder quando ele escrever de novo.
                </p>
              ) : (
                <>
                  <Textarea
                    rows={2}
                    maxLength={4000}
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void responder(e) } }}
                    placeholder="Escreva a resposta... (o atendente virtual pausa por 12h nesta conversa)"
                    aria-label="Resposta"
                  />
                  <div className="flex justify-end">
                    <Button type="submit" disabled={enviando || !texto.trim()}>{enviando ? "Enviando..." : "Enviar"}</Button>
                  </div>
                </>
              )}
            </form>
          </Card>
        ) : (
          <Card className="hidden items-center justify-center p-8 text-sm text-muted-foreground lg:flex">
            Escolha uma conversa.
          </Card>
        )}
      </div>
    </div>
  )
}

export default function PaginaWhatsapp() {
  return (
    <Suspense>
      <Conversas />
    </Suspense>
  )
}
