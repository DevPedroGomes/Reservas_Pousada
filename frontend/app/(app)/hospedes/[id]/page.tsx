"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useApp } from "../../../../components/app/ContextoApp"
import { Badge } from "../../../../components/ui/badge"
import { Button } from "../../../../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card"
import { Input } from "../../../../components/ui/input"
import { Label } from "../../../../components/ui/label"
import { Select } from "../../../../components/ui/select"
import { Textarea } from "../../../../components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../components/ui/table"
import { useHospede } from "../../../../hooks/useHospedes"
import { formatarData, formatarValor, getStatusBadgeVariant, getStatusLabel } from "../../../../lib/formatters"
import { formatarTelefone, linkWhatsApp, mascaraCpf, rotuloCanal, ROTULO_DOCUMENTO, type TipoDocumento } from "../../../../lib/hospedes"
import type { Hospede } from "../../../../lib/types"

type Rascunho = Pick<Hospede, "nome" | "tipo_documento" | "documento" | "telefone" | "email" | "nacionalidade" | "data_nascimento" | "observacoes">

/** Ficha do hóspede: cadastro editável e todas as estadias na pousada. */
export default function FichaDoHospede() {
  const id = Number(useParams().id)
  const { auth } = useApp()
  const podeEditar = Boolean(auth.user?.is_owner) || auth.user?.role === "admin" || auth.user?.role === "recepcao"
  const { hospede, historico, naoEncontrado, carregar, salvar } = useHospede(id)
  const [r, setR] = useState<Rascunho | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { void carregar() }, [carregar, auth.pousada?.id])
  useEffect(() => {
    if (hospede) {
      setR({
        nome: hospede.nome, tipo_documento: hospede.tipo_documento,
        documento: hospede.tipo_documento === "cpf" ? mascaraCpf(hospede.documento) : hospede.documento,
        telefone: formatarTelefone(hospede.telefone), email: hospede.email, nacionalidade: hospede.nacionalidade,
        data_nascimento: hospede.data_nascimento, observacoes: hospede.observacoes,
      })
    }
  }, [hospede])

  if (naoEncontrado) return <p className="text-sm text-muted-foreground">Hóspede não encontrado nesta pousada.</p>
  if (!hospede || !r) return <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    const corpo: Record<string, unknown> = {
      nome: r!.nome, telefone: r!.telefone, email: r!.email, nacionalidade: r!.nacionalidade,
      data_nascimento: r!.data_nascimento || null, observacoes_hospede: r!.observacoes,
    }
    // Documento só vai se mudou (o que veio pode estar mascarado para quem não vê completo).
    const original = hospede!.tipo_documento === "cpf" ? mascaraCpf(hospede!.documento) : hospede!.documento
    if (r!.documento !== original || r!.tipo_documento !== hospede!.tipo_documento) {
      corpo.tipo_documento = r!.tipo_documento
      corpo.documento = r!.documento || null
    }
    const res = await salvar(corpo as Partial<Hospede>)
    setSalvando(false)
    auth.setMessage({ type: res.sucesso ? "success" : "error", text: res.mensagem })
  }

  const campo = (k: keyof Rascunho) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setR((x) => x && ({ ...x, [k]: e.target.value }))
  const zap = linkWhatsApp(hospede.telefone, `Olá, ${hospede.nome.split(" ")[0]}! Aqui é da ${auth.pousada?.nome ?? "pousada"}.`)
  const estadias = historico.filter((h) => h.status !== "cancelada" && h.status !== "no_show")
  const total = estadias.reduce((s, h) => s + Number(h.valor || 0), 0)

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <Link href="/hospedes" className="text-xs text-muted-foreground hover:underline">← Hóspedes</Link>
          <h1 className="text-2xl font-semibold tracking-tight">{hospede.nome}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {estadias.length} estadia{estadias.length === 1 ? "" : "s"} · {formatarValor(total)}
          </p>
        </div>
        <div className="flex gap-2">
          {zap && <a href={zap} target="_blank" rel="noreferrer"><Button variant="outline">WhatsApp</Button></a>}
          {podeEditar && !hospede.anonimizado && <Link href={`/reservas/nova?hospede=${hospede.id}`}><Button>Nova reserva</Button></Link>}
        </div>
      </div>

      {hospede.anonimizado && (
        <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Dados pessoais anonimizados pela política de retenção da pousada.
        </p>
      )}

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Cadastro</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={enviar} className="space-y-4">
            <fieldset disabled={!podeEditar || hospede.anonimizado} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="h-nome" className="text-xs">Nome</Label>
                  <Input id="h-nome" value={r.nome} onChange={campo("nome")} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="h-tel" className="text-xs">WhatsApp</Label>
                  <Input id="h-tel" type="tel" value={r.telefone} onChange={campo("telefone")} />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-[10rem_1fr_1fr]">
                <div className="space-y-2">
                  <Label htmlFor="h-tipo" className="text-xs">Documento</Label>
                  <Select id="h-tipo" value={r.tipo_documento} onChange={(e) => setR((x) => x && ({ ...x, tipo_documento: e.target.value as TipoDocumento, documento: "" }))}>
                    {(Object.keys(ROTULO_DOCUMENTO) as TipoDocumento[]).map((t) => <option key={t} value={t}>{ROTULO_DOCUMENTO[t]}</option>)}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="h-doc" className="text-xs">Número</Label>
                  <Input
                    id="h-doc"
                    value={r.documento}
                    onChange={(e) => setR((x) => x && ({ ...x, documento: x.tipo_documento === "cpf" ? mascaraCpf(e.target.value) : e.target.value.toUpperCase().replace(/[^0-9A-Z•*.-]/g, "") }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="h-email" className="text-xs">E-mail</Label>
                  <Input id="h-email" type="email" value={r.email} onChange={campo("email")} />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="h-nac" className="text-xs">Nacionalidade</Label>
                  <Input id="h-nac" value={r.nacionalidade} onChange={campo("nacionalidade")} placeholder="Brasileira" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="h-nasc" className="text-xs">Nascimento</Label>
                  <Input id="h-nasc" type="date" value={r.data_nascimento} onChange={campo("data_nascimento")} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="h-obs" className="text-xs">Observações (preferências, alergias...)</Label>
                <Textarea id="h-obs" rows={3} value={r.observacoes} onChange={campo("observacoes")} />
              </div>
            </fieldset>
            {podeEditar && !hospede.anonimizado && (
              <Button type="submit" disabled={salvando}>{salvando ? "Salvando..." : "Salvar cadastro"}</Button>
            )}
          </form>
        </CardContent>
      </Card>

      <Card className="p-0 overflow-hidden">
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Estadias</CardTitle></CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Entrada</TableHead>
                <TableHead>Saída</TableHead>
                <TableHead>Quarto</TableHead>
                <TableHead>Pessoas</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historico.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">Nenhuma estadia.</TableCell></TableRow>
              ) : historico.map((h) => (
                <TableRow key={h.id}>
                  <TableCell><Link href={`/reservas/${h.id}`} className="hover:underline">{formatarData(h.data_entrada)}</Link></TableCell>
                  <TableCell>{formatarData(h.data_saida)}</TableCell>
                  <TableCell>{h.quarto}</TableCell>
                  <TableCell>{h.adultos + h.criancas}</TableCell>
                  <TableCell>{rotuloCanal(h.canal)}</TableCell>
                  <TableCell><Badge variant={getStatusBadgeVariant(h.status)}>{getStatusLabel(h.status)}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{h.valor ? formatarValor(Number(h.valor)) : "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  )
}
