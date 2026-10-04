import { pgTable, serial, text, integer, boolean, timestamp, numeric, date, smallint, varchar, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';

// ==========================================
// Better Auth Tables (required by better-auth)
// ==========================================

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  // Custom fields for our app
  role: text('role').notNull().default('recepcao'),
  pousadaId: integer('pousada_id'),
  isOwner: boolean('is_owner').default(false),
  // Primeira origem do visitante (utm_*, gclid, fbclid...). Migration 015.
  origem: jsonb('origem'),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ==========================================
// Application Tables
// ==========================================

export const pousadas = pgTable('pousadas', {
  id: serial('id').primaryKey(),
  nome: text('nome').notNull(),
  slug: text('slug').notNull().unique(),
  numQuartos: integer('num_quartos').notNull().default(10),
  endereco: text('endereco'),
  cidade: text('cidade'),
  estado: text('estado'),
  cep: text('cep'),
  telefone: text('telefone'),
  email: text('email'),
  logoUrl: text('logo_url'),
  descricao: text('descricao'),
  configuracoes: jsonb('configuracoes').default({}),
  ativa: boolean('ativa').default(true),
  // Exclusão a pedido do dono (migration 014): dados apagados, linha anonimizada.
  excluidaEm: timestamp('excluida_em', { withTimezone: true }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  slugIdx: index('idx_pousadas_slug').on(table.slug),
}));

// Fonte da verdade dos quartos (migration 016). `pousadas.num_quartos` é cache
// da quantidade de quartos ativos, mantido por trigger.
export const quartos = pgTable('quartos', {
  id: serial('id').primaryKey(),
  pousadaId: integer('pousada_id').references(() => pousadas.id, { onDelete: 'cascade' }).notNull(),
  numero: integer('numero').notNull(),
  nome: text('nome').notNull(),
  tipo: text('tipo'),
  capacidade: integer('capacidade').notNull().default(2),
  precoBaseCentavos: integer('preco_base_centavos'),
  descricao: text('descricao'),
  ativo: boolean('ativo').notNull().default(true),
  ordem: integer('ordem').notNull().default(0),
  // Link secreto do calendário exportado (migration 021).
  icalToken: text('ical_token').notNull().$defaultFn(() => randomBytes(32).toString('hex')),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  numeroIdx: uniqueIndex('uq_quarto_numero').on(table.pousadaId, table.numero),
}));

