"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useApp } from "../../../components/app/ContextoApp"
import { Button } from "../../../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card"
import { Input } from "../../../components/ui/input"
import { Label } from "../../../components/ui/label"
import { Textarea } from "../../../components/ui/textarea"
import { cn } from "../../../lib/utils"
import { API_URL, authenticatedFetch } from "../../../lib/api"
import { changePassword } from "../../../lib/auth-client"
import { useEquipe } from "../../../hooks/useEquipe"
import { useStaffInvites } from "../../../hooks/useStaffInvites"
import type { Message } from "../../../lib/types"

const PAPEIS: Record<string, string> = { admin: "Administração", recepcao: "Recepção", auditoria: "Auditoria" }

function Aviso({ m }: { m: Message | null }) {
  if (!m) return null
  return (
    <div className={cn(
      "rounded-lg border px-3 py-2 text-sm",
      m.type === "success" ? "border-emerald-200/80 bg-emerald-50/80 text-emerald-800" : "border-rose-200/80 bg-rose-50/80 text-rose-800",
    )}>
      {m.text}
    </div>
  )
}

/** Dados da pousada — editáveis por dono e admin (antes não havia tela: o número de quartos não mudava nunca). */
function DadosDaPousada() {
  const { auth } = useApp()
  const p = auth.pousada!
  const podeEditar = Boolean(auth.user?.is_owner) || auth.user?.role === "admin"
  const [form, setForm] = useState({
    nome: p.nome, num_quartos: String(p.num_quartos), endereco: p.endereco ?? "", cidade: p.cidade ?? "",
    estado: p.estado ?? "", cep: p.cep ?? "", telefone: p.telefone ?? "", email: p.email ?? "", descricao: p.descricao ?? "",
  })
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<Message | null>(null)
  const campo = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setMsg(null)
    // Só manda o que mudou: a validação do backend é parcial, e campos
    // opcionais vazios não devem virar erro de formato.
    const corpo: Record<string, unknown> = {}
    if (form.nome !== p.nome) corpo.nome = form.nome
    if (Number(form.num_quartos) !== p.num_quartos) corpo.num_quartos = Number(form.num_quartos)
    for (const k of ["endereco", "cidade", "estado", "cep", "telefone", "email", "descricao"] as const) {
      if (form[k] !== (p[k] ?? "") && form[k] !== "") corpo[k] = form[k]
    }
    if (Object.keys(corpo).length === 0) {
      setSalvando(false)
      setMsg({ type: "success", text: "Nada para salvar." })
      return
    }
    try {
      const r = await authenticatedFetch(`${API_URL}/pousadas/${p.id}`, { method: "PUT", body: JSON.stringify(corpo) })
      const d = await r.json()
      if (d.sucesso) {
        setMsg({ type: "success", text: "Dados da pousada atualizados." })
        await auth.refreshPousadas({ silencioso: true })
      } else {
        setMsg({ type: "error", text: [d.mensagem, ...(d.erros ?? [])].filter(Boolean).join(" ") })
      }
    } catch {
      setMsg({ type: "error", text: "Não foi possível salvar agora." })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados da pousada</CardTitle>
        <CardDescription>Nome, quartos, endereço e contato.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={salvar} className="space-y-4">
          <Aviso m={msg} />
          <fieldset disabled={!podeEditar || salvando} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="cfg-nome">Nome</Label><Input id="cfg-nome" value={form.nome} onChange={campo("nome")} required /></div>
            <div className="space-y-1.5">
              <Label htmlFor="cfg-quartos">Número de quartos</Label>
              <Input id="cfg-quartos" type="number" min={1} max={100} value={form.num_quartos} onChange={campo("num_quartos")} required />
              <p className="text-xs text-muted-foreground">Nome, tipo e preço de cada um em <Link href="/quartos" className="underline">Quartos</Link>.</p>
            </div>
            <div className="space-y-1.5"><Label htmlFor="cfg-tel">Telefone / WhatsApp</Label><Input id="cfg-tel" value={form.telefone} onChange={campo("telefone")} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="cfg-end">Endereço</Label><Input id="cfg-end" value={form.endereco} onChange={campo("endereco")} /></div>
            <div className="space-y-1.5"><Label htmlFor="cfg-cid">Cidade</Label><Input id="cfg-cid" value={form.cidade} onChange={campo("cidade")} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label htmlFor="cfg-uf">UF</Label><Input id="cfg-uf" maxLength={2} value={form.estado} onChange={campo("estado")} /></div>
              <div className="space-y-1.5"><Label htmlFor="cfg-cep">CEP</Label><Input id="cfg-cep" value={form.cep} onChange={campo("cep")} /></div>
            </div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="cfg-email">E-mail da pousada</Label><Input id="cfg-email" type="email" value={form.email} onChange={campo("email")} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="cfg-desc">Descrição</Label><Textarea id="cfg-desc" rows={3} value={form.descricao} onChange={campo("descricao")} /></div>
          </fieldset>
          {podeEditar && <Button type="submit" disabled={salvando}>{salvando ? "Salvando..." : "Salvar alterações"}</Button>}
        </form>
      </CardContent>
    </Card>
  )
}

