"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "../ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card"
import { API_URL, authenticatedFetch } from "../../lib/api"
import { formatarData, formatarDataHora } from "../../lib/formatters"
import { linkWhatsApp } from "../../lib/hospedes"
import { DOCUMENTOS, GENEROS, MOTIVOS, TRANSPORTES, rotulo, type Ficha } from "../../lib/fnrh"
import type { Message } from "../../lib/types"

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

/** Linhas da ficha, na ordem da FNRH (usadas na tela e na impressão). */
function linhas(f: Ficha): [string, string][] {
  const t = f.titular
  return [
    ["Nome", t.nome], ["Nascimento", formatarData(t.dataNascimento)], ["Gênero", rotulo(GENEROS, t.genero)],
    ["Nacionalidade", t.nacionalidade], ["Documento", `${rotulo(DOCUMENTOS, t.tipoDocumento)} ${t.documento}${t.orgaoEmissor ? ` (${t.orgaoEmissor})` : ""}`],
    ["Profissão", t.profissao], ["E-mail", t.email], ["Celular", t.telefone],
    ["Residência", [t.cidadeResidencia, t.estadoResidencia, t.paisResidencia].filter(Boolean).join(" - ")],
    ["Motivo da viagem", rotulo(MOTIVOS, t.motivoViagem)], ["Transporte", rotulo(TRANSPORTES, t.meioTransporte)],
    ["Procedência", t.procedencia], ["Próximo destino", t.proximoDestino],
  ]
}

/**
 * Pré-check-in da reserva: link para o hóspede preencher a ficha (FNRH) em
 * casa, situação, a ficha recebida e a versão para imprimir/assinar.
 */
export function PrecheckinDaReserva({ reservaId, enviadoEm, hospede, telefone, pousada, quarto, entrada, saida, onMensagem }: {
  reservaId: number
  enviadoEm?: string | null
  hospede: string
  telefone?: string
  pousada: string
  quarto: string
  entrada: string
  saida: string
  onMensagem: (m: Message) => void
}) {
  const [link, setLink] = useState<string | null>(null)
  const [ficha, setFicha] = useState<{ ficha: Ficha; enviadoEm: string } | null>(null)
  const [aberta, setAberta] = useState(false)

  const carregarFicha = useCallback(async () => {
    const r = await authenticatedFetch(`${API_URL}/reservas/${reservaId}/precheckin`)
    const d = await r.json()
    if (d.sucesso) setFicha(d.precheckin)
  }, [reservaId])
  useEffect(() => { if (enviadoEm) void carregarFicha() }, [enviadoEm, carregarFicha])

  async function gerarLink(): Promise<string | null> {
    if (link) return link
    const r = await authenticatedFetch(`${API_URL}/reservas/${reservaId}/precheckin/link`, { method: "POST" })
    const d = await r.json()
    if (!d.sucesso) { onMensagem({ type: "error", text: d.mensagem || "Não foi possível gerar o link." }); return null }
    setLink(d.url)
    return d.url
  }

  async function copiar() {
    const url = await gerarLink()
    if (!url) return
    try { await navigator.clipboard.writeText(url); onMensagem({ type: "success", text: "Link do pré-check-in copiado." }) }
    catch { window.prompt("Copie o link:", url) }
  }

  async function whatsapp() {
    const url = await gerarLink()
    const zap = url && linkWhatsApp(telefone, `Olá, ${hospede.split(" ")[0]}! Para agilizar sua chegada na ${pousada} em ${formatarData(entrada)}, preencha a ficha de hóspede por este link (leva 2 minutos): ${url}`)
    if (zap) window.open(zap, "_blank", "noopener")
  }

  function imprimir() {
    if (!ficha) return
    const f = ficha.ficha
    const tabela = linhas(f).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v || "—")}</td></tr>`).join("")
    const acomp = f.acompanhantes.map((a) => `<tr><td>${esc(a.nome)}</td><td>${esc(formatarData(a.dataNascimento))}</td><td>${esc(a.documento ? `${rotulo(DOCUMENTOS, a.tipoDocumento)} ${a.documento}` : "—")}</td><td>${esc(a.parentesco || "—")}</td></tr>`).join("")
    const w = window.open("", "_blank")
    if (!w) return
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ficha de hóspede — ${esc(f.titular.nome)}</title>
      <style>body{font-family:system-ui,sans-serif;margin:32px;color:#111}h1{font-size:18px;margin:0}p{margin:4px 0 16px;color:#555;font-size:13px}
      table{border-collapse:collapse;width:100%;margin-bottom:20px;font-size:13px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}th{width:30%;background:#f6f6f6}
      .ass{margin-top:48px;border-top:1px solid #333;width:60%;padding-top:4px;font-size:12px}</style></head><body>
      <h1>Ficha Nacional de Registro de Hóspedes</h1>
      <p>${esc(pousada)} · ${esc(quarto)} · ${esc(formatarData(entrada))} a ${esc(formatarData(saida))} · enviada em ${esc(formatarDataHora(ficha.enviadoEm))}</p>
      <table>${tabela}</table>
      ${f.acompanhantes.length ? `<h1>Acompanhantes</h1><table style="margin-top:8px"><tr><th>Nome</th><th>Nascimento</th><th>Documento</th><th>Parentesco</th></tr>${acomp}</table>` : ""}
      <div class="ass">Assinatura do hóspede</div>
      <script>window.onload=()=>window.print()</script></body></html>`)
    w.document.close()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pré-check-in</CardTitle>
        <CardDescription>
          {enviadoEm
            ? `Ficha recebida em ${formatarDataHora(enviadoEm)}.`
            : "O hóspede preenche a ficha (dados da FNRH) pelo link antes de chegar — sem fila no balcão."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {linkWhatsApp(telefone) && <Button type="button" variant="outline" onClick={() => void whatsapp()}>Enviar link no WhatsApp</Button>}
          <Button type="button" variant="ghost" onClick={() => void copiar()}>Copiar link</Button>
          {ficha && (
            <>
              <Button type="button" variant="outline" onClick={() => setAberta((x) => !x)}>{aberta ? "Esconder ficha" : "Ver ficha"}</Button>
              <Button type="button" variant="ghost" onClick={imprimir}>Imprimir</Button>
            </>
          )}
        </div>
        {aberta && ficha && (
          <div className="space-y-3 text-sm">
            <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[10rem_1fr]">
              {linhas(ficha.ficha).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd>{v || "—"}</dd>
                </div>
              ))}
            </dl>
            {ficha.ficha.acompanhantes.length > 0 && (
              <div>
                <p className="font-medium">Acompanhantes</p>
                <ul className="list-disc pl-5">
                  {ficha.ficha.acompanhantes.map((a, i) => (
                    <li key={i}>{a.nome} · {formatarData(a.dataNascimento)}{a.documento ? ` · ${rotulo(DOCUMENTOS, a.tipoDocumento)} ${a.documento}` : ""}{a.parentesco ? ` · ${a.parentesco}` : ""}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
