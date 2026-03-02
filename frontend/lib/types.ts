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
  ativa?: boolean
}

export interface Reserva {
  id?: number
  nome: string
  cpf: string
  quarto: number | string
  data_entrada: string
  data_saida: string
  status: "ativa" | "finalizada" | "cancelada"
  valor?: number | string | null
  pago: boolean
  observacoes?: string
  criado_por?: string // Better Auth user ID
  pousada_id?: number
}

export interface Auditoria {
  id: number
  action: string
  created_at: string
  user?: { nome?: string; email?: string } | null
  details?: {
    antes?: Partial<Reserva>
    depois?: Partial<Reserva>
  }
}

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
  cpf: "",
  quarto: 1,
  data_entrada: "",
  data_saida: "",
  status: "ativa",
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
