"use client"

import { useEffect, useRef, useState } from "react"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Select } from "../ui/select"
import { buscarHospedes } from "../../hooks/useHospedes"
import { formatarTelefone, linkWhatsApp, mascaraCpf, ROTULO_DOCUMENTO, type TipoDocumento } from "../../lib/hospedes"
import type { Hospede, Reserva } from "../../lib/types"

interface Props {
  form: Reserva
  onChange: (mudanca: Partial<Reserva>) => void
  isEditing: boolean
}

/**
 * Hóspede da reserva. Ao digitar o nome, sugere quem já está na base (nome,
 * telefone ou documento); escolher reaproveita o cadastro em vez de criar
 * outro. Documento é opcional aqui — reserva fechada pelo WhatsApp nasce só
 * com o telefone — e passa a ser exigido no check-in.
 */
export function SecaoHospede({ form, onChange, isEditing }: Props) {
  const [sugestoes, setSugestoes] = useState<Hospede[]>([])
  const [aberto, setAberto] = useState(false)
  // Documento do cadastro escolhido (mascarado na busca): não volta para o campo.
  const [documentoCadastrado, setDocumentoCadastrado] = useState<string | null>(null)
  const caixa = useRef<HTMLDivElement>(null)
  const tipo = form.tipo_documento ?? "cpf"

  useEffect(() => {
    const termo = form.nome.trim()
    if (form.hospede_id || termo.length < 2) { setSugestoes([]); return }
    const t = setTimeout(() => {
      buscarHospedes(termo, 6).then((r) => setSugestoes(r.hospedes)).catch(() => setSugestoes([]))
    }, 250)
    return () => clearTimeout(t)
  }, [form.nome, form.hospede_id])

  useEffect(() => {
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener("mousedown", fora)
    return () => document.removeEventListener("mousedown", fora)
  }, [])

  function escolher(h: Hospede) {
    onChange({
      hospede_id: h.id, nome: h.nome, telefone: formatarTelefone(h.telefone), email: h.email,
      nacionalidade: h.nacionalidade, tipo_documento: h.tipo_documento, documento: "",
    })
    setDocumentoCadastrado(h.documento || null)
    setAberto(false)
  }

  function trocar() {
    onChange({ hospede_id: null, nome: "", telefone: "", email: "", nacionalidade: "", documento: "", tipo_documento: "cpf" })
    setDocumentoCadastrado(null)
  }

  const whatsapp = linkWhatsApp(form.telefone)

  return (
    <fieldset className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <legend className="text-sm font-semibold">Hóspede</legend>
        {form.hospede_id ? (
          <span className="text-xs text-muted-foreground">
            {isEditing ? "Alterações valem para o cadastro do hóspede." : "Hóspede já cadastrado."}{" "}
            <button type="button" onClick={trocar} className="underline hover:text-foreground">Trocar hóspede</button>
          </span>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 relative" ref={caixa}>
          <Label htmlFor="nome" className="text-xs">Nome *</Label>
          <Input
            id="nome"
            value={form.nome}
            autoComplete="off"
            onFocus={() => setAberto(true)}
            onChange={(e) => {
              onChange({ nome: e.target.value.replace(/[^\p{L}\p{M}\s'.-]/gu, "").slice(0, 100) })
              setAberto(true)
            }}
            placeholder="Digite para buscar na base de hóspedes"
            required
          />
          {aberto && sugestoes.length > 0 && (
            <ul role="listbox" className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-white shadow-lg">
              {sugestoes.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => escolher(h)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/60"
                  >
                    <span className="truncate font-medium">{h.nome}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {[formatarTelefone(h.telefone), h.documento, h.estadias ? `${h.estadias} estadia${h.estadias > 1 ? "s" : ""}` : null]
                        .filter(Boolean).join(" · ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="telefone" className="text-xs">
            WhatsApp {whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer" className="ml-1 text-emerald-700 underline">abrir conversa</a>}
          </Label>
          <Input
            id="telefone"
            type="tel"
            inputMode="tel"
            value={form.telefone ?? ""}
            onChange={(e) => onChange({ telefone: e.target.value.replace(/[^\d+()\s-]/g, "").slice(0, 20) })}
            placeholder="(48) 99999-0000 ou +54 9 11 5555-0000"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[10rem_1fr_1fr]">
        <div className="space-y-2">
          <Label htmlFor="tipo_documento" className="text-xs">Documento</Label>
          <Select
            id="tipo_documento"
            value={tipo}
            onChange={(e) => onChange({ tipo_documento: e.target.value as TipoDocumento, documento: "" })}
          >
            {(Object.keys(ROTULO_DOCUMENTO) as TipoDocumento[]).map((t) => (
              <option key={t} value={t}>{ROTULO_DOCUMENTO[t]}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="documento" className="text-xs">Número {tipo === "cpf" ? "do CPF" : "do documento"}</Label>
          <Input
            id="documento"
            value={form.documento ?? ""}
            onChange={(e) => onChange({
              documento: tipo === "cpf" ? mascaraCpf(e.target.value) : e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 20),
            })}
            placeholder={documentoCadastrado ? `Cadastrado: ${documentoCadastrado}` : tipo === "cpf" ? "000.000.000-00" : "Ex.: AB123456"}
          />
          <p className="text-xs text-muted-foreground">
            {documentoCadastrado && !form.documento
              ? "Já está no cadastro — preencha só para corrigir."
              : "Pode ficar para depois; é exigido no check-in."}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email" className="text-xs">E-mail</Label>
          <Input id="email" type="email" value={form.email ?? ""} onChange={(e) => onChange({ email: e.target.value.slice(0, 255) })} />
        </div>
      </div>

      {tipo !== "cpf" && (
        <div className="space-y-2 md:w-1/3">
          <Label htmlFor="nacionalidade" className="text-xs">Nacionalidade</Label>
          <Input id="nacionalidade" value={form.nacionalidade ?? ""} onChange={(e) => onChange({ nacionalidade: e.target.value.slice(0, 60) })} placeholder="Ex.: Argentina" />
        </div>
      )}
    </fieldset>
  )
}
