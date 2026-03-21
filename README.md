# Minha Pousada

Multi-tenant SaaS for managing room reservations in Brazilian inns (pousadas). Each owner registers, creates their pousada, invites staff by email, and manages rooms, reservations, and guests from a single platform.

**Production:** https://minhapousada.pgdev.com.br | **API:** https://api-pousada.pgdev.com.br

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js 20, Express.js, TypeScript, Drizzle ORM |
| Database | PostgreSQL 16 |
| Frontend | Next.js 14, React 18, Tailwind CSS, shadcn/ui, GSAP |
| Auth | Better Auth (HTTPOnly cookie sessions, Google OAuth) |
| Email | Resend (transactional emails with HTML templates) |
| Infrastructure | Docker multi-stage, Traefik v3 (HTTPS via Let's Encrypt) |

## Features

### Multi-Tenant Architecture
- Users can belong to multiple pousadas via a junction table (`user_pousadas`)
- Active pousada switcher in the header with instant context switch
- Every data query is scoped to the active `pousadaId` -- zero cross-tenant data leakage
- Staff invite flow: owner sends email invite, recipient creates account and joins

### Reservation Management
- Full CRUD with CPF validation (modulo 11 algorithm), room conflict detection, and input sanitization
- Soft delete (sets `deleted_at` instead of removing rows)
- Optimistic locking via `version` column -- concurrent edits return HTTP 409 instead of silently overwriting
- Idempotency guard prevents duplicate reservations from double-clicks (same CPF + room + dates within 30s)
- CSV export with applied filters (capped at 5000 rows)
- Audit trail for every create, update, status change, and delete operation

### Authentication and Authorization
- Email/password signup with email verification
- Google OAuth with automatic onboarding redirect for new users
- Password reset via email link
- Session management with HTTPOnly secure cookies, 24h expiry, automatic cleanup every 6h
- RBAC with 4 roles:

| Role | Reservations | Pousada Config | Delete | Manage Users |
|---|---|---|---|---|
| owner | Full | Full | Yes | Yes |
| admin | CRUD | Config | Yes | Yes |
| recepcao | CRUD | Read | No | No |
| auditoria | Read | Read | No | No |

### Data Protection (LGPD)
- CPF values are encrypted at rest using AES-256-GCM (application-layer encryption)
- A SHA-256 hash (`cpf_hash`) enables exact-match CPF search without exposing plaintext
- Decryption is transparent -- API responses always return the plaintext CPF to authorized users
- Graceful degradation: if the encryption key is not configured, CPFs are stored as-is

### Security
- Rate limiting: 300 requests/15min per IP (global) + 100 requests/min (Better Auth)
- Input validation and sanitization on all write endpoints (`sanitizarReserva`, `sanitizarPousada`, `sanitizarNome`, `sanitizarString`)
- Security headers: HSTS, X-Frame-Options DENY, CSP, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy
- Production error responses never expose stack traces or internal details
- All database queries use Drizzle ORM parameterized statements (no raw SQL with user input)

### Frontend Resilience
- React Error Boundary wrapping the entire app -- crashes show a friendly recovery screen
- Network error detection with user-facing banner and retry button
- Typed `NetworkError` class distinguishes server-down from application errors

## Project Structure

```
backend/
  server.ts              Express app, middleware stack, route mounting
  db/
    schema.ts            Drizzle ORM schema (8 tables, relations, types)
    index.ts             PostgreSQL pool + Drizzle instance
  lib/
    auth.ts              Better Auth config (sessions, OAuth, RBAC, email hooks)
    email.ts             Resend email service (3 HTML templates)
  middleware/
    auth.ts              authMiddleware, requirePousada, requireOwner, authorize()
    activity.ts          Structured JSON request logging
    errorHandler.ts      AppError class + global error handler
  routes/
    reservas.ts          /api/reservas -- CRUD, export, audit, availability
    pousadas.ts          /api/pousadas -- management, dashboard, users, invites
    convites.ts          /api/convites -- public invite validation, accept
  models/
    Reserva.ts           Reservation queries (tenant-isolated, encrypted CPF, optimistic locking)
    Pousada.ts           Pousada queries + SQL-optimized statistics
    Auditoria.ts         Audit trail (jsonb details, tenant-filtered)
    StaffInvite.ts       Staff invitation lifecycle
    Usuario.ts           User profile operations
  utils/
    validation.ts        CPF, dates, phone, CEP, sanitization
    crypto.ts            AES-256-GCM encryption, SHA-256 hashing for CPF
  migrations/            SQL migration files (001-007)
  scripts/
    encrypt-existing-cpfs.ts   One-time migration script for legacy plaintext CPFs

frontend/
  app/
    page.tsx             Main SPA (landing page + authenticated dashboard)
    layout.tsx           Root layout with ErrorBoundary
    onboarding/          New user pousada setup
    auth/callback/       OAuth callback handler
    convite/[token]/     Staff invite acceptance page
    forgot-password/     Password reset request
    reset-password/      Password reset form
    verify-email/        Email verification confirmation
  components/
    auth/AuthCard.tsx              Login/signup card with Google OAuth
    dashboard/DashboardHeader.tsx  Navigation + pousada switcher
    dashboard/StatsGrid.tsx        Occupancy, revenue, check-in stats
    reservations/ReservationForm.tsx    Create/edit reservation form
    reservations/ReservationTable.tsx   Reservation list + upcoming reservations
    reservations/ReservationFilters.tsx  Search, status, date, payment filters
    error-boundary.tsx             React Error Boundary
    confirm-dialog.tsx             Confirmation modal
    pagination.tsx                 Page navigation
    ui/                            shadcn/ui primitives
  hooks/
    useAuth.ts           Authentication state, login/signup/logout, pousada switching
    useReservations.ts   Reservation CRUD, dashboard stats, filters, error state
    useStaffInvites.ts   Staff invite management
  lib/
    api.ts               Authenticated fetch, NetworkError, typed API wrappers
    auth-client.ts       Better Auth React client
    types.ts             TypeScript interfaces
    formatters.ts        Date, currency, CPF formatting (pt-BR)
    utils.ts             Tailwind merge utility
```

## Database Schema

8 tables, 33 indexes, 7 migrations:

- **user** -- Better Auth user + custom fields (role, pousadaId, isOwner)
- **session** -- HTTPOnly cookie sessions
- **account** -- OAuth providers (Google)
- **verification** -- Email verification tokens
- **pousadas** -- Inn data (name, slug, rooms, address, config)
- **reservas** -- Reservations (guest, CPF encrypted, room, dates, value, status, version, soft delete)
- **user_pousadas** -- Junction table for multi-pousada membership (userId, pousadaId, role, isOwner)
- **staff_invites** -- Email invitations with token, expiry, and status lifecycle
- **auditoria** -- Audit trail (action, entity, jsonb details, IP, timestamp)

## API Endpoints

### Auth (Better Auth -- automatic)
```
POST   /api/auth/sign-up          Register
POST   /api/auth/sign-in          Login
POST   /api/auth/sign-out         Logout
GET    /api/auth/session          Current session
POST   /api/auth/forget-password  Request password reset
POST   /api/auth/reset-password   Reset password with token
```

### Reservations (requires auth + pousada)
```
GET    /api/reservas                    List (paginated, filterable, capped at 200/page)
GET    /api/reservas/export             CSV export (capped at 5000)
GET    /api/reservas/:id                Get by ID
GET    /api/reservas/:id/auditoria      Audit history
GET    /api/reservas/disponibilidade/:q Room availability check
POST   /api/reservas                    Create (with idempotency guard)
PUT    /api/reservas/:id                Update (with optimistic locking)
PATCH  /api/reservas/:id/status         Change status (with optimistic locking)
DELETE /api/reservas/:id                Soft delete (admin only)
```

### Pousadas (requires auth)
```
POST   /api/pousadas                    Create new pousada
GET    /api/pousadas/minha              Current active pousada
GET    /api/pousadas/minhas             All user's pousadas
POST   /api/pousadas/trocar             Switch active pousada
GET    /api/pousadas/:id                Details
PUT    /api/pousadas/:id                Update (owner/admin)
GET    /api/pousadas/:id/dashboard      Statistics
GET    /api/pousadas/:id/quartos        List rooms
GET    /api/pousadas/:id/usuarios       List staff
POST   /api/pousadas/:id/usuarios       Add staff
DELETE /api/pousadas/:id/usuarios/:uid  Remove staff
POST   /api/pousadas/:id/convites       Send staff invite
GET    /api/pousadas/:id/convites       List invites
DELETE /api/pousadas/:id/convites/:iid  Revoke invite
POST   /api/pousadas/:id/desativar      Deactivate
POST   /api/pousadas/:id/reativar       Reactivate
```

### Invites (public + auth)
```
GET    /api/convites/:token             Validate invite (public)
POST   /api/convites/:token/aceitar     Accept invite (requires auth)
```

### Health
```
GET    /                                API status
GET    /health                          Database connection check
```

## Environment Variables

```env
# Required
POSTGRES_USER=reservas
POSTGRES_PASSWORD=<strong password>
POSTGRES_DB=reservas_pousada
BETTER_AUTH_SECRET=<openssl rand -base64 32>
CPF_ENCRYPTION_KEY=<openssl rand -hex 32>

# Optional
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
RESEND_API_KEY=

# Auto-configured in docker-compose.yml:
# DATABASE_URL, BETTER_AUTH_URL, CORS_ORIGIN, NEXT_PUBLIC_API_URL
```

## Development

```bash
# Backend
cd backend
npm install
npm run dev          # Dev server with hot reload (tsx watch)

# Frontend
cd frontend
npm install
npm run dev          # Next.js dev server

# Database
cd backend
npm run db:generate  # Generate migration from schema changes
npm run db:migrate   # Run pending migrations
npm run db:push      # Push schema directly (dev only)
npm run db:studio    # Open Drizzle Studio GUI
npm run backup       # Manual database backup to JSON
```

## Production Deploy

```bash
cp .env.example .env
# Fill in all required values

docker compose up -d --build
docker compose logs -f
```

Traefik handles SSL certificates automatically. DNS A records must point to the server for both `minhapousada.pgdev.com.br` and `api-pousada.pgdev.com.br`.

## License

ISC
