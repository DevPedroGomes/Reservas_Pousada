"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Button } from "../ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card"
import { cn } from "../../lib/utils"
import { API_URL, authenticatedFetch } from "../../lib/api"
import type { Message } from "../../lib/types"

interface Config { disponivel: boolean; appId: string | null; configId: string | null; versao: string; agenteDisponivel: boolean }
interface Conta {
  conectado: boolean
  numero?: string | null
  nome?: string | null
  coexistencia?: boolean
  agenteAtivo?: boolean
  modelosCriados?: boolean
}

interface FacebookSdk {
  init(o: Record<string, unknown>): void
  login(cb: (r: { authResponse?: { code?: string } | null }) => void, o: Record<string, unknown>): void
}
declare global {
  interface Window { FB?: FacebookSdk; fbAsyncInit?: () => void }
}

/** Carrega o SDK da Meta uma vez (só nesta tela). */
function carregarSdk(appId: string, versao: string): Promise<FacebookSdk> {
  if (window.FB) return Promise.resolve(window.FB)
  return new Promise((ok, falha) => {
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version: versao })
      ok(window.FB!)
    }
    const s = document.createElement("script")
    s.src = "https://connect.facebook.net/pt_BR/sdk.js"
    s.async = true
    s.crossOrigin = "anonymous"
    s.onerror = () => falha(new Error("Não foi possível carregar o login da Meta. Verifique bloqueadores de anúncio."))
    document.body.appendChild(s)
  })
}

interface Sessao { wabaId: string; phoneNumberId: string; coexistencia: boolean }

/**
 * WhatsApp Business da própria pousada: conecta pelo cadastro oficial da Meta
 * (Embedded Signup), sem copiar token nenhum. A conta, o número e a cobrança
 * das conversas continuam sendo da pousada.
 */
