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
import type { Agenda, Auditoria, ContaDaReserva, EstadiaDoHospede, Hospede, ItemAgenda, MembroEquipe, Pousada, Reserva } from "./types"
import type { TipoDocumento } from "./hospedes"

type Bruto = Record<string, unknown>

const texto = (v: unknown): string => (v === null || v === undefined ? "" : String(v))

/** A API guarda o telefone com DDI, só dígitos; aqui ganha o "+" para não confundir DDI com DDD. */
const telefoneDaApi = (v: unknown): string => {
  const t = texto(v)
  return t && !t.startsWith("+") ? `+${t}` : t
}

export function reservaDaApi(r: Bruto): Reserva {
  return {
    id: r.id as number | undefined,
    nome: texto(r.nome),
    cpf: texto(r.cpf),
    hospede_id: (r.hospede_id ?? r.hospedeId ?? null) as number | null,
    tipo_documento: ((r.tipo_documento ?? r.tipoDocumento) as TipoDocumento | undefined) ?? "cpf",
    // Reserva antiga ou payload legado: só `cpf`.
    documento: texto(r.documento ?? r.cpf),
    telefone: telefoneDaApi(r.telefone),
    email: texto(r.email),
    nacionalidade: texto(r.nacionalidade),
    adultos: Number(r.adultos ?? 1),
    criancas: Number(r.criancas ?? 0),
    canal: texto(r.canal) || "direto",
    pago_centavos: Number(r.pago_centavos ?? r.pagoCentavos ?? 0),
    consumos_centavos: Number(r.consumos_centavos ?? r.consumosCentavos ?? 0),
    ical_importacao_id: (r.ical_importacao_id ?? r.icalImportacaoId ?? null) as number | null,
    precheckin_em: (r.precheckin_em ?? r.precheckinEm ?? null) as string | null,
    quarto: (r.quarto as number) ?? "",
    data_entrada: texto(r.data_entrada ?? r.dataEntrada),
    data_saida: texto(r.data_saida ?? r.dataSaida),
    status: (r.status as Reserva["status"]) ?? "confirmada",
    valor: (r.valor as Reserva["valor"]) ?? null,
    pago: Boolean(r.pago),
    observacoes: texto(r.observacoes),
    criado_por: (r.criado_por ?? r.criadoPor) as string | undefined,
    criado_por_nome: (r.criado_por_nome ?? r.criadoPorNome) as string | undefined,
    pousada_id: (r.pousada_id ?? r.pousadaId) as number | undefined,
    version: r.version as number | undefined,
    expira_em: (r.expira_em ?? r.expiraEm ?? null) as string | null,
    check_in_em: (r.check_in_em ?? r.checkInEm ?? null) as string | null,
    check_out_em: (r.check_out_em ?? r.checkOutEm ?? null) as string | null,
    cancelada_em: (r.cancelada_em ?? r.canceladaEm ?? null) as string | null,
    motivo_cancelamento: (r.motivo_cancelamento ?? r.motivoCancelamento ?? null) as string | null,
  }
}

export function auditoriaDaApi(a: Bruto): Auditoria {
  const nome = (a.userName ?? (a.user as Bruto | undefined)?.nome) as string | undefined
  const detalhes = (a.details ?? null) as { antes?: Bruto; depois?: Bruto; pagamento?: Bruto; consumo?: Bruto } | null
  return {
    id: a.id as number,
    action: texto(a.action),
    created_at: texto(a.created_at ?? a.createdAt),
    user: nome ? { nome } : null,
    details: detalhes
      ? {
          antes: detalhes.antes ? reservaDaApi(detalhes.antes) : undefined,
          depois: detalhes.depois ? reservaDaApi(detalhes.depois) : undefined,
          pagamento: detalhes.pagamento as NonNullable<Auditoria["details"]>["pagamento"],
          consumo: detalhes.consumo as NonNullable<Auditoria["details"]>["consumo"],
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
    configuracoes: (p.configuracoes as Pousada["configuracoes"]) ?? {},
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
    telefone: base.telefone,
    pago_centavos: base.pago_centavos,
    consumos_centavos: base.consumos_centavos,
    precheckin_em: base.precheckin_em,
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

export function hospedeDaApi(h: Bruto): Hospede {
  return {
    id: h.id as number,
    nome: texto(h.nome),
    tipo_documento: ((h.tipo_documento ?? h.tipoDocumento) as TipoDocumento | undefined) ?? "cpf",
    documento: texto(h.documento),
    nacionalidade: texto(h.nacionalidade),
    telefone: telefoneDaApi(h.telefone),
    email: texto(h.email),
    data_nascimento: texto(h.data_nascimento ?? h.dataNascimento),
    observacoes: texto(h.observacoes),
    anonimizado: Boolean(h.anonimizado),
    estadias: h.estadias as number | undefined,
    ultima_estadia: (h.ultima_estadia ?? h.ultimaEstadia ?? null) as string | null,
    total_gasto: (h.total_gasto ?? h.totalGasto) as number | undefined,
  }
}

export function estadiaDaApi(e: Bruto): EstadiaDoHospede {
  return {
    id: e.id as number,
    quarto: e.quarto as number,
    data_entrada: texto(e.data_entrada ?? e.dataEntrada),
    data_saida: texto(e.data_saida ?? e.dataSaida),
    status: e.status as EstadiaDoHospede["status"],
    valor: (e.valor as EstadiaDoHospede["valor"]) ?? null,
    pago: Boolean(e.pago),
    canal: texto(e.canal),
    adultos: Number(e.adultos ?? 1),
    criancas: Number(e.criancas ?? 0),
  }
}

export function contaDaApi(c: Bruto): ContaDaReserva {
  const n = (v: unknown) => Number(v ?? 0)
  return {
    diarias_centavos: n(c.diariasCentavos),
    consumos_centavos: n(c.consumosCentavos),
    total_centavos: n(c.totalCentavos),
    pago_centavos: n(c.pagoCentavos),
    saldo_centavos: n(c.saldoCentavos),
    pagamentos: ((c.pagamentos as Bruto[]) ?? []).map((p) => ({
      id: p.id as number,
      valor_centavos: n(p.valorCentavos),
      forma: texto(p.forma),
      tipo: p.tipo as ContaDaReserva["pagamentos"][number]["tipo"],
      recebido_em: texto(p.recebidoEm),
      observacao: texto(p.observacao),
      criado_por_nome: texto(p.criadoPorNome),
    })),
    consumos: ((c.consumos as Bruto[]) ?? []).map((x) => ({
      id: x.id as number,
      descricao: texto(x.descricao),
      quantidade: n(x.quantidade),
      valor_unitario_centavos: n(x.valorUnitarioCentavos),
      lancado_em: texto(x.lancadoEm),
      criado_por_nome: texto(x.criadoPorNome),
    })),
  }
}
