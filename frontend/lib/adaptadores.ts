/**
 * Fronteira entre a API e as telas.
 *
 * A API devolve as colunas como o Drizzle as nomeia (camelCase: `dataEntrada`),
 * mas as telas foram escritas esperando snake_case (`data_entrada`). Sem esta
 * conversão, a tabela de reservas mostrava "-" nas datas, editar uma reserva
 * abria o formulário sem datas (e não salvava), e o histórico de auditoria
 * não tinha data nem autor.
 *
 * Aceita os dois formatos para não quebrar se um endpoint já vier em snake_case.
 */
import type { Agenda, Auditoria, ItemAgenda, MembroEquipe, Pousada, Reserva } from "./types"

type Bruto = Record<string, unknown>

const texto = (v: unknown): string => (v === null || v === undefined ? "" : String(v))

export function reservaDaApi(r: Bruto): Reserva {
  return {
    id: r.id as number | undefined,
    nome: texto(r.nome),
    cpf: texto(r.cpf),
    quarto: (r.quarto as number) ?? "",
    data_entrada: texto(r.data_entrada ?? r.dataEntrada),
    data_saida: texto(r.data_saida ?? r.dataSaida),
    status: (r.status as Reserva["status"]) ?? "ativa",
    valor: (r.valor as Reserva["valor"]) ?? null,
    pago: Boolean(r.pago),
    observacoes: texto(r.observacoes),
    criado_por: (r.criado_por ?? r.criadoPor) as string | undefined,
    criado_por_nome: (r.criado_por_nome ?? r.criadoPorNome) as string | undefined,
    pousada_id: (r.pousada_id ?? r.pousadaId) as number | undefined,
    version: r.version as number | undefined,
  }
}

export function auditoriaDaApi(a: Bruto): Auditoria {
  const nome = (a.userName ?? (a.user as Bruto | undefined)?.nome) as string | undefined
  const detalhes = (a.details ?? null) as { antes?: Bruto; depois?: Bruto } | null
  return {
    id: a.id as number,
    action: texto(a.action),
    created_at: texto(a.created_at ?? a.createdAt),
    user: nome ? { nome } : null,
    details: detalhes
      ? {
          antes: detalhes.antes ? reservaDaApi(detalhes.antes) : undefined,
          depois: detalhes.depois ? reservaDaApi(detalhes.depois) : undefined,
        }
      : undefined,
  }
}

export function pousadaDaApi(p: Bruto): Pousada {
  return {
    id: p.id as number,
    nome: texto(p.nome),
    slug: p.slug as string | undefined,
    // Era lido como `num_quartos` com a API mandando `numQuartos`: o
    // formulário oferecia sempre 25 quartos e a configuração mostrava vazio.
    num_quartos: Number(p.num_quartos ?? p.numQuartos) || 0,
    endereco: (p.endereco as string) ?? undefined,
    cidade: (p.cidade as string) ?? undefined,
    estado: (p.estado as string) ?? undefined,
    cep: (p.cep as string) ?? undefined,
    telefone: (p.telefone as string) ?? undefined,
    email: (p.email as string) ?? undefined,
    descricao: (p.descricao as string) ?? undefined,
    ativa: p.ativa as boolean | undefined,
  }
}

export function membroDaApi(m: Bruto): MembroEquipe {
  return {
    id: texto(m.id),
    nome: texto(m.name ?? m.nome),
    email: texto(m.email),
    role: texto(m.role),
    is_owner: Boolean(m.isOwner ?? m.is_owner),
  }
}

function itemAgenda(r: Bruto): ItemAgenda {
  const base = reservaDaApi(r)
  return {
    id: base.id as number,
    nome: base.nome,
    quarto: Number(base.quarto),
    data_entrada: base.data_entrada,
    data_saida: base.data_saida,
    valor: (base.valor as string | number | null) ?? null,
    pago: base.pago,
    status: base.status,
  }
}

export function agendaDaApi(a: Bruto): Agenda {
  const lista = (k: string) => ((a[k] as Bruto[] | undefined) ?? []).map(itemAgenda)
  return {
    dia: texto(a.dia),
    chegadas: lista("chegadas"),
    saidas: lista("saidas"),
    hospedados: lista("hospedados"),
    proximas: lista("proximas"),
  }
}
