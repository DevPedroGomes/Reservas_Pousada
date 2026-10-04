"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { API_URL, authenticatedFetch } from "../../lib/api"
import { reais } from "../../lib/conta"
import { linkWhatsApp } from "../../lib/hospedes"
import type { Message } from "../../lib/types"

interface Cobranca {
  id: number
  provedor: "chave" | "asaas"
  valorCentavos: number
  copiaECola: string
  qrCode: string
  status: "pendente" | "paga" | "expirada" | "cancelada"
}

const ROTULO: Record<Cobranca["status"], string> = { pendente: "aguardando", paga: "paga", expirada: "expirada", cancelada: "cancelada" }

/**
 * Cobrança Pix da reserva: gera o código (sinal ou saldo), manda pelo
 * WhatsApp e, no Pix pela chave, baixa com "Recebi o Pix".
 */
export function PixDaReserva({ reservaId, telefone, hospede, pousada, podeCobrar, onMensagem, onMudou }: {
  reservaId: number
  telefone?: string
  hospede: string
  pousada: string
  podeCobrar: boolean
  onMensagem: (m: Message) => void
  /** Pagamento baixado: a conta e o status da reserva mudaram. */
  onMudou: () => void
}) {
  const [cobrancas, setCobrancas] = useState<Cobranca[]>([])
  const [sugerido, setSugerido] = useState(0)
  const [valor, setValor] = useState("")
  const [ocupado, setOcupado] = useState(false)
  const [copiado, setCopiado] = useState<number | null>(null)

  const carregar = useCallback(async () => {
    const r = await authenticatedFetch(`${API_URL}/reservas/${reservaId}/pix`)
    const d = await r.json()
    if (d.sucesso) { setCobrancas(d.cobrancas); setSugerido(d.valorSugeridoCentavos) }
  }, [reservaId])
  useEffect(() => { void carregar() }, [carregar])

  async function gerar(e: React.FormEvent) {
    e.preventDefault()
    setOcupado(true)
    const r = await authenticatedFetch(`${API_URL}/reservas/${reservaId}/pix`, {
      method: "POST",
      body: JSON.stringify(valor.trim() ? { valor } : {}),
    })
    const d = await r.json()
    setOcupado(false)
    if (!d.sucesso) { onMensagem({ type: "error", text: d.mensagem }); return }
    setValor("")
    await carregar()
  }

  async function recebido(c: Cobranca) {
    if (!window.confirm(`Confirma que o Pix de ${reais(c.valorCentavos)} entrou na conta?`)) return
    const r = await authenticatedFetch(`${API_URL}/reservas/${reservaId}/pix/${c.id}/recebida`, { method: "POST" })
    const d = await r.json()
    onMensagem({ type: d.sucesso ? "success" : "error", text: d.mensagem })
    if (d.sucesso) { await carregar(); onMudou() }
  }

  async function copiar(c: Cobranca) {
    try {
      await navigator.clipboard.writeText(c.copiaECola)
      setCopiado(c.id)
      setTimeout(() => setCopiado(null), 2000)
    } catch {
      window.prompt("Copie o código Pix:", c.copiaECola)
    }
  }

  const aberta = cobrancas.find((c) => c.status === "pendente")

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Cobrar por Pix</h3>
      {aberta && (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={aberta.qrCode} alt="QR Code do Pix" className="h-36 w-36 shrink-0 self-center rounded" />
          <div className="min-w-0 flex-1 space-y-2 text-sm">
            <p>
              <strong>{reais(aberta.valorCentavos)}</strong> · {aberta.provedor === "asaas" ? "confirma sozinho quando o hóspede pagar" : "confira o recebimento no banco"}
            </p>
            <p className="break-all rounded bg-muted/50 p-2 font-mono text-[11px] leading-tight">{aberta.copiaECola}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => void copiar(aberta)}>{copiado === aberta.id ? "Copiado" : "Copiar código"}</Button>
              {linkWhatsApp(telefone) && (
                <a
                  href={linkWhatsApp(telefone, `Olá, ${hospede.split(" ")[0]}! Para confirmar sua reserva na ${pousada}, o Pix de ${reais(aberta.valorCentavos)} é este (copia e cola):\n\n${aberta.copiaECola}`)!}
                  target="_blank" rel="noreferrer"
                >
                  <Button type="button" size="sm" variant="outline">Enviar no WhatsApp</Button>
                </a>
              )}
              {podeCobrar && aberta.provedor === "chave" && (
                <Button type="button" size="sm" onClick={() => void recebido(aberta)}>Recebi o Pix</Button>
              )}
            </div>
          </div>
        </div>
      )}
      {podeCobrar && !aberta && (
        <form onSubmit={gerar} className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="pix-valor" className="text-xs">Valor (R$)</Label>
            <Input id="pix-valor" inputMode="decimal" className="w-36" value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d.,]/g, ""))}
              placeholder={sugerido > 0 ? (sugerido / 100).toFixed(2).replace(".", ",") : "0,00"} />
          </div>
          <Button type="submit" variant="outline" disabled={ocupado || (!valor && sugerido <= 0)}>{ocupado ? "Gerando..." : "Gerar Pix"}</Button>
          {sugerido > 0 && !valor && <span className="text-xs text-muted-foreground">em branco = {reais(sugerido)}</span>}
        </form>
      )}
      {cobrancas.filter((c) => c !== aberta).length > 0 && (
        <ul className="text-xs text-muted-foreground">
          {cobrancas.filter((c) => c !== aberta).map((c) => (
            <li key={c.id}>Pix de {reais(c.valorCentavos)} — {ROTULO[c.status]}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
