import type { StatusReserva } from "./status"
import type { TipoDocumento } from "./hospedes"

/**
 * Tipos compartilhados da aplicacao
 */

export interface Usuario {
  id: string // Better Auth uses string IDs
  nome: string
  username?: string
  email?: string
  role?: string
  pousada_id?: number | null
  is_owner?: boolean
  avatar_url?: string | null
  email_verified?: boolean
}

export interface StaffInvite {
  id: number
  email: string
  role: string
  status: 'pending' | 'accepted' | 'revoked' | 'expired'
  createdAt: string
  expiresAt: string
  inviterName?: string
}

export interface InviteInfo {
  pousadaNome: string
  role: string
  email: string
  expiresAt: string
}

export interface Pousada {
  id: number
  nome: string
  slug?: string
  num_quartos: number
  endereco?: string
  cidade?: string
  estado?: string
  cep?: string
  telefone?: string
  email?: string
  descricao?: string
  configuracoes?: {
    retencao_hospedes_meses?: number
    motor?: { ativo?: boolean; prazo_horas?: number; sinal_percentual?: number; politicas?: string }
    mensagens?: Partial<Record<"confirmacao" | "sinal" | "chegada" | "agradecimento", string>>
    whatsapp_lembrete?: boolean
  }
  ativa?: boolean
}

export interface Quarto {
  id: number
  numero: number
  nome: string
  tipo: string | null
  capacidade: number
  preco_base: number | null
  descricao: string | null
  ativo: boolean
  ordem: number
}

export interface MembroEquipe {
  id: string
  nome: string
  email: string
  role: string
  is_owner: boolean
}

export interface ItemAgenda {
  id: number
  nome: string
  quarto: number
  data_entrada: string
  data_saida: string
  valor: string | number | null
  pago: boolean
  status: string
  telefone?: string
  pago_centavos?: number
  consumos_centavos?: number
  precheckin_em?: string | null
}

export interface Agenda {
  dia: string
  chegadas: ItemAgenda[]
  saidas: ItemAgenda[]
  hospedados: ItemAgenda[]
  proximas: ItemAgenda[]
}

export interface UserPousada {
  id: number
  nome: string
  slug?: string
  numQuartos?: number
  cidade?: string
  estado?: string
  ativa?: boolean
  role: string
  isOwner: boolean
  joinedAt?: string
}

export interface Reserva {
  id?: number
  nome: string
  /** Legado: o documento agora é `documento` + `tipo_documento`. */
  cpf?: string
  hospede_id?: number | null
  tipo_documento?: TipoDocumento
  /** Completo para quem opera; mascarado para auditoria. */
  documento?: string
  telefone?: string
  email?: string
  nacionalidade?: string
  adultos?: number
  criancas?: number
  canal?: string
  /** Conta: o que já entrou e o que foi consumido além das diárias (centavos). */
  pago_centavos?: number
  consumos_centavos?: number
  /** Veio do calendário de uma OTA: datas e cancelamento seguem o que vier de lá. */
  ical_importacao_id?: number | null
  /** Quando o hóspede enviou a ficha de pré-check-in. */
  precheckin_em?: string | null
  quarto: number | string
  data_entrada: string
  data_saida: string
  status: StatusReserva
  valor?: number | string | null
  pago: boolean
  observacoes?: string
  criado_por?: string // Better Auth user ID
  criado_por_nome?: string
  pousada_id?: number
  version?: number
  /** Pré-reserva: até quando segura o quarto sem confirmação. */
  expira_em?: string | null
  check_in_em?: string | null
  check_out_em?: string | null
  cancelada_em?: string | null
  motivo_cancelamento?: string | null
  /** Só no formulário: prazo da pré-reserva e motivo do cancelamento enviados à API. */
  prazo_horas?: number
  motivo?: string
}

export interface Hospede {
  id: number
  nome: string
  tipo_documento: TipoDocumento
  documento: string
  nacionalidade: string
  telefone: string
  email: string
  data_nascimento: string
  observacoes: string
  anonimizado: boolean
  /** Só na listagem. */
  estadias?: number
  ultima_estadia?: string | null
  total_gasto?: number
}

export interface EstadiaDoHospede {
  id: number
  quarto: number
  data_entrada: string
  data_saida: string
  status: StatusReserva
  valor: string | number | null
  pago: boolean
  canal: string
  adultos: number
  criancas: number
}

export interface PagamentoDaConta {
  id: number
  valor_centavos: number
  forma: string
  tipo: "sinal" | "pagamento" | "estorno"
  recebido_em: string
  observacao: string
  criado_por_nome: string
}

export interface ConsumoDaConta {
  id: number
  descricao: string
  quantidade: number
  valor_unitario_centavos: number
  lancado_em: string
  criado_por_nome: string
}

export interface ContaDaReserva {
  diarias_centavos: number
  consumos_centavos: number
  total_centavos: number
  pago_centavos: number
  saldo_centavos: number
  pagamentos: PagamentoDaConta[]
  consumos: ConsumoDaConta[]
}

export interface Auditoria {
  id: number
  action: string
  created_at: string
  user?: { nome?: string; email?: string } | null
  details?: {
    antes?: Partial<Reserva>
    depois?: Partial<Reserva>
    /** Lançamentos da conta (centavos, como a API grava). */
    pagamento?: { valorCentavos?: number; valor_centavos?: number; forma?: string; tipo?: string }
    consumo?: { descricao?: string; quantidade?: number; valorUnitarioCentavos?: number; valor_unitario_centavos?: number }
  }
}

export type StatusAssinatura =
  | "trial" | "ativa" | "inadimplente" | "suspensa" | "cancelada" | "cortesia"

export interface SituacaoAssinatura {
  status: StatusAssinatura
  plano: string | null
  planoNome: string | null
  ciclo: "mensal" | "anual" | null
  /** Há assinatura no Stripe que ainda vale: troca de plano, não checkout novo. */
  assinaturaViva: boolean
  cancelaNoFim: boolean
  trialTerminaEm: string | null
  periodoTerminaEm: string | null
  liberado: boolean
  motivo: string
  diasRestantes: number | null
}

export interface LimitesPlano {
  maxQuartos: number
  maxUsuarios: number | null
  maxPousadas: number
}

export interface PlanoDisponivel {
  codigo: string
  nome: string
  precoCentavos: number
  maxQuartos: number
  maxUsuarios: number | null
  maxPousadas: number
  destaques: string[]
}

export type Ciclo = "mensal" | "anual"

export interface PaginationMeta {
  pagina: number
  paginas: number
  total: number
  limite: number
}

export interface FiltersState {
  status: string
  data_inicio: string
  data_fim: string
  pago: string
  search: string
}

export interface Message {
  type: "success" | "error"
  text: string
}

export type PageType = "dashboard" | "reservas" | "nova-reserva" | "configuracoes"

export const initialReservaForm: Reserva = {
  nome: "",
  tipo_documento: "cpf",
  documento: "",
  telefone: "",
  adultos: 1,
  criancas: 0,
  canal: "direto",
  quarto: 1,
  data_entrada: "",
  data_saida: "",
  status: "confirmada",
  valor: null,
  pago: false,
  observacoes: "",
}

export const initialFilters: FiltersState = {
  status: "",
  data_inicio: "",
  data_fim: "",
  pago: "",
  search: "",
}
