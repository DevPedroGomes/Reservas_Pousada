# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sistema de Gerenciamento de Reservas para Pousadas - Multi-tenant SaaS for managing room reservations in Brazilian inns. Each pousada owner registers, creates their pousada, and manages rooms, reservations, and staff from a single platform.

**Tech Stack:**
- Backend: Node.js + Express.js + TypeScript + Drizzle ORM + PostgreSQL 16
- Frontend: Next.js 14 + React + Tailwind CSS + shadcn/ui
- Authentication: Better Auth (sessions via HTTPOnly cookies, Google OAuth)
- Infrastructure: Docker multi-stage + Traefik v3 (HTTPS/Let's Encrypt)
- Security: Rate limiting, RBAC, input validation/sanitization, audit logging, CSP headers

**Production URLs:**
- Frontend: https://minhapousada.pgdev.com.br
- Backend API: https://api-pousada.pgdev.com.br

## Development Commands

```bash
# Backend
cd backend && npm install
npm run dev          # Dev server with auto-reload (tsx watch)
npm run build        # Compile TypeScript
npm start            # Production (node dist/server.js)
npm run backup       # Manual database backup to JSON

# Database (Drizzle)
npm run db:generate  # Generate migration from schema changes
npm run db:migrate   # Run pending migrations
npm run db:push      # Push schema directly (dev only)
npm run db:studio    # Open Drizzle Studio GUI

# Deploy
cd /opt/showcase/Reservas_Pousada
docker compose up -d --build
docker compose logs -f
```

## Environment Variables (backend/.env)

```env
NODE_ENV=development|production
PORT=4000
DATABASE_URL=postgresql://user:pass@localhost:5432/reservas_pousada
BETTER_AUTH_SECRET=<REQUIRED: 32+ random chars - server exits if missing>
BETTER_AUTH_URL=http://localhost:4000
GOOGLE_CLIENT_ID=<optional: Google OAuth>
GOOGLE_CLIENT_SECRET=<optional: Google OAuth>
CORS_ORIGIN=http://localhost:3000
```

## Architecture

### Backend Structure

```
backend/
├── server.ts              # Express app, middleware stack, routes
├── lib/
│   └── auth.ts            # Better Auth config (sessions, OAuth, RBAC)
├── db/
│   ├── schema.ts          # Drizzle ORM schema (all tables + relations)
│   └── index.ts           # PostgreSQL pool + Drizzle instance
├── middleware/
│   ├── auth.ts            # authMiddleware, requirePousada, requireOwner, authorize()
│   ├── activity.ts        # Request logging (persists all requests in production)
│   └── errorHandler.ts    # AppError class + global error handler
├── routes/
│   ├── reservas.ts        # /api/reservas CRUD + export CSV + audit history
│   └── pousadas.ts        # /api/pousadas management + dashboard + users
├── models/
│   ├── Reserva.ts         # Reservation queries (tenant-isolated)
│   ├── Pousada.ts         # Pousada queries + SQL-optimized statistics
│   ├── Usuario.ts         # User profile operations
│   └── Auditoria.ts       # Audit trail (jsonb details)
├── utils/
│   └── validation.ts      # CPF, dates, phone, CEP, sanitization
├── migrations/             # SQL migration files
├── backup.js              # PostgreSQL backup to JSON (pg pool)
├── Dockerfile             # Multi-stage, non-root user (nodejs:1001)
└── drizzle.config.ts      # ORM configuration
```

### Frontend Structure

```
frontend/
├── app/
│   ├── layout.tsx         # Root layout
│   └── auth/callback/     # OAuth callback
├── components/ui/         # shadcn/ui components
├── lib/
│   ├── api.ts             # Authenticated fetch (cookies, no manual tokens)
│   ├── types.ts           # TypeScript interfaces
│   ├── formatters.ts      # Date/currency formatting (pt-BR)
│   └── utils.ts           # Utility functions
└── Dockerfile             # Multi-stage Next.js standalone build
```

### Authentication Flow (Better Auth)

1. Client submits credentials or clicks Google OAuth
2. Better Auth validates and creates session in `session` table
3. HTTPOnly secure cookie set (no JWT in headers)
4. All `/api/*` routes protected by `authMiddleware` which calls `auth.api.getSession()`
5. User data (role, pousadaId, isOwner) fetched from DB and attached to `req.user`

### Multi-Tenant Isolation

Every data query includes `pousadaId` as a mandatory filter:
- `ReservaModel.buscarPorIdEPousada(id, pousadaId)` - never returns cross-tenant data
- `ReservaModel.listarTodas()` throws if `pousada_id` is missing
- Owner creates pousada during onboarding, staff is invited by owner

### RBAC Roles

| Role | Reservas | Pousada Config | Delete | Manage Users |
|---|---|---|---|---|
| **owner** | Full | Full | Yes | Yes |
| **admin** | CRUD | Config | Yes | Yes |
| **recepcao** | CRUD | Read | No | No |
| **auditoria** | Read | Read | No | No |

## Critical Security Rules

### Validation (utils/validation.ts)

**ALWAYS validate + sanitize before database writes:**
- `validarCPF()` - Full modulo 11 algorithm (both check digits)
- `validarReserva()` + `sanitizarReserva()` - Complete reservation validation
- `validarPousada()` + `sanitizarPousada()` - Pousada data validation
- `sanitizarString()` - Removes `< > " ' &`, limits to 255 chars
- `sanitizarNome()` - Only letters + spaces + accents, max 100 chars

### Database Queries

**NEVER construct raw SQL with user input.** Use Drizzle ORM:

```typescript
// CORRECT - Drizzle parameterized query
const result = await db.select().from(reservas).where(eq(reservas.id, id));

// WRONG - SQL injection vulnerable
const query = `SELECT * FROM reservas WHERE id = ${id}`;
```

### Error Messages

**Never expose internals in production responses:**
- `errorHandler.ts` returns "Erro interno do servidor" for 500s in production
- Stack traces only shown in development
- Audit details logged server-side only

## Database Schema (Drizzle - db/schema.ts)

### Tables
- **user** - Better Auth + custom fields (role, pousadaId, isOwner)
- **session** - Better Auth sessions (HTTPOnly cookies)
- **account** - OAuth providers (Google)
- **verification** - Email verification tokens
- **pousadas** - Inn data (nome, slug, numQuartos, endereco, etc.)
- **reservas** - Reservations (nome, cpf, quarto, datas, valor, status)
- **auditoria** - Audit trail (action, entity, jsonb details, IP)

### Key Indexes
- `idx_reservas_status`, `idx_reservas_pago`, `idx_reservas_datas`, `idx_reservas_pousada`
- `idx_auditoria_user`, `idx_auditoria_entity`
- `idx_pousadas_slug`

## API Endpoints

### Auth (Better Auth - automatic)
- `POST /api/auth/sign-up` - Register
- `POST /api/auth/sign-in` - Login
- `POST /api/auth/sign-out` - Logout
- `GET /api/auth/session` - Current session

### Reservas (requires auth + pousada)
- `GET /api/reservas` - List (paginated, filterable)
- `GET /api/reservas/export` - CSV export
- `GET /api/reservas/:id` - Get by ID
- `GET /api/reservas/:id/auditoria` - Audit history
- `GET /api/reservas/disponibilidade/:quarto` - Room availability
- `POST /api/reservas` - Create
- `PUT /api/reservas/:id` - Update
- `PATCH /api/reservas/:id/status` - Change status
- `DELETE /api/reservas/:id` - Delete (admin only)

### Pousadas (requires auth)
- `GET /api/pousadas/minha` - Current user's pousada
- `POST /api/pousadas` - Create (onboarding)
- `GET /api/pousadas/:id` - Details
- `PUT /api/pousadas/:id` - Update
- `GET /api/pousadas/:id/dashboard` - Statistics (SQL-optimized)
- `GET /api/pousadas/:id/quartos` - List rooms
- `GET/POST/DELETE /api/pousadas/:id/usuarios` - Manage staff

### Health
- `GET /` - API status
- `GET /health` - DB connection check
