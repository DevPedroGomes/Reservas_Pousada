"use client"

import { useState } from "react"
import Link from "next/link"
import { cn } from "../../lib/utils"

const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "")

export interface PousadaPublica {
  nome: string
  slug: string
  cidade: string | null
  estado: string | null
  telefone: string | null
  descricao: string | null
  logoUrl: string | null
  prazoHoras: number
  sinalPercentual: number
  politicas: string
}

export interface QuartoPublico {
  numero: number
  nome: string
  tipo: string | null
  capacidade: number
  descricao: string | null
  aPartirDeCentavos: number | null
}

interface Disponivel {
  numero: number
  nome: string
  tipo: string | null
  capacidade: number
  descricao: string | null
  totalCentavos: number
  noites: number
  minimoNoites: number | null
  atendeMinimo: boolean
}

interface Pedido {
  id: number
  quarto: string
  entrada: string
  saida: string
  totalCentavos: number
  sinalCentavos: number
  prazo: string
}

const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const hoje = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
const somar = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10)

/** WhatsApp da pousada (número brasileiro sem DDI ganha o 55). */
function whatsapp(telefone: string | null, texto: string): string | null {
  const d = (telefone || "").replace(/\D/g, "")
  if (d.length < 10) return null
  return `https://wa.me/${d.length <= 11 ? `55${d}` : d}?text=${encodeURIComponent(texto)}`
}

const campo = "h-11 w-full rounded-lg border border-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"

/**
 * Busca de datas → quartos livres com o preço do tarifário → pedido.
 * O pedido entra como pré-reserva; a pousada confirma pelo WhatsApp.
 */
