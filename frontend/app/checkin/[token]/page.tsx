"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { DOCUMENTOS, GENEROS, MOTIVOS, TRANSPORTES, type Acompanhante, type Titular } from "../../../lib/fnrh"

const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "")

interface Resumo {
  pousada: string; cidade: string | null; estado: string | null; quarto: string; entrada: string; saida: string
  adultos: number; criancas: number; primeiroNome: string; enviado: boolean; aberto: boolean
}

const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const campo = "h-11 w-full rounded-lg border border-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
const titularVazio: Titular = {
  nome: "", dataNascimento: "", genero: "nao_informar", nacionalidade: "Brasileira", tipoDocumento: "cpf", documento: "", orgaoEmissor: "",
  email: "", telefone: "", profissao: "", cidadeResidencia: "", estadoResidencia: "", paisResidencia: "Brasil",
  motivoViagem: "lazer", meioTransporte: "automovel", procedencia: "", proximoDestino: "",
}
const acompanhanteVazio: Acompanhante = { nome: "", dataNascimento: "", tipoDocumento: "cpf", documento: "", parentesco: "" }

function Campo({ id, rotulo, children }: { id: string; rotulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium">{rotulo}</label>
      {children}
    </div>
  )
}

/**
 * Pré-check-in: a ficha de hóspede (campos da FNRH) preenchida em casa,
 * pelo link que a pousada mandou. Na chegada, é só pegar a chave.
 */