export function WhatsappBusinessCard() {
  const [config, setConfig] = useState<Config | null>(null)
  const [conta, setConta] = useState<Conta | null>(null)
  const [msg, setMsg] = useState<Message | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const sessao = useRef<Sessao | null>(null)

  useEffect(() => {
    void (async () => {
      const [c, s] = await Promise.all([
        authenticatedFetch(`${API_URL}/whatsapp/config`).then((r) => r.json()).catch(() => null),
        authenticatedFetch(`${API_URL}/whatsapp/conta`).then((r) => r.json()).catch(() => null),
      ])
      if (c?.sucesso) setConfig(c)
      if (s?.sucesso) setConta(s.conta)
    })()
  }, [])

  // SDK carregado antes do clique: o FB.login abre um popup, e o navegador só
  // deixa abrir se for logo depois do gesto da pessoa.
  useEffect(() => {
    if (config?.disponivel && config.appId && conta && !conta.conectado) void carregarSdk(config.appId, config.versao).catch(() => {})
  }, [config, conta])

  // O cadastro da Meta avisa por postMessage qual conta e número a pousada escolheu.
  useEffect(() => {
    function ouvir(e: MessageEvent) {
      let host = ""
      try { host = new URL(e.origin).hostname } catch { return }
      if (!/(^|\.)facebook\.com$/.test(host)) return
      let d: { type?: string; event?: string; data?: { waba_id?: string; phone_number_id?: string; error_message?: string } }
      try { d = typeof e.data === "string" ? JSON.parse(e.data) : e.data } catch { return }
      if (d?.type !== "WA_EMBEDDED_SIGNUP") return
      if (d.event === "CANCEL") setMsg({ type: "error", text: "Cadastro cancelado antes do fim." })
      else if (d.event === "ERROR") setMsg({ type: "error", text: d.data?.error_message || "A Meta recusou o cadastro." })
      else if (d.data?.waba_id && d.data?.phone_number_id) {
        sessao.current = {
          wabaId: d.data.waba_id,
          phoneNumberId: d.data.phone_number_id,
          coexistencia: d.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
        }
      }
    }
    window.addEventListener("message", ouvir)
    return () => window.removeEventListener("message", ouvir)
  }, [])

  async function conectar(coexistencia: boolean) {
    if (!config?.appId || !config.configId) return
    setMsg(null)
    setOcupado(true)
    sessao.current = null
    try {
      const FB = await carregarSdk(config.appId, config.versao)
      const code = await new Promise<string | null>((ok) => {
        FB.login((r) => ok(r.authResponse?.code ?? null), {
          config_id: config.configId,
          response_type: "code",
          override_default_response_type: true,
          extras: { setup: {}, sessionInfoVersion: "3", ...(coexistencia ? { featureType: "whatsapp_business_app_onboarding" } : {}) },
        })
      })
      if (!code) { setMsg({ type: "error", text: "Cadastro não concluído." }); return }
      // O aviso com a conta escolhida às vezes chega um instante depois do código.
      // (o ref é preenchido pelo ouvinte de postMessage, fora deste fluxo).
      const escolhida = () => sessao.current as Sessao | null
      for (let i = 0; i < 30 && !escolhida(); i++) await new Promise((r) => setTimeout(r, 100))
      const s = escolhida()
      if (!s) { setMsg({ type: "error", text: "A Meta não informou o número escolhido. Tente de novo." }); return }
      const r = await authenticatedFetch(`${API_URL}/whatsapp/conectar`, {
        method: "POST",
        body: JSON.stringify({ code, waba_id: s.wabaId, phone_number_id: s.phoneNumberId, coexistencia: coexistencia || s.coexistencia }),
      })
      const d = await r.json()
      if (d.sucesso) {
        setConta(d.conta)
        setMsg({ type: "success", text: "WhatsApp conectado." })
      } else setMsg({ type: "error", text: d.mensagem || "Não foi possível conectar." })
    } catch (err) {
      setMsg({ type: "error", text: err instanceof Error ? err.message : "Não foi possível conectar." })
    } finally {
      setOcupado(false)
    }
  }

  async function agente(ativo: boolean) {
    setMsg(null)
    const r = await authenticatedFetch(`${API_URL}/whatsapp/agente`, { method: "PUT", body: JSON.stringify({ ativo }) })
    const d = await r.json()
    if (d.sucesso) {
      setConta(d.conta)
      setMsg({ type: "success", text: ativo ? "Atendente virtual ligado." : "Atendente virtual desligado." })
    } else setMsg({ type: "error", text: d.mensagem || "Não foi possível mudar." })
  }

  async function desconectar() {
    if (!window.confirm("Desconectar o WhatsApp? O atendente virtual para e o painel deixa de receber as conversas. O número continua seu.")) return
    const r = await authenticatedFetch(`${API_URL}/whatsapp/desconectar`, { method: "POST" })
    const d = await r.json()
    if (d.sucesso) setConta(d.conta)
  }

  if (!config || !conta) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>WhatsApp Business da pousada</CardTitle>
        <CardDescription>
          Conecte o número da pousada para receber as conversas aqui, mandar lembretes pelo seu próprio número e, se quiser,
          ligar o atendente virtual: ele responde na hora sobre vagas, preços e regras, faz a pré-reserva com Pix e chama a
          equipe quando precisa. A conta e a cobrança das conversas continuam sendo suas, direto com a Meta.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {msg && (
          <div className={cn("rounded-lg border px-3 py-2 text-sm", msg.type === "success" ? "border-emerald-200/80 bg-emerald-50/80 text-emerald-800" : "border-rose-200/80 bg-rose-50/80 text-rose-800")}>
            {msg.text}
          </div>
        )}

        {!conta.conectado ? (
          config.disponivel ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void conectar(true)} disabled={ocupado}>
                  {ocupado ? "Conectando..." : "Conectar o número do app WhatsApp Business"}
                </Button>
                <Button variant="outline" onClick={() => void conectar(false)} disabled={ocupado}>Usar um número novo</Button>
              </div>
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                <li>Com o número do app, você continua usando o WhatsApp Business no celular normalmente; as conversas aparecem nos dois.</li>
                <li>Você vai entrar com o Facebook da pousada, escolher (ou criar) o portfólio da empresa e confirmar o número por código.</li>
                <li>Responder ao hóspede em até 24h depois da mensagem dele não tem custo; mensagens iniciadas pela pousada (lembrete) são cobradas pela Meta na sua conta.</li>
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">A conexão com o WhatsApp oficial ainda não foi liberada nesta instalação.</p>
          )
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div>
                <p className="font-medium" data-testid="whatsapp-numero">{conta.numero || "Número conectado"}</p>
                <p className="text-xs text-muted-foreground">
                  {conta.nome ? `${conta.nome} · ` : ""}{conta.coexistencia ? "também no app do celular" : "só pela API"}
                  {conta.modelosCriados ? "" : " · modelos de mensagem pendentes"}
                </p>
              </div>
              <Link href="/whatsapp" className="text-sm font-medium text-primary underline">Ver conversas</Link>
            </div>

            <div className="space-y-2 rounded-lg border border-border p-3">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-primary"
                  checked={Boolean(conta.agenteAtivo)}
                  disabled={!config.agenteDisponivel}
                  onChange={(e) => void agente(e.target.checked)}
                />
                <span>
                  <span className="font-medium">Atendente virtual</span>
                  <span className="block text-xs text-muted-foreground">
                    {config.agenteDisponivel
                      ? "Responde sozinho com os dados da pousada (quartos, tarifas, políticas e vagas reais). Não confirma pagamento, não cancela e não dá desconto: passa para a equipe e avisa por e-mail. O hóspede pode escrever “atendente” a qualquer momento."
                      : "Ainda não disponível nesta instalação."}
                  </span>
                </span>
              </label>
            </div>

            <button type="button" className="text-xs text-rose-700 underline" onClick={() => void desconectar()}>Desconectar WhatsApp</button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