/** Equipe e convites. Antes só dava para convidar: não havia como ver quem tinha acesso, nem tirar o acesso de alguém. */
function Equipe() {
  const { auth } = useApp()
  const p = auth.pousada!
  const souDono = Boolean(auth.user?.is_owner)
  const equipe = useEquipe(p.id)
  const convites = useStaffInvites()
  const [email, setEmail] = useState("")
  const [papel, setPapel] = useState("recepcao")

  useEffect(() => {
    void equipe.carregar()
    void convites.carregarConvites(p.id)
  }, [p.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card>
      <CardHeader>
        <CardTitle>Equipe</CardTitle>
        <CardDescription>Quem tem acesso a esta pousada e com qual papel.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Aviso m={equipe.mensagem} />
        <div className="space-y-2">
          {equipe.membros.map((m) => {
            const souEu = m.id === auth.user?.id
            const editavel = !m.is_owner && !souEu && (souDono || m.role !== "admin")
            return (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{m.nome}{souEu && " (você)"}</p>
                  <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {m.is_owner ? (
                    <span className="text-xs font-medium text-primary">Proprietário</span>
                  ) : editavel ? (
                    <>
                      <select
                        aria-label={`Papel de ${m.nome}`}
                        value={m.role}
                        onChange={(e) => void equipe.trocarPapel(m.id, e.target.value)}
                        className="rounded-lg border border-border bg-white px-2 py-1.5 text-sm"
                      >
                        {Object.entries(PAPEIS)
                          .filter(([k]) => souDono || k !== "admin")
                          .map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-rose-600 hover:text-rose-700"
                        onClick={() => { if (window.confirm(`Remover ${m.nome} da equipe? O acesso termina na hora.`)) void equipe.remover(m.id) }}
                      >
                        Remover
                      </Button>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">{PAPEIS[m.role] ?? m.role}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="space-y-3 border-t border-border/60 pt-4">
          <p className="text-sm font-medium">Convidar pessoa</p>
          <Aviso m={convites.message} />
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              if (await convites.enviarConvite(p.id, email, papel)) { setEmail(""); setPapel("recepcao") }
            }}
            className="flex flex-col sm:flex-row gap-2"
          >
            <Input type="email" placeholder="email@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" className="flex-1" />
            <select value={papel} onChange={(e) => setPapel(e.target.value)} aria-label="Papel do convidado" className="rounded-lg border border-border bg-white px-3 py-2 text-sm">
              {Object.entries(PAPEIS).filter(([k]) => souDono || k !== "admin").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <Button type="submit" disabled={convites.loading}>{convites.loading ? "Enviando..." : "Convidar"}</Button>
          </form>

          {convites.convites.length > 0 && (
            <div className="space-y-2">
              {convites.convites.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/50 bg-muted/20 p-2.5">
                  <div>
                    <p className="text-sm font-medium">{c.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {PAPEIS[c.role] ?? c.role} ·{" "}
                      <span className={cn("font-medium", c.status === "pending" ? "text-amber-600" : c.status === "accepted" ? "text-emerald-600" : "text-rose-600")}>
                        {c.status === "pending" ? "Pendente" : c.status === "accepted" ? "Aceito" : c.status === "expired" ? "Expirado" : "Revogado"}
                      </span>
                    </p>
                  </div>
                  {(c.status === "pending" || c.status === "expired") && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => void convites.reenviarConvite(p.id, c.id)}>Reenviar</Button>
                      {c.status === "pending" && (
                        <Button variant="ghost" size="sm" className="text-rose-600 hover:text-rose-700" onClick={() => void convites.revogarConvite(p.id, c.id)}>Revogar</Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function Seguranca() {
  const [atual, setAtual] = useState("")
  const [nova, setNova] = useState("")
  const [confirmacao, setConfirmacao] = useState("")
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<Message | null>(null)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (nova.length < 8) return setMsg({ type: "error", text: "A nova senha deve ter pelo menos 8 caracteres." })
    if (nova !== confirmacao) return setMsg({ type: "error", text: "As senhas não coincidem." })
    setSalvando(true)
    try {
      const r = await changePassword(atual, nova) as { error?: { message?: string } }
      if (r?.error) setMsg({ type: "error", text: r.error.message || "Senha atual incorreta." })
      else {
        setMsg({ type: "success", text: "Senha alterada. As outras sessões foram encerradas." })
        setAtual(""); setNova(""); setConfirmacao("")
      }
    } catch {
      setMsg({ type: "error", text: "Erro ao alterar a senha." })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Segurança</CardTitle>
        <CardDescription>Alterar sua senha</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={enviar} className="space-y-2 max-w-sm">
          <Aviso m={msg} />
          <Input type="password" placeholder="Senha atual" value={atual} onChange={(e) => setAtual(e.target.value)} required autoComplete="current-password" />
          <Input type="password" placeholder="Nova senha" value={nova} onChange={(e) => setNova(e.target.value)} required autoComplete="new-password" />
          <Input type="password" placeholder="Confirmar nova senha" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} required autoComplete="new-password" />
          <Button type="submit" disabled={salvando} className="w-full">{salvando ? "Alterando..." : "Alterar senha"}</Button>
        </form>
      </CardContent>
    </Card>
  )
}


/** Por quanto tempo guardar nome, CPF e observações dos hóspedes após a saída. */
function RetencaoDeHospedes() {
  const { auth } = useApp()
  const p = auth.pousada!
  const podeEditar = Boolean(auth.user?.is_owner) || auth.user?.role === "admin"
  const atual = p.configuracoes?.retencao_hospedes_meses ?? 0
  const [msg, setMsg] = useState<Message | null>(null)

  async function mudar(meses: number) {
    setMsg(null)
    const r = await authenticatedFetch(`${API_URL}/pousadas/${p.id}`, {
      method: "PUT",
      body: JSON.stringify({ configuracoes: { retencao_hospedes_meses: meses } }),
    })
    const d = await r.json()
    setMsg({ type: d.sucesso ? "success" : "error", text: d.sucesso ? "Prazo de retenção atualizado." : d.mensagem || "Não foi possível salvar." })
    if (d.sucesso) await auth.refreshPousadas({ silencioso: true })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados dos hóspedes</CardTitle>
        <CardDescription>
          Depois do prazo, nome, CPF e observações das estadias encerradas são anonimizados automaticamente.
          Datas e valores ficam para os relatórios. Confira o prazo que a sua atividade precisa guardar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Aviso m={msg} />
        <select
          aria-label="Prazo de retenção dos dados de hóspedes"
          disabled={!podeEditar}
          value={atual}
          onChange={(e) => void mudar(Number(e.target.value))}
          className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
        >
          <option value={0}>Não anonimizar automaticamente</option>
          <option value={12}>Anonimizar após 12 meses</option>
          <option value={24}>Anonimizar após 24 meses</option>
          <option value={60}>Anonimizar após 5 anos</option>
        </select>
      </CardContent>
    </Card>
  )
}

/** Direitos do titular: exportar os próprios dados, excluir a conta, excluir a pousada. */
function SuaConta() {
  const { auth } = useApp()
  const p = auth.pousada!
  const [msg, setMsg] = useState<Message | null>(null)

  async function exportar() {
    setMsg(null)
    const r = await authenticatedFetch(`${API_URL}/conta/exportar`)
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      return setMsg({ type: "error", text: d.mensagem || "Não foi possível exportar agora." })
    }
    const blob = await r.blob()
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = "meus-dados-diaria.json"
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function excluirConta() {
    const confirmacao = window.prompt("Isso apaga seu nome, e-mail e acesso a todas as pousadas. Digite EXCLUIR para confirmar.")
    if (confirmacao !== "EXCLUIR") return
    const r = await authenticatedFetch(`${API_URL}/conta`, { method: "DELETE", body: JSON.stringify({ confirmacao }) })
    const d = await r.json()
    if (d.sucesso) window.location.assign("/")
    else setMsg({ type: "error", text: d.mensagem || "Não foi possível excluir a conta." })
  }

  async function excluirPousada() {
    const confirmacao = window.prompt(
      `Excluir "${p.nome}" apaga DEFINITIVAMENTE reservas, hóspedes, equipe e histórico. Exporte as reservas antes.\n\nDigite o nome da pousada para confirmar:`,
    )
    if (!confirmacao) return
    const r = await authenticatedFetch(`${API_URL}/pousadas/${p.id}`, { method: "DELETE", body: JSON.stringify({ confirmacao }) })
    const d = await r.json()
    if (d.sucesso) window.location.assign("/painel")
    else setMsg({ type: "error", text: d.mensagem || "Não foi possível excluir a pousada." })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sua conta e seus dados</CardTitle>
        <CardDescription>Exporte o que o Diária guarda sobre você ou encerre a conta (LGPD).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Aviso m={msg} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void exportar()}>Exportar meus dados</Button>
          <Button variant="outline" className="text-rose-600 hover:text-rose-700" onClick={() => void excluirConta()}>Excluir minha conta</Button>
          {auth.user?.is_owner && (
            <Button variant="outline" className="text-rose-600 hover:text-rose-700" onClick={() => void excluirPousada()}>Excluir esta pousada</Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function Configuracoes() {
  const { auth } = useApp()
  const gerencia = Boolean(auth.user?.is_owner) || auth.user?.role === "admin"
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
      <div className="grid gap-5 lg:grid-cols-2">
        <DadosDaPousada />
        {gerencia && <Equipe />}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Seguranca />
        <RetencaoDeHospedes />
      </div>
      <SuaConta />
    </div>
  )
}