// Hóspede como cadastro (migration 018). Documento cifrado + hash de busca.
export const hospedes = pgTable('hospedes', {
  id: serial('id').primaryKey(),
  pousadaId: integer('pousada_id').references(() => pousadas.id).notNull(),
  nome: text('nome').notNull(),
  tipoDocumento: text('tipo_documento').notNull().default('cpf'),
  documento: text('documento'),
  documentoHash: text('documento_hash'),
  nacionalidade: text('nacionalidade'),
  telefone: text('telefone'),
  email: text('email'),
  dataNascimento: date('data_nascimento'),
  observacoes: text('observacoes'),
  anonimizadoEm: timestamp('anonimizado_em', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const reservas = pgTable('reservas', {
  id: serial('id').primaryKey(),
  pousadaId: integer('pousada_id').references(() => pousadas.id).notNull(),
  nome: text('nome').notNull(),
  // Legado: o documento mora em `hospedes` (migration 018).
  cpf: text('cpf'),
  cpfHash: text('cpf_hash'),
  hospedeId: integer('hospede_id').references(() => hospedes.id),
  adultos: integer('adultos').notNull().default(1),
  criancas: integer('criancas').notNull().default(0),
  canal: text('canal').notNull().default('direto'),
  // Reserva que veio do calendário de uma OTA (migration 021).
  icalImportacaoId: integer('ical_importacao_id'),
  icalUid: text('ical_uid'),
  // Lembrete de chegada pelo WhatsApp (migration 023).
  lembreteEnviadoEm: timestamp('lembrete_enviado_em', { withTimezone: true }),
  // Link secreto do pré-check-in (migration 024).
  precheckinToken: text('precheckin_token'),
  quarto: integer('quarto').notNull(),
  dataEntrada: date('data_entrada').notNull(),
  dataSaida: date('data_saida').notNull(),
  status: text('status').notNull().default('confirmada'),
  valor: numeric('valor'),
  pago: boolean('pago').default(false),
  observacoes: text('observacoes'),
  criadoPor: text('criado_por').references(() => user.id),
  version: integer('version').notNull().default(1),
  // Ciclo de status (migration 017).
  expiraEm: timestamp('expira_em', { withTimezone: true }),
  checkInEm: timestamp('check_in_em', { withTimezone: true }),
  checkOutEm: timestamp('check_out_em', { withTimezone: true }),
  canceladaEm: timestamp('cancelada_em', { withTimezone: true }),
  motivoCancelamento: text('motivo_cancelamento'),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  statusIdx: index('idx_reservas_status').on(table.status),
  pagoIdx: index('idx_reservas_pago').on(table.pago),
  datasIdx: index('idx_reservas_datas').on(table.dataEntrada, table.dataSaida),
  pousadaIdx: index('idx_reservas_pousada').on(table.pousadaId),
}));

// Tarifário (migration 020): ajustes sobre o preço base do quarto.
export const tarifas = pgTable('tarifas', {
  id: serial('id').primaryKey(),
  pousadaId: integer('pousada_id').references(() => pousadas.id, { onDelete: 'cascade' }).notNull(),
  nome: text('nome').notNull(),
  quartoNumero: integer('quarto_numero'),
  dataInicio: date('data_inicio'),
  dataFim: date('data_fim'),
  diasSemana: smallint('dias_semana').array(),
  precoCentavos: integer('preco_centavos'),
  ajustePercentual: integer('ajuste_percentual'),
  minimoNoites: integer('minimo_noites'),
  ativa: boolean('ativa').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Calendários externos importados por quarto (migration 021).
export const icalImportacoes = pgTable('ical_importacoes', {
  id: serial('id').primaryKey(),
  pousadaId: integer('pousada_id').references(() => pousadas.id, { onDelete: 'cascade' }).notNull(),
  quartoNumero: integer('quarto_numero').notNull(),
  nome: text('nome').notNull(),
  canal: text('canal').notNull().default('outro'),
  url: text('url').notNull(),
  ativo: boolean('ativo').notNull().default(true),
  ultimaSincronizacao: timestamp('ultima_sincronizacao', { withTimezone: true }),
  ultimoErro: text('ultimo_erro'),
  eventos: integer('eventos'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Conta da reserva (migration 019). Valores em centavos.
export const pagamentos = pgTable('pagamentos', {
  id: serial('id').primaryKey(),
  pousadaId: integer('pousada_id').references(() => pousadas.id).notNull(),
  reservaId: integer('reserva_id').references(() => reservas.id, { onDelete: 'cascade' }).notNull(),
  valorCentavos: integer('valor_centavos').notNull(),
  forma: text('forma').notNull(),
  tipo: text('tipo').notNull().default('pagamento'),
  recebidoEm: date('recebido_em').notNull(),
  observacao: text('observacao'),
  criadoPor: text('criado_por').references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const consumos = pgTable('consumos', {
  id: serial('id').primaryKey(),
  pousadaId: integer('pousada_id').references(() => pousadas.id).notNull(),
  reservaId: integer('reserva_id').references(() => reservas.id, { onDelete: 'cascade' }).notNull(),
  descricao: text('descricao').notNull(),
  quantidade: integer('quantidade').notNull().default(1),
  valorUnitarioCentavos: integer('valor_unitario_centavos').notNull(),
  lancadoEm: date('lancado_em').notNull(),
  criadoPor: text('criado_por').references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const auditoria = pgTable('auditoria', {
  id: serial('id').primaryKey(),
  userId: text('user_id').references(() => user.id),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: integer('entity_id'),
  details: jsonb('details'),
  ip: text('ip'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  userIdx: index('idx_auditoria_user').on(table.userId),
  entityIdx: index('idx_auditoria_entity').on(table.entity, table.entityId),
}));

export const userPousadas = pgTable('user_pousadas', {
  id: serial('id').primaryKey(),
  userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }).notNull(),
  pousadaId: integer('pousada_id').references(() => pousadas.id, { onDelete: 'cascade' }).notNull(),
  role: text('role').notNull().default('recepcao'),
  isOwner: boolean('is_owner').default(false),
  joinedAt: timestamp('joined_at').defaultNow(),
}, (table) => ({
  userPousadaIdx: uniqueIndex('idx_user_pousadas_user_pousada').on(table.userId, table.pousadaId),
  userIdx: index('idx_user_pousadas_user').on(table.userId),
}));

export const assinaturas = pgTable('assinaturas', {
  id: serial('id').primaryKey(),
  pousadaId: integer('pousada_id').references(() => pousadas.id, { onDelete: 'cascade' }).notNull().unique(),
  status: text('status').notNull().default('trial'),
  plano: text('plano'),
  ciclo: text('ciclo'),
  trialTerminaEm: timestamp('trial_termina_em', { withTimezone: true }),
  periodoTerminaEm: timestamp('periodo_termina_em', { withTimezone: true }),
  cancelaNoFim: boolean('cancela_no_fim').notNull().default(false),
  stripeCustomerId: text('stripe_customer_id').unique(),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  // Pousada extra coberta pela assinatura de outra (plano Rede). Ver migration 012.
  cobertaPorPousadaId: integer('coberta_por_pousada_id').references(() => pousadas.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  statusIdx: index('idx_assinaturas_status').on(table.status),
  customerIdx: index('idx_assinaturas_customer').on(table.stripeCustomerId),
}));

export const financeiroLancamentos = pgTable('financeiro_lancamentos', {
  id: serial('id').primaryKey(),
  pousadaId: integer('pousada_id').references(() => pousadas.id, { onDelete: 'cascade' }).notNull(),
  competencia: text('competencia').notNull(),
  categoria: text('categoria').notNull(),
  valorCentavos: integer('valor_centavos').notNull(),
  moeda: text('moeda').notNull().default('brl'),
  estimado: boolean('estimado').notNull().default(false),
  descricao: text('descricao'),
  referenciaExterna: text('referencia_externa'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pousadaCompetenciaIdx: index('idx_financeiro_pousada_competencia').on(table.pousadaId, table.competencia),
  competenciaIdx: index('idx_financeiro_competencia').on(table.competencia, table.categoria),
}));

// Idempotencia de webhook: o id do evento do Stripe e a chave primaria, entao
// um reenvio do mesmo evento colide no insert e o handler pula o reprocessamento.
export const stripeEvents = pgTable('stripe_events', {
  id: text('id').primaryKey(),
  tipo: text('tipo').notNull(),
  processadoEm: timestamp('processado_em', { withTimezone: true }).notNull().defaultNow(),
});

export const staffInvites = pgTable('staff_invites', {
  id: serial('id').primaryKey(),
  pousadaId: integer('pousada_id').references(() => pousadas.id).notNull(),
  email: text('email').notNull(),
  role: text('role').notNull().default('recepcao'),
  token: text('token').notNull().unique(),
  status: text('status').notNull().default('pending'),
  invitedBy: text('invited_by').references(() => user.id).notNull(),
  acceptedBy: text('accepted_by').references(() => user.id),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  tokenIdx: index('idx_staff_invites_token').on(table.token),
  pousadaIdx: index('idx_staff_invites_pousada').on(table.pousadaId),
  emailIdx: index('idx_staff_invites_email').on(table.email),
}));

// ==========================================
// Relations
// ==========================================

export const userRelations = relations(user, ({ one, many }) => ({
  pousada: one(pousadas, {
    fields: [user.pousadaId],
    references: [pousadas.id],
  }),
  pousadas: many(userPousadas),
  sessions: many(session),
  accounts: many(account),
  reservasCriadas: many(reservas),
  auditorias: many(auditoria),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const userPousadasRelations = relations(userPousadas, ({ one }) => ({
  user: one(user, {
    fields: [userPousadas.userId],
    references: [user.id],
  }),
  pousada: one(pousadas, {
    fields: [userPousadas.pousadaId],
    references: [pousadas.id],
  }),
}));

export const pousadasRelations = relations(pousadas, ({ many }) => ({
  usuarios: many(user),
  membros: many(userPousadas),
  reservas: many(reservas),
  staffInvites: many(staffInvites),
}));

export const reservasRelations = relations(reservas, ({ one }) => ({
  pousada: one(pousadas, {
    fields: [reservas.pousadaId],
    references: [pousadas.id],
  }),
  criadoPorUser: one(user, {
    fields: [reservas.criadoPor],
    references: [user.id],
  }),
}));

export const auditoriaRelations = relations(auditoria, ({ one }) => ({
  user: one(user, {
    fields: [auditoria.userId],
    references: [user.id],
  }),
}));

export const staffInvitesRelations = relations(staffInvites, ({ one }) => ({
  pousada: one(pousadas, {
    fields: [staffInvites.pousadaId],
    references: [pousadas.id],
  }),
  inviter: one(user, {
    fields: [staffInvites.invitedBy],
    references: [user.id],
  }),
}));

// ==========================================
// Types
// ==========================================

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
export type Pousada = typeof pousadas.$inferSelect;
export type NewPousada = typeof pousadas.$inferInsert;
export type Reserva = typeof reservas.$inferSelect;
export type NewReserva = typeof reservas.$inferInsert;
export type Auditoria = typeof auditoria.$inferSelect;
export type NewAuditoria = typeof auditoria.$inferInsert;
export type UserPousada = typeof userPousadas.$inferSelect;
export type NewUserPousada = typeof userPousadas.$inferInsert;
export type StaffInvite = typeof staffInvites.$inferSelect;
export type Quarto = typeof quartos.$inferSelect;
export type Hospede = typeof hospedes.$inferSelect;
export type Pagamento = typeof pagamentos.$inferSelect;
export type Tarifa = typeof tarifas.$inferSelect;
export type Consumo = typeof consumos.$inferSelect;
export type NewHospede = typeof hospedes.$inferInsert;
export type Assinatura = typeof assinaturas.$inferSelect;
export type FinanceiroLancamento = typeof financeiroLancamentos.$inferSelect;
export type NewAssinatura = typeof assinaturas.$inferInsert;
export type NewStaffInvite = typeof staffInvites.$inferInsert;