export default function PreCheckin() {
  const { token } = useParams<{ token: string }>()
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [naoEncontrado, setNaoEncontrado] = useState(false)
  const [t, setT] = useState<Titular>(titularVazio)
  const [acomp, setAcomp] = useState<Acompanhante[]>([])
  const [aceite, setAceite] = useState(false)
  const [erros, setErros] = useState<string[]>([])
  const [enviado, setEnviado] = useState(false)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch(`${API}/api/publico/checkin/${token}`)
        const d = await r.json()
        if (!d.sucesso) { setNaoEncontrado(true); return }
        setResumo(d.reserva)
        const outros = Math.max(d.reserva.adultos + d.reserva.criancas - 1, 0)
        setAcomp(Array.from({ length: Math.min(outros, 20) }, () => ({ ...acompanhanteVazio })))
      } catch {
        setNaoEncontrado(true)
      }
    })()
  }, [token])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErros([]); setOcupado(true)
    try {
      const r = await fetch(`${API}/api/publico/checkin/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titular: t, acompanhantes: acomp.filter((a) => a.nome.trim()), aceite }),
      })
      const d = await r.json()
      if (!d.sucesso) { setErros(d.erros?.length ? d.erros : [d.mensagem]); window.scrollTo({ top: 0, behavior: "smooth" }); return }
      setEnviado(true)
      window.scrollTo({ top: 0, behavior: "smooth" })
    } catch {
      setErros(["Não foi possível enviar agora. Tente de novo em instantes."])
    } finally {
      setOcupado(false)
    }
  }

  const sT = (k: keyof Titular) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setT((x) => ({ ...x, [k]: e.target.value }))
  const sA = (i: number, k: keyof Acompanhante) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setAcomp((lista) => lista.map((a, j) => (j === i ? { ...a, [k]: e.target.value } : a)))

  if (naoEncontrado) {
    return <main className="mx-auto max-w-xl px-4 py-16 text-center text-sm text-muted-foreground">Link de pré-check-in inválido. Peça um novo à pousada.</main>
  }
  if (!resumo) {
    return <main className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></main>
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:py-12">
        <header className="space-y-1">
          <p className="text-sm text-muted-foreground">Pré-check-in</p>
          <h1 className="text-2xl font-bold tracking-tight">{resumo.pousada}</h1>
          <p className="text-sm text-muted-foreground">{resumo.quarto} · {br(resumo.entrada)} a {br(resumo.saida)}</p>
        </header>

        {enviado ? (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6 text-emerald-900">
            <h2 className="text-lg font-semibold">Ficha enviada. Obrigado, {resumo.primeiroNome}!</h2>
            <p className="mt-1 text-sm">Na chegada é só se apresentar na recepção — seus dados já estão com a pousada.</p>
          </section>
        ) : !resumo.aberto ? (
          <p className="rounded-xl border border-border bg-white p-5 text-sm">Este pré-check-in já foi encerrado. Qualquer dúvida, fale com a pousada.</p>
        ) : (
          <form onSubmit={enviar} className="space-y-6">
            {resumo.enviado && <p className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">Você já enviou a ficha. Se mandar de novo, ela substitui a anterior.</p>}
            {erros.length > 0 && (
              <ul role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 list-disc pl-8">
                {erros.map((e) => <li key={e}>{e}</li>)}
              </ul>
            )}

            <section className="space-y-4 rounded-2xl border border-border bg-white p-5">
              <h2 className="font-semibold">Seus dados</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo id="f-nome" rotulo="Nome completo *"><input id="f-nome" required autoComplete="name" className={campo} value={t.nome} onChange={sT("nome")} /></Campo>
                <Campo id="f-nasc" rotulo="Data de nascimento *"><input id="f-nasc" type="date" required className={campo} value={t.dataNascimento} onChange={sT("dataNascimento")} /></Campo>
                <Campo id="f-tipo" rotulo="Documento *">
                  <select id="f-tipo" className={campo} value={t.tipoDocumento} onChange={sT("tipoDocumento")}>{DOCUMENTOS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select>
                </Campo>
                <Campo id="f-doc" rotulo="Número do documento *"><input id="f-doc" required className={campo} value={t.documento} onChange={sT("documento")} /></Campo>
                {t.tipoDocumento !== "cpf" && (
                  <Campo id="f-orgao" rotulo={t.tipoDocumento === "passaporte" ? "País emissor" : "Órgão emissor"}><input id="f-orgao" className={campo} value={t.orgaoEmissor} onChange={sT("orgaoEmissor")} /></Campo>
                )}
                <Campo id="f-nac" rotulo="Nacionalidade *"><input id="f-nac" required className={campo} value={t.nacionalidade} onChange={sT("nacionalidade")} /></Campo>
                <Campo id="f-gen" rotulo="Gênero">
                  <select id="f-gen" className={campo} value={t.genero} onChange={sT("genero")}>{GENEROS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select>
                </Campo>
                <Campo id="f-prof" rotulo="Profissão"><input id="f-prof" className={campo} value={t.profissao} onChange={sT("profissao")} /></Campo>
                <Campo id="f-email" rotulo="E-mail"><input id="f-email" type="email" autoComplete="email" className={campo} value={t.email} onChange={sT("email")} /></Campo>
                <Campo id="f-tel" rotulo="Celular"><input id="f-tel" type="tel" autoComplete="tel" className={campo} value={t.telefone} onChange={sT("telefone")} /></Campo>
              </div>
            </section>

            <section className="space-y-4 rounded-2xl border border-border bg-white p-5">
              <h2 className="font-semibold">Residência e viagem</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <Campo id="f-cid" rotulo="Cidade onde mora *"><input id="f-cid" required className={campo} value={t.cidadeResidencia} onChange={sT("cidadeResidencia")} /></Campo>
                <Campo id="f-uf" rotulo="Estado"><input id="f-uf" className={campo} value={t.estadoResidencia} onChange={sT("estadoResidencia")} /></Campo>
                <Campo id="f-pais" rotulo="País"><input id="f-pais" className={campo} value={t.paisResidencia} onChange={sT("paisResidencia")} /></Campo>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo id="f-mot" rotulo="Motivo da viagem">
                  <select id="f-mot" className={campo} value={t.motivoViagem} onChange={sT("motivoViagem")}>{MOTIVOS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select>
                </Campo>
                <Campo id="f-meio" rotulo="Meio de transporte">
                  <select id="f-meio" className={campo} value={t.meioTransporte} onChange={sT("meioTransporte")}>{TRANSPORTES.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select>
                </Campo>
                <Campo id="f-proc" rotulo="Vindo de (cidade)"><input id="f-proc" className={campo} value={t.procedencia} onChange={sT("procedencia")} /></Campo>
                <Campo id="f-dest" rotulo="Próximo destino (cidade)"><input id="f-dest" className={campo} value={t.proximoDestino} onChange={sT("proximoDestino")} /></Campo>
              </div>
            </section>

            {acomp.length > 0 && (
              <section className="space-y-4 rounded-2xl border border-border bg-white p-5">
                <h2 className="font-semibold">Acompanhantes</h2>
                {acomp.map((a, i) => (
                  <div key={i} className="grid gap-3 border-t border-border pt-3 first:border-0 first:pt-0 sm:grid-cols-2">
                    <Campo id={`a-nome-${i}`} rotulo={`Acompanhante ${i + 1} — nome`}><input id={`a-nome-${i}`} className={campo} value={a.nome} onChange={sA(i, "nome")} /></Campo>
                    <Campo id={`a-nasc-${i}`} rotulo="Data de nascimento"><input id={`a-nasc-${i}`} type="date" className={campo} value={a.dataNascimento} onChange={sA(i, "dataNascimento")} /></Campo>
                    <Campo id={`a-tipo-${i}`} rotulo="Documento (opcional para crianças)">
                      <select id={`a-tipo-${i}`} className={campo} value={a.tipoDocumento} onChange={sA(i, "tipoDocumento")}>{DOCUMENTOS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select>
                    </Campo>
                    <Campo id={`a-doc-${i}`} rotulo="Número"><input id={`a-doc-${i}`} className={campo} value={a.documento} onChange={sA(i, "documento")} /></Campo>
                    <Campo id={`a-par-${i}`} rotulo="Parentesco"><input id={`a-par-${i}`} className={campo} placeholder="Filho(a), cônjuge, amigo..." value={a.parentesco} onChange={sA(i, "parentesco")} /></Campo>
                  </div>
                ))}
              </section>
            )}

            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" required checked={aceite} onChange={(e) => setAceite(e.target.checked)} className="mt-1 h-4 w-4 accent-primary" />
              <span>Autorizo o envio destes dados à {resumo.pousada} para o meu registro de hóspede (Ficha Nacional de Registro de Hóspedes).</span>
            </label>
            <button type="submit" disabled={ocupado} className="h-12 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {ocupado ? "Enviando..." : "Enviar ficha"}
            </button>
            <p className="text-center text-xs text-muted-foreground">Seus dados vão protegidos e só a pousada tem acesso.</p>
          </form>
        )}
      </div>
    </main>
  )
}
