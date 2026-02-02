import { pgTable, serial, text, integer, boolean, timestamp, numeric, date, varchar, jsonb, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

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
  role: text('role').default('recepcao'),
  pousadaId: integer('pousada_id'),
  isOwner: boolean('is_owner').default(false),
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
  slug: text('slug').unique(),
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
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  slugIdx: index('idx_pousadas_slug').on(table.slug),
}));

export const reservas = pgTable('reservas', {
  id: serial('id').primaryKey(),
  pousadaId: integer('pousada_id').references(() => pousadas.id).notNull(),
  nome: text('nome').notNull(),
  cpf: text('cpf').notNull(),
  quarto: integer('quarto').notNull(),
  dataEntrada: date('data_entrada').notNull(),
  dataSaida: date('data_saida').notNull(),
  status: text('status').default('ativa'),
  valor: numeric('valor'),
  pago: boolean('pago').default(false),
  observacoes: text('observacoes'),
  criadoPor: text('criado_por').references(() => user.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  statusIdx: index('idx_reservas_status').on(table.status),
  pagoIdx: index('idx_reservas_pago').on(table.pago),
  datasIdx: index('idx_reservas_datas').on(table.dataEntrada, table.dataSaida),
  pousadaIdx: index('idx_reservas_pousada').on(table.pousadaId),
}));

export const auditoria = pgTable('auditoria', {
  id: serial('id').primaryKey(),
  userId: text('user_id').references(() => user.id),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: integer('entity_id'),
  details: text('details'), // JSON stringified
  ip: text('ip'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  userIdx: index('idx_auditoria_user').on(table.userId),
  entityIdx: index('idx_auditoria_entity').on(table.entity, table.entityId),
}));

// ==========================================
// Relations
// ==========================================

export const userRelations = relations(user, ({ one, many }) => ({
  pousada: one(pousadas, {
    fields: [user.pousadaId],
    references: [pousadas.id],
  }),
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

export const pousadasRelations = relations(pousadas, ({ many }) => ({
  usuarios: many(user),
  reservas: many(reservas),
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