export function MotorDeReservas({ slug, pousada, quartos }: { slug: string; pousada: PousadaPublica; quartos: QuartoPublico[] }) {
  const [busca, setBusca] = useState({ entrada: "", saida: "", adultos: 2, criancas: 0 })
  const [livres, setLivres] = useState<Disponivel[] | null>(null)
  const [escolhido, setEscolhido] = useState<Disponivel | null>(null)
  const [dados, setDados] = useState({ nome: "", telefone: "", email: "", documento: "", observacoes: "", aceite: false, site: "" })
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const local = [pousada.cidade, pousada.estado].filter(Boolean).join(" - ")

  async function procurar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null); setEscolhido(null); setOcupado(true)
    try {
      const q = new URLSearchParams({ entrada: busca.entrada, saida: busca.saida, pessoas: String(busca.adultos + busca.criancas) })
      const r = await fetch(`${API}/api/publico/${slug}/disponibilidade?${q}`)
      const d = await r.json()
      if (!d.sucesso) { setErro(d.mensagem); setLivres(null); return }
      setLivres(d.quartos)
    } catch {
      setErro("Não foi possível consultar agora. Tente de novo em instantes.")
    } finally {
      setOcupado(false)
    }
  }

  async function pedir(e: React.FormEvent) {
    e.preventDefault()
    if (!escolhido) return
    setErro(null); setOcupado(true)
    try {
      const r = await fetch(`${API}/api/publico/${slug}/reservas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...dados, quarto: escolhido.numero, entrada: busca.entrada, saida: busca.saida, adultos: busca.adultos, criancas: busca.criancas }),
      })
      const d = await r.json()
      if (!d.sucesso) {
        setErro(d.mensagem)
        if (r.status === 409) { setEscolhido(null); setLivres(null) }
        return
      }
      setPedido(d.pedido)
      window.scrollTo({ top: 0, behavior: "smooth" })
    } catch {
      setErro("Não foi possível enviar agora. Tente de novo em instantes.")
    } finally {
      setOcupado(false)
    }
  }

  if (pedido) {
    const zap = whatsapp(pousada.telefone, `Olá! Fiz o pedido de reserva #${pedido.id} (${pedido.quarto}, ${br(pedido.entrada)} a ${br(pedido.saida)}). Como faço o sinal de ${reais(pedido.sinalCentavos)}?`)
    return (
      <Moldura pousada={pousada} local={local}>
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6 space-y-3">
          <h2 className="text-xl font-semibold text-emerald-900">Pedido #{pedido.id} recebido!</h2>
          <p className="text-sm text-emerald-900">
            {pedido.quarto}, de {br(pedido.entrada)} a {br(pedido.saida)} — total de <strong>{reais(pedido.totalCentavos)}</strong>.
          </p>
          <p className="text-sm text-emerald-900">
            O quarto fica reservado para você até <strong>{pedido.prazo}</strong>. Para confirmar, a {pousada.nome} vai combinar com você
            {pedido.sinalCentavos > 0 ? <> o sinal de <strong>{reais(pedido.sinalCentavos)}</strong></> : " a confirmação"} pelo WhatsApp.
          </p>
          {zap && (
            <a href={zap} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700">
              Falar com a pousada no WhatsApp
            </a>
          )}
        </section>
      </Moldura>
    )
  }

  return (
    <Moldura pousada={pousada} local={local}>
      <form onSubmit={procurar} className="grid gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm sm:grid-cols-[1fr_1fr_0.7fr_0.7fr_auto] sm:items-end">
        <div className="space-y-1">
          <label htmlFor="m-entrada" className="text-xs font-medium">Entrada</label>
          <input id="m-entrada" type="date" required min={hoje()} value={busca.entrada} className={campo}
            onChange={(e) => setBusca((b) => ({ ...b, entrada: e.target.value, saida: b.saida && b.saida > e.target.value ? b.saida : somar(e.target.value, 1) }))} />
        </div>
        <div className="space-y-1">
          <label htmlFor="m-saida" className="text-xs font-medium">Saída</label>
          <input id="m-saida" type="date" required min={busca.entrada ? somar(busca.entrada, 1) : hoje()} value={busca.saida} className={campo}
            onChange={(e) => setBusca((b) => ({ ...b, saida: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <label htmlFor="m-adultos" className="text-xs font-medium">Adultos</label>
          <input id="m-adultos" type="number" min={1} max={20} value={busca.adultos} className={campo}
            onChange={(e) => setBusca((b) => ({ ...b, adultos: Number(e.target.value) }))} />
        </div>
        <div className="space-y-1">
          <label htmlFor="m-criancas" className="text-xs font-medium">Crianças</label>
          <input id="m-criancas" type="number" min={0} max={20} value={busca.criancas} className={campo}
            onChange={(e) => setBusca((b) => ({ ...b, criancas: Number(e.target.value) }))} />
        </div>
        <button type="submit" disabled={ocupado} className="h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
          {ocupado && !escolhido ? "Buscando..." : "Ver disponibilidade"}
        </button>
      </form>

      {erro && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{erro}</p>}

      {livres === null ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Acomodações</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {quartos.map((q) => (
              <article key={q.numero} className="rounded-xl border border-border bg-white p-4">
                <h3 className="font-semibold">{q.nome}</h3>
                <p className="text-xs text-muted-foreground">{[q.tipo, `até ${q.capacidade} pessoa${q.capacidade > 1 ? "s" : ""}`].filter(Boolean).join(" · ")}</p>
                {q.descricao && <p className="mt-2 text-sm text-muted-foreground">{q.descricao}</p>}
                {q.aPartirDeCentavos !== null && <p className="mt-2 text-sm">a partir de <strong>{reais(q.aPartirDeCentavos)}</strong>/noite</p>}
              </article>
            ))}
          </div>
        </section>
      ) : livres.length === 0 ? (
        <p className="rounded-xl border border-border bg-white p-5 text-sm">
          Nenhuma acomodação livre para essas datas e número de pessoas. Tente outras datas
          {pousada.telefone ? " ou fale com a pousada pelo WhatsApp" : ""}.
        </p>
      ) : (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Disponíveis de {br(busca.entrada)} a {br(busca.saida)}</h2>
          {livres.map((q) => (
            <article key={q.numero} className={cn("rounded-xl border bg-white p-4", escolhido?.numero === q.numero ? "border-primary ring-2 ring-primary/20" : "border-border")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold">{q.nome}</h3>
                  <p className="text-xs text-muted-foreground">{[q.tipo, `até ${q.capacidade} pessoa${q.capacidade > 1 ? "s" : ""}`].filter(Boolean).join(" · ")}</p>
                  {q.descricao && <p className="mt-1 text-sm text-muted-foreground">{q.descricao}</p>}
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold">{reais(q.totalCentavos)}</p>
                  <p className="text-xs text-muted-foreground">{q.noites} noite{q.noites > 1 ? "s" : ""}</p>
                  {q.atendeMinimo ? (
                    <button type="button" onClick={() => setEscolhido(q)} className="mt-2 h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                      {escolhido?.numero === q.numero ? "Escolhido" : "Reservar"}
                    </button>
                  ) : (
                    <p className="mt-2 text-xs text-amber-700">Mínimo de {q.minimoNoites} noites neste período</p>
                  )}
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      {escolhido && (
        <form onSubmit={pedir} className="space-y-4 rounded-2xl border border-border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Seus dados</h2>
          {/* Campo isca: escondido de pessoas, robôs preenchem. */}
          <input type="text" name="site" tabIndex={-1} autoComplete="off" value={dados.site} onChange={(e) => setDados((x) => ({ ...x, site: e.target.value }))} className="hidden" aria-hidden />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="m-nome" className="text-xs font-medium">Nome completo *</label>
              <input id="m-nome" required autoComplete="name" value={dados.nome} className={campo} onChange={(e) => setDados((x) => ({ ...x, nome: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label htmlFor="m-tel" className="text-xs font-medium">WhatsApp *</label>
              <input id="m-tel" required type="tel" autoComplete="tel" placeholder="(48) 99999-0000" value={dados.telefone} className={campo} onChange={(e) => setDados((x) => ({ ...x, telefone: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label htmlFor="m-email" className="text-xs font-medium">E-mail</label>
              <input id="m-email" type="email" autoComplete="email" value={dados.email} className={campo} onChange={(e) => setDados((x) => ({ ...x, email: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label htmlFor="m-doc" className="text-xs font-medium">CPF ou passaporte (opcional)</label>
              <input id="m-doc" value={dados.documento} className={campo} onChange={(e) => setDados((x) => ({ ...x, documento: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1">
            <label htmlFor="m-obs" className="text-xs font-medium">Observações</label>
            <textarea id="m-obs" rows={3} maxLength={500} value={dados.observacoes} className="w-full rounded-lg border border-border bg-white p-3 text-sm" onChange={(e) => setDados((x) => ({ ...x, observacoes: e.target.value }))} placeholder="Horário de chegada, pedidos especiais..." />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" required checked={dados.aceite} onChange={(e) => setDados((x) => ({ ...x, aceite: e.target.checked }))} className="mt-1 h-4 w-4 accent-primary" />
            <span>Concordo que a {pousada.nome} use meus dados para tratar esta reserva.</span>
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-sm">
              {escolhido.nome} · {br(busca.entrada)} a {br(busca.saida)} · <strong>{reais(escolhido.totalCentavos)}</strong>
              {pousada.sinalPercentual > 0 && <span className="block text-xs text-muted-foreground">Sinal de {pousada.sinalPercentual}% ({reais(Math.round(escolhido.totalCentavos * pousada.sinalPercentual / 100))}) para confirmar.</span>}
            </p>
            <button type="submit" disabled={ocupado} className="h-11 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {ocupado ? "Enviando..." : "Pedir reserva"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            O pedido segura o quarto por {pousada.prazoHoras} hora{pousada.prazoHoras > 1 ? "s" : ""} enquanto a pousada confirma com você.
          </p>
        </form>
      )}

      {pousada.politicas && (
        <section className="rounded-xl border border-border bg-white p-4">
          <h2 className="text-sm font-semibold">Políticas da pousada</h2>
          <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{pousada.politicas}</p>
        </section>
      )}
    </Moldura>
  )
}

function Moldura({ pousada, local, children }: { pousada: PousadaPublica; local: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:py-12">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">{pousada.nome}</h1>
          {local && <p className="text-sm text-muted-foreground">{local}</p>}
          {pousada.descricao && <p className="text-sm leading-relaxed text-muted-foreground">{pousada.descricao}</p>}
        </header>
        {children}
        <footer className="pt-6 text-center text-xs text-muted-foreground">
          Reservas por{" "}
          <Link href="/?utm_source=motor&utm_medium=rodape&utm_campaign=pagina_de_reservas" className="font-medium underline hover:text-foreground">Diária</Link>
          {" "}— sistema para pousadas
        </footer>
      </div>
    </main>
  )
}
