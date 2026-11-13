# Diária

Multi-tenant SaaS for managing room reservations in Brazilian inns (pousadas). Owners register, create their pousada, invite staff by email, and manage rooms, reservations, and guests. All data is tenant-isolated through a junction table with role-based access control.

- Frontend: https://diaria.gomio.com.br
- API: https://api.diaria.gomio.com.br

| The door opens on scroll | The real occupancy map behind it | A day at the front desk |
|---|---|---|
| ![Painted door asking "Tem vaga?"](docs/imagens/porta.webp) | ![The occupancy map refusing a double booking](docs/imagens/mapa-recusa.webp) | ![Horizontal timeline of a day at the front desk](docs/imagens/dia-na-recepcao.webp) |

The landing page animates with native CSS scroll-driven animations only: no animation library and no scroll listeners. Browsers without support, and visitors who ask for reduced motion, get the same content as a static page.

## Features

- **Occupancy map**: rooms × days grid (half-day columns so same-day turnover sits side by side), click an empty slot to book.
- **Reservation lifecycle**: pre-reservation with a deadline (auto-cancelled by a job when it lapses) → confirmed → checked in → checked out, plus cancelled (with reason) and no-show. Transitions validated server-side; check-in requires the guest's document.
- **Guests as records**: CPF, passport or other document (encrypted + HMAC), WhatsApp with country code, e-mail, nationality, stay history; deduplicated by document (or name + phone).
- **Reservation account**: deposit, partial payments, refunds and extra consumption; balance always derived, `pago` kept in sync.
- **Rates**: season / weekday / per-room rules (fixed price or percentage) with minimum stay; the reservation form suggests the price night by night.
- **iCal sync** with Booking/Airbnb: per-room secret export feed (no guest data), imported OTA calendars every 30 min become reservations (so the DB overbooking guard covers them too); SSRF-guarded fetch. iCal is not a channel manager: each OTA re-reads the exported feed on its own schedule, typically a window of hours, so a room sold here can stay open on the OTA until then. Overbooking across channels is reduced, not eliminated.
- **Reports**: occupancy, ADR, RevPAR, revenue by channel (accrual), cash received by payment method, receivables.
- **CSV import** from Excel/Google Sheets with dry-run preview, per-row errors, idempotent re-import.
- **Public booking page** `/r/<slug>`: availability with tariff prices, request becomes a pre-reservation (channel `site`) with deadline; abuse limits (per-IP rate limit, honeypot, max open requests per phone).
- **Pix for the deposit**: BR Code "copia e cola" + QR built from the inn's own Pix key (manual "Recebi o Pix"), or automatic confirmation through the inn's own **Asaas** account (key stored encrypted, webhook registered via API, authenticated by header and re-checked against the Asaas API). Gateways sit behind `lib/gatewayPix.ts` (`GatewayPix`), so Pagar.me & co. plug in without touching the rest. Webhook URLs use `API_PUBLIC_URL` (falls back to `BETTER_AUTH_URL`).
- **Online pre-check-in (FNRH fields)**: this collects the fields of the national guest registration card for the inn; nothing is sent to the Ministry of Tourism (MTur), there is no such integration. Each reservation gets a secret link `/checkin/<token>`; the guest fills in their registration card and companions' before arriving. The card is stored AES-encrypted, completes the guest record (document → check-in allowed), shows "ficha ✓" in the agenda, can be viewed/printed by the front desk, closes on check-in/cancellation, and is deleted by the retention job when the inn has set a retention period. The page records when, and under which policy version, the guest authorized the submission.
- **WhatsApp**: ready messages (confirmation, deposit request, arrival instructions, thank-you) that open the inn's own WhatsApp via `wa.me` with the text filled in — editable per inn with `{variables}`, available on the reservation page and in the daily agenda (no API, no cost). A daily job sends the arrival reminder the day before (for inns that opt in) through the inn's own connected number, or through an optional platform number (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_MODELO_LEMBRETE`, `WHATSAPP_IDIOMA`), using the template `lembrete_chegada` with body variables `{{1}}` guest first name, `{{2}}` inn, `{{3}}` arrival date (dd/mm), `{{4}}` room; guests who replied "parar" are skipped.
- **WhatsApp Business per inn + virtual attendant**: each inn connects its own number from Settings via Meta's Embedded Signup (coexistence with the WhatsApp Business phone app supported). Token stored AES-encrypted; one signed webhook (`/api/webhooks/whatsapp`, `X-Hub-Signature-256` over the raw body) routes events by `phone_number_id` into a pg-boss queue; default utility templates are created on connect. Conversations page `/whatsapp` for the front desk (reply within the 24h window, hand back to the agent). Optional LLM attendant (`AGENTE_*`, Anthropic or any OpenAI-compatible API) with server-side tools (inn info, real availability and tariff prices, pre-reservation with Pix, the sender's own reservations, call a human); it never confirms payments, cancels or changes bookings. Human handoff by keyword, by tool, on media messages, on model failure or after the per-inn daily cap, with an e-mail to the inn; "parar"/"voltar" opt-out; staff replies (panel or phone echo) pause the agent for 12h; messages encrypted and purged after 90 days. Meta setup checklist in [`docs/whatsapp-meta.md`](docs/whatsapp-meta.md).
- Team roles (owner/admin, front desk, auditor), multi-property (Rede plan), Stripe billing, LGPD tooling (export, deletion, retention).

## Overview

Two Docker services behind Traefik v3, plus a database that is not part of this compose file:

- `backend` (Express 5 + TypeScript, port 4000) on `internal`, `proxy` and `databases`
- `frontend` (Next.js 15 standalone, port 3000) on `proxy`
- PostgreSQL 16 in `central-db`, a shared instance outside this repository, reached over the external `databases` network. Backups of that instance are not managed here either.

Traefik terminates TLS (Let's Encrypt), enforces security headers, applies a global rate-limit middleware, and strips the `Server` response header. The backend exits on startup if `BETTER_AUTH_SECRET` or `CPF_ENCRYPTION_KEY` is missing and, in production, if `BETTER_AUTH_URL` or `RESEND_API_KEY` is missing or `BILLING_ENABLED=true` has no `STRIPE_WEBHOOK_SECRET` (`lib/configProducao.ts`).

Multi-tenancy uses a `user_pousadas` junction table. A user can belong to multiple pousadas, each with an independent role and an `is_owner` flag. The active tenant is chosen **per browser tab**: the frontend sends `X-Pousada-Id` on every request and `authMiddleware` validates it against `user_pousadas` (role and owner flag come from that membership row). Without the header, `user.pousada_id` (the last pousada chosen) is used. Every domain query is scoped to the resolved tenant.

Background work (transactional e-mail with retries, session/rate-limit cleanup, automatic check-out of past stays, pre-reservation expiry, iCal sync, guest-data anonymization, ad conversions) runs on **pg-boss**, a job queue stored in the same Postgres (schema `pgboss`).

## Architecture

```mermaid
flowchart TD
    Client[Browser / Mobile client]
    Traefik[Traefik v3<br/>TLS + global ratelimit + strip-server-header]
    Frontend[Next.js 15<br/>standalone]
    Backend[Express 5 + TS<br/>:4000]
    Global[global limiter<br/>1500 req / 15 min per IP on /api/]
    AuthLimits[auth limiters<br/>sign-in + reset 10 / 15 min<br/>e-mail 5 / h, sign-up 5 / h]
    Origin[exigirOrigemConfiavel<br/>writes need an Origin from CORS_ORIGIN]
    BetterAuth[better-auth handler<br/>cookies + sessions]
    AuthMW[authMiddleware<br/>session + tenant membership]
    UserLimit[userLimiter<br/>2000 req / hour per user]
    ReqPousada[requirePousada<br/>active tenant required]
    Assinatura[requerAssinaturaAtiva<br/>subscription in good standing]
    Authorize[authorize roles]
    Routes[Route handler<br/>routes/*.ts]
    Sanitize[validation.ts<br/>sanitizar* + validar*]
    Models[models/*.ts<br/>Drizzle or pg with $n placeholders]
    PG[(PostgreSQL 16<br/>app tables + better-auth tables)]
    Audit[(auditoria table)]
    Queue[pg-boss queue<br/>e-mail job with retries]
    Resend[Resend API<br/>verification / reset / invite]

    Client -->|HTTPS| Traefik
    Traefik -->|diaria.gomio.com.br| Frontend
    Traefik -->|api.diaria.gomio.com.br| Backend
    Frontend -->|fetch credentials: include| Backend

    Backend --> Global
    Global -->|/api/auth/*| AuthLimits
    AuthLimits --> Origin
    Global -->|/api/reservas| Origin
    Origin -->|/api/auth/*| BetterAuth
    BetterAuth --> PG
    Origin -->|/api/reservas| AuthMW
    AuthMW --> UserLimit
    UserLimit --> ReqPousada
    ReqPousada --> Assinatura
    Assinatura --> Authorize
    Authorize --> Routes
    Routes --> Sanitize
    Sanitize --> Models
    Models --> PG
    Routes -.write op.-> Audit
    Routes -.invite / reset / verify.-> Queue
    Queue --> Resend
```

Reservation create flow (write path with all guards):

```mermaid
sequenceDiagram
    participant C as Client
    participant T as Traefik
    participant API as Express route
    participant A as authMiddleware
    participant Z as authorize(admin,recepcao)
    participant V as sanitizarReserva + validarReserva
    participant H as HospedeModel
    participant M as ReservaModel
    participant DB as Postgres

    C->>T: POST /api/reservas (cookie)
    T->>API: forward + global ratelimit
    API->>A: getSession() via better-auth
    A->>DB: select user + user_pousadas membership (role, is_owner)
    A->>Z: req.user attached
    Z->>V: role allowed
    V->>H: sanitized payload
    H->>DB: find or create the guest, document encrypted (AES-256-GCM) + keyed hash (HMAC-SHA-256)
    H->>M: guest id
    M->>DB: idempotency check (guest + room + dates, 30s)
    M->>DB: insert reserva (version=1, pousada_id scoped)
    Note over DB: EXCLUDE constraint rejects an overlapping stay (HTTP 409)
    M-->>API: created row
    API-)DB: insert auditoria (async, after the insert)
    API-->>C: 201 JSON response
```

CSV export flow (read path with PII protections):

```mermaid
sequenceDiagram
    participant C as Client
    participant API as Express
    participant Z as authorize(admin,recepcao,auditoria)
    participant L as exportLimiter (5/h per user)
    participant M as ReservaModel
    participant DB as Postgres

    C->>API: GET /api/reservas/export
    API->>Z: role check
    Z->>L: check 5/h budget
    L->>M: list (pousada-scoped, max 5000 rows)
    M->>DB: select, then decrypt documents
    M-->>API: rows
    Note over API: nome / observacoes / email / nacionalidade prefixed with '<br/>if first char in =,+,-,@,\t,\r<br/>(formula injection defense)
    Note over API: document masked unless admin or owner
    API->>DB: insert auditoria(action=export_reservas)
    API-->>C: text/csv (CRLF)
```

## Tech stack

Backend (`backend/package.json`):

- Node.js 22, Express 5 (async errors reach the error handler)
- TypeScript 5.9, ESM (`"type": "module"`)
- `better-auth` 1.7 with `drizzle-adapter`, mounted at `/api/auth/{*caminho}`
- `drizzle-orm` 0.45 + `drizzle-kit` 0.31, Postgres provider
- `pg` (connection pool, size/timeouts via env, `statement_timeout`)
- `pg-boss` 12 (job queue in Postgres)
- `express-rate-limit` 8 with a shared Postgres store (`utils/rateLimitStore.ts`)
- `stripe` 22 (billing), `resend` 6 (e-mail), `@sentry/node` 10 (optional)
- Build: `tsc` to `dist/`, dev: `tsx watch`. `app.ts` builds the Express app; `server.ts` boots it (migrations, queue, listen)

Frontend (`frontend/package.json`):

- Next.js 15.5 (App Router, standalone output, `poweredByHeader: false`), React 19
- Public pages: `/` (landing), `/cadastro`, `/entrar`, `/privacidade`, `/termos`, the booking page `/r/<slug>` and the pre-check-in `/checkin/<token>`, plus `sitemap.xml`, `robots.txt` and a generated Open Graph image
- Logged-in area under `app/(app)`: `/painel`, `/mapa`, `/reservas`, `/reservas/nova`, `/reservas/[id]` (with the account panel), `/reservas/importar`, `/hospedes`, `/hospedes/[id]`, `/quartos` (rooms, rates, iCal), `/relatorios`, `/whatsapp`, `/configuracoes` (shared session context, auth/onboarding guards, auto-refresh on focus and every 60s)
- Tailwind 3.4, shadcn/ui primitives, `better-auth` 1.7 client
- GA4 / Meta Pixel loaded only after cookie consent (revocable from the footer and the privacy page); first-touch UTM attribution sent on sign-up
- Ad conversions also sent server-side (Meta Conversions API): CompleteRegistration, StartTrial and Subscribe, deduplicated with the Pixel by `event_id` (`docs/funil-pago.md`)

Infra:

- PostgreSQL 16-alpine (hosted in the shared `central-db` instance), app+auth in one DB, schema applied by the versioned migration runner at boot
- Traefik v3 (external `proxy` network), Let's Encrypt resolver `letsencrypt`
- Multi-stage Dockerfiles, non-root container users
- 256 MB memory cap per container

## Project structure

```
.
├── docker-compose.yml          backend + frontend, Traefik labels (database in central-db)
├── .env.example                env vars, with what each one turns on
├── .github/workflows/          CI (typecheck, tests against Postgres, image publish) and uptime check
├── docs/                       go-live runbook, Meta/WhatsApp setup, ads funnel, design decisions
├── backend/
│   ├── app.ts                  Express app: middleware stack, rate limits, routers, webhooks
│   ├── server.ts               boot: migrations, job queue, listen
│   ├── config/                 plans and limits (planos.ts), virtual attendant settings (agente.ts)
│   ├── db/                     Drizzle schema, pg pool, versioned migration runner
│   ├── migrations/             37 numbered SQL files, applied in order at boot
│   ├── middleware/             auth (tenant + roles), subscription gate, CSRF origin check,
│   │                            platform admin, request log, error handler
│   ├── routes/                 17 routers: reservas, pousadas, convites, hospedes, quartos,
│   │                            tarifas, relatorios, ical, publico, billing, conta, admin,
│   │                            telemetria, whatsapp, stripe-webhook, webhookPix, webhookWhatsapp
│   ├── models/                 21 data-access modules (Reserva, Hospede, Quarto, Tarifa,
│   │                            ContaReserva, Pix, Motor, Precheckin, Assinatura, Agente, ...)
│   ├── lib/                    better-auth, Resend e-mail, pg-boss queue, Stripe, Pix gateways,
│   │                            iCal, WhatsApp/Meta, LLM adapters, Turnstile, observability
│   ├── jobs/                   stay transitions, arrival reminders, cleanup, Stripe reconciliation
│   ├── utils/                  CPF crypto, validation, rate-limit store, IPv6 /64 keys,
│   │                            PII redaction, dates and time zone, role checks
│   ├── tests/                  node:test suites, unit + integration against a real Postgres
│   └── Dockerfile              multi-stage, runs as `nodejs` (uid 1001)
└── frontend/
    ├── app/                    public pages (/, /entrar, /cadastro, /r/[slug], /checkin/[token],
    │                            /privacidade, /termos), logged-in area under (app)/, /assinatura,
    │                            /admin, /onboarding, /convite and the password/e-mail flows
    ├── components/             ui/ (shadcn) and feature components (landing, map, reservations,
    │                            public booking, billing, WhatsApp)
    ├── hooks/                  data hooks per screen
    ├── lib/                    cookie-based fetch, auth client, formatters, consent and analytics
    ├── next.config.js          standalone + poweredByHeader disabled
    └── Dockerfile              multi-stage Next.js standalone
```

## Security model

Authentication (`backend/lib/auth.ts`)

- `better-auth` with the Drizzle adapter against the `user`, `session`, `account`, `verification` tables.
- Email + password (8..100 chars). **E-mail must be verified before the first sign-in** (`requireEmailVerification`); signing in unverified re-sends the link. Password reset via Resend.
- Google OAuth (`prompt=select_account`, no offline token) only registered when `GOOGLE_CLIENT_*` are set; the login screen asks `GET /api/config` and shows the button only then. The OAuth state carries the destination (invite, page that asked for login), the marketing attribution and the error return (`/entrar?error=<code>`).
- Session: expires after 12h without use; activity extends it (refreshed at most once per hour via `updateAge`), so there is no absolute cap. Cookie cache off so a revoked session stops working immediately. Password reset revokes every session of the account (`revokeSessionsOnPasswordReset`).
- HTTPOnly secure cookies in production, no JWTs in headers, no client-side tokens.

Authorization (`backend/middleware/auth.ts`)

- `authMiddleware` calls `auth.api.getSession()`, then in one query loads the user and the `user_pousadas` row for the requested tenant (`X-Pousada-Id`, or the default). A tenant the user does not belong to → 403 `pousadaInvalida`; malformed header → 400. Role and `isOwner` come from the membership row.
- `requirePousada` enforces an active tenant; otherwise 403 with `needsOnboarding: true`.
- `requireOwner` blocks non-owners.
- `authorize(allowedRoles)` is a factory that **throws on construction** if `allowedRoles` is empty or not an array (footgun removal). Owners always pass.

Roles:

| Role        | Reservations | Pousada config | Delete   | Manage staff |
|-------------|--------------|----------------|----------|--------------|
| owner       | full         | full           | yes      | yes          |
| admin       | CRUD         | config         | yes      | yes          |
| recepcao    | CRUD         | read           | no       | no           |
| auditoria   | read         | read           | no       | no           |

Rate limiting

- Traefik: `global-ratelimit@file` + `strip-server-header@file` chained on both routers.
- Express global: 1500 requests / 15 min per IP on `/api/`.
- Auth-endpoint limiter: 10 requests / 15 min on `/api/auth/sign-in`, `/sign-in/email`, `/reset-password`. Successful requests do not consume the budget.
- Requests that send e-mail (`/request-password-reset`, `/send-verification-email`): 5 / hour per IP, counting successes, because the reset endpoint answers 200 whether or not the address exists.
- Sign-up has its own limiter (5 / hour) that does **not** skip successful requests — otherwise creating real accounts was unlimited.
- All IP-based limiters key on the **/64 prefix** for IPv6 (`utils/rede.ts`). Keying on the full address gave any attacker with an IPv6 block an effectively unlimited budget.
- Per-user authenticated limiter: 2000 requests / hour, keyed by `req.user.id`.
- CSV export: 5 requests / hour per user.

Session hygiene

- Background sweep deletes `WHERE expires_at < NOW()` every hour.
- After a successful `POST /api/auth/change-password` or `/change-email`, all other sessions for the user are deleted (current session preserved). Implemented as a `res.on('finish')` interceptor that runs only on 2xx responses.
- After a successful invite acceptance, `auth.api.revokeOtherSessions()` is called to defeat session-pinning across role changes.

CSRF (`backend/middleware/origemConfiavel.ts`)

- `SameSite=Lax` treats every host under the same registrable domain as the same site, so a sibling subdomain could post with the session cookie. Any write that carries a cookie must have an `Origin` from `CORS_ORIGIN`; webhooks are exempt.
- The API parses JSON only, there is no form-encoded body parser.

Invite acceptance (`backend/models/StaffInvite.ts`, `backend/routes/convites.ts`)

- Token lookup is public (`GET /api/convites/:token`) and returns 404 / 410 for missing / used / expired.
- Acceptance requires authentication, and the authenticated user's email must match the invite recipient (case-insensitive). Otherwise the model throws.
- On accept: status flipped to `accepted`, junction row created if not present, other sessions revoked.

Reservations

- **No overbooking, guaranteed by the database**: `EXCLUDE USING gist (pousada_id WITH =, quarto WITH =, daterange(data_entrada, data_saida, '[)') WITH &&) WHERE (status IN ('pre_reserva', 'confirmada', 'hospedada') AND deleted_at IS NULL)`. Reservations imported from OTA calendars go through the same constraint; a clash is reported as possible overbooking instead of being written. Concurrent bookings for the same room cannot both land; the loser gets HTTP 409. The application-level availability check remains only to produce a helpful message.
- Date ranges are **half-open** `[check-in, check-out)`: a guest leaving on the 12th frees the room for a guest arriving on the 12th.
- Optimistic locking via a `version` column on `reservas`. Status changes require `version`; full updates check it when the client sends it (the app's edit form does) and return HTTP 409 on a stale write.
- Idempotency guard: identical (guest + room + dates) within 30s returns the existing reservation (double-click).
- Soft delete (`deleted_at`); `DELETE` requires `admin` or owner.

CSV export (`backend/routes/reservas.ts`)

- Authorized to `admin`, `recepcao`, `auditoria`, plus owner. Limit 5000 rows.
- Customer-supplied fields (`nome`, `observacoes`, `email`, `nacionalidade`) are prefixed with `'` when starting with `=`, `+`, `-`, `@`, tab, or CR — blocks formula injection in Excel / LibreOffice / Sheets.
- Guest document is masked (`***.***.***-NN` for CPF, last 3 characters otherwise) for everyone except admins and owner.
- CRLF line endings (Excel-friendly).
- Each export inserts an audit log row (`export_reservas`, with `rowCount` and `masked` flag).

CPF protection (`backend/utils/crypto.ts`)

- AES-256-GCM at rest, 96-bit IV, 128-bit auth tag, format `iv:authTag:ciphertext` (base64).
- `cpf_hash` is an **HMAC-SHA-256** keyed with `CPF_ENCRYPTION_KEY` (domain-separated), enabling exact-match lookup without decryption. A plain SHA-256 would be brute-forceable over the ~10^9 valid CPFs in under half an hour on one core, which would defeat the AES column next to it.
- `CPF_ENCRYPTION_KEY` must be 32 raw bytes (64 hex). Validated at boot (`assertCpfCryptoConfigurada`) — the server exits rather than start, because a missing key previously caused CPFs to be written in plaintext silently.
- Partial CPF search is impossible by construction (the column holds ciphertext); only exact match via the HMAC works.

Validation

- `validarCPF()` runs the full modulo-11 algorithm with both check digits.
- `sanitizarReserva`, `sanitizarPousada`, `sanitizarNome`, `sanitizarString` trim, strip invisible control characters and clamp lengths before any DB write. They do **not** strip or escape `< > " ' &`: doing that turned "Pousada D'Ajuda" into "Pousada DAjuda" without protecting anything. XSS is handled on output instead: React escapes what it renders, e-mails go through `escapeHtml`, and the CSV export neutralizes formulas (`utils/validation.ts`).
- Queries use either Drizzle's query builder or raw `pg` queries with `$n` placeholders. No user input is interpolated into SQL text; the only template interpolations are constants from the code.

Headers

- Express: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(), microphone=(), camera=()`, HSTS in production, `x-powered-by` disabled.
- Traefik per-router: HSTS preload, `frameDeny`, `contentTypeNosniff`, `referrerPolicy`, `Permissions-Policy`, plus a CSP: `default-src 'none'` for the API; for the site, `base-uri`, `form-action` and `frame-ancestors 'none'`, with scripts, frames and connections limited to the app, its API, GA, the Meta Pixel/SDK and Cloudflare Turnstile (inline scripts allowed; images from any HTTPS host).
- Logs and Sentry record the route template, never the URL: several paths carry a secret token (`utils/rotaSegura.ts`). GA and the Pixel do not load on pages whose address carries a token.
- Next.js: `poweredByHeader: false`.

Audit trail

- `auditoria` table records `action`, `entity`, `entity_id`, `details` (jsonb), `ip`, `user_id`, `created_at`.
- There is **no** `pousada_id` column: tenant isolation is enforced at read time in `AuditoriaModel.listar`, which requires a `pousadaId` and scopes by a subquery over the owning table. Unknown entities raise rather than return cross-tenant rows.
- Entries written through `AuditoriaModel.log` pass `details` through `redigirPII`, so `cpf`, `cpf_hash`, `documento` and `documento_hash` are stored as `[redigido]` — the encrypted column is not undone by the audit trail. The few raw SQL audit inserts (jobs, Pix, pre-check-in, account deletion) carry no personal data.
- Staff writes to reservations and CSV exports emit an entry, written asynchronously after the change: a failed audit insert is logged, not retried. Reservations created or changed by the iCal sync or by the WhatsApp agent are not audited.

## Local development

Prerequisites: Docker 20+, Docker Compose, a Traefik instance attached to the external `proxy` network (only required for production-style deploys).

Environment file (`.env` at repo root, see `.env.example`):

```env
POSTGRES_USER=reservas
POSTGRES_PASSWORD=...                          # strong
POSTGRES_DB=reservas_pousada
BETTER_AUTH_SECRET=...                         # openssl rand -base64 32   (server exits if missing)
CPF_ENCRYPTION_KEY=...                         # openssl rand -hex 32      (server exits if missing)
APP_TIMEZONE=America/Sao_Paulo                 # optional, this is the default
GOOGLE_CLIENT_ID=                              # optional
GOOGLE_CLIENT_SECRET=                          # optional
RESEND_API_KEY=                                # optional in dev, fatal if missing in production
```

Both secrets are fatal at boot on purpose. `BETTER_AUTH_SECRET` was already;
`CPF_ENCRYPTION_KEY` was not, and running without it caused every CPF to be
written to the database in plaintext with no error and no log entry.

`DATABASE_URL`, `BETTER_AUTH_URL`, `CORS_ORIGIN`, `NEXT_PUBLIC_API_URL` are injected by `docker-compose.yml`.

Run with Docker:

```bash
cp .env.example .env
# fill in the required values

docker compose up -d --build
docker compose logs -f
```

This expects the production layout: external `proxy` and `databases` networks and a reachable `central-db`. Elsewhere, run without Docker against any PostgreSQL 16 by setting `DATABASE_URL`.

Run without Docker:

```bash
# backend
cd backend
npm install
npm run dev                  # tsx watch on server.ts

# frontend
cd ../frontend
npm install
npm run dev                  # next dev on :3000

# tests (unit; the DB suite runs too when DATABASE_URL is set)
cd ../backend
npm test
npm run typecheck
```

Schema changes are hand-written SQL files in `backend/migrations/` (`NNN_name.sql`), applied at boot by `db/migrate.ts`. `db/schema.ts` is the Drizzle typing layer and does not declare every table (WhatsApp, Pix, pre-check-in and rate-limit tables live only in SQL), so do not run `drizzle-kit generate`, `migrate` or `push` against a real database: `push` would propose dropping those tables.

## Deployment notes

The compose file expects:

- Traefik on the external `proxy` network with an `https` entrypoint and a `letsencrypt` cert resolver.
- Two Traefik file-provider middlewares available: `global-ratelimit@file` and `strip-server-header@file`.
- DNS A records for `api.diaria.gomio.com.br` and `diaria.gomio.com.br`.

Database migrations under `backend/migrations/` are applied by a versioned runner (`db/migrate.ts`) at boot, inside a transaction per file, tracked in `schema_migrations` and serialized across instances with a Postgres advisory lock. A migration that fails aborts startup deliberately — the server never runs against a schema it does not expect.

A clean run of every migration against an empty database is exercised on every CI build (`tests/banco.test.ts`), so "deploy from scratch" is a tested path rather than an assumption.

### Release and rollback

Every push to `main` that passes CI publishes both images tagged with the first
12 characters of the commit SHA (immutable), and moves `latest` (what the VPS
auto-pull consumes) only if that commit is still the tip of `main`. The backend image carries that SHA, served as `version` by
`/health/live`. The `verificar-producao` job waits up to 25 minutes and fails if
production does not serve the SHA just published (unless a newer commit has
already replaced it), so a stalled auto-pull shows up as a red run. Recovery steps are in `docs/deploy-producao.md`.

Roll back to a known-good version on the VPS:

```bash
# pick the SHA from the GitHub Actions run summary ("Publicado: <sha>")
echo "IMAGE_TAG=<sha>" >> .env
docker compose pull backend frontend && docker compose up -d backend frontend
```

Remove the `IMAGE_TAG` line to go back to following `latest`. Migrations are
forward-only: rolling back the code does not undo a migration, so a release that
changes the schema must stay compatible with the previous code for one version.

Health endpoints: `/health/live` (process up, with the image `version` — used by the Docker healthcheck)
and `/health` (also checks Postgres; returns 503 when the database is
unreachable — point the external uptime monitor here).

Scaling the API to more than one replica: rate-limit counters already live in
Postgres (shared), and the migration runner is serialized by an advisory lock.
Remove `container_name` from the `backend` service, size `DB_POOL_MAX` so that
replicas × pool fits in the shared database's `max_connections`, then
`docker compose up -d --scale backend=2`.

Verification:

```bash
# certificate
echo | openssl s_client -connect diaria.gomio.com.br:443 2>/dev/null \
  | openssl x509 -noout -subject -issuer

# headers
curl -sI https://diaria.gomio.com.br | grep -iE "strict-transport|x-frame|x-content"
curl -sI https://api.diaria.gomio.com.br | grep -iE "strict-transport|x-frame|x-content"
```

## API surface

Mounted in `backend/app.ts`. Every authenticated route accepts `X-Pousada-Id`.

### Auth (better-auth)

```
POST   /api/auth/sign-up/email          register (no session until the e-mail is verified); accepts `origem` (UTM attribution)
POST   /api/auth/sign-in/email          login (HTTPOnly cookie); 403 EMAIL_NOT_VERIFIED re-sends the link
POST   /api/auth/sign-out               logout
GET    /api/auth/get-session            current session
POST   /api/auth/request-password-reset request password reset (always 200; 5 / hour per IP)
POST   /api/auth/reset-password         consume reset token
POST   /api/auth/change-password        evicts other sessions on success
POST   /api/auth/change-email           evicts other sessions on success
POST   /api/auth/send-verification-email re-send the verification link (5 / hour per IP)
GET    /api/auth/verify-email           consume the verification token
POST   /api/auth/sign-in/social         Google OAuth start (when configured)
GET    /api/config                      public install info for the login screen ({ google })
```

### Reservations (auth + active pousada + subscription in good standing)

```
GET    /api/reservas                          list, paginated (max 200/page), CPF always masked
GET    /api/reservas/agenda?data=&dias=       arrivals, departures, in-house and upcoming arrivals
GET    /api/reservas/export                   CSV (max 5000 rows, 5/hour); full CPF only for admin/owner
GET    /api/reservas/:id                      detail; full CPF for owner/admin/reception (audited), masked for auditoria
GET    /api/reservas/:id/auditoria            audit history
GET    /api/reservas/disponibilidade/:quarto  availability (conflicts return only id/name/room/dates/status)
GET    /api/reservas/mapa                     occupancy map (rooms × days)
POST   /api/reservas                          create (room must exist in the pousada)
POST   /api/reservas/importar                 spreadsheet import, rows parsed in the browser; dry-run unless `simular: false` (admin)
PUT    /api/reservas/:id                      update, optimistic locking (409 on conflict)
PATCH  /api/reservas/:id/status               status change, optimistic locking
DELETE /api/reservas/:id                      soft delete, admin or owner
GET    /api/reservas/:id/conta                reservation account: payments, extras, balance
POST   /api/reservas/:id/pagamentos           record a payment
DELETE /api/reservas/:id/pagamentos/:pagamentoId   remove a payment (admin)
POST   /api/reservas/:id/consumos             add an extra charge
DELETE /api/reservas/:id/consumos/:consumoId  remove an extra charge
GET    /api/reservas/:id/pix                  Pix charges for the deposit
POST   /api/reservas/:id/pix                  create a Pix charge, own key or gateway (up to the open balance)
POST   /api/reservas/:id/pix/:cobrancaId/recebida   mark a manual Pix as received
POST   /api/reservas/:id/precheckin/link      create the guest's pre-check-in link
GET    /api/reservas/:id/precheckin           the submitted registration card
```

### Guests, rooms, rates, reports, iCal (auth + active pousada)

Guests and reports also require a subscription in good standing; rooms, rates and the
iCal settings are configuration and do not (syncing an imported calendar does).

```
GET    /api/hospedes                          list and search
POST   /api/hospedes                          create
GET    /api/hospedes/:id                      detail with stay history
PUT    /api/hospedes/:id                      update
GET    /api/quartos                           rooms
POST   /api/quartos                           create (admin)
PUT    /api/quartos/:id                       update (admin)
DELETE /api/quartos/:id                       remove; deactivated instead when it has history (admin)
GET    /api/tarifas/cotacao                   price night by night for room + dates
GET    /api/tarifas                           rate rules
POST   /api/tarifas                           create rule (admin)
PUT    /api/tarifas/:id                       update rule (admin)
DELETE /api/tarifas/:id                       remove rule (admin)
GET    /api/relatorios                        occupancy, ADR, RevPAR, revenue, receivables (admin, auditoria)
GET    /api/ical                              per-room export links and imported calendars (admin)
POST   /api/ical/importacoes                  add an OTA calendar (admin)
POST   /api/ical/importacoes/:id/sincronizar  sync now
DELETE /api/ical/importacoes/:id              remove an imported calendar (admin)
POST   /api/ical/quartos/:numero/novo-link    rotate a room's export link (admin)
GET    /ical/:arquivo                         public .ics feed, secret token in the path (30 / min per IP)
```

### Public booking, pre-check-in and Pix (no auth)

```
GET    /api/publico/:slug                     inn and rooms for the booking page
GET    /api/publico/:slug/disponibilidade     availability with tariff prices
POST   /api/publico/:slug/reservas            booking request → pre-reservation with deadline
GET    /api/publico/checkin/:token            pre-check-in form data
POST   /api/publico/checkin/:token            submit the registration card
GET    /api/publico/pix/:token                deposit Pix status for the guest
POST   /api/webhooks/pix/asaas/:token         Asaas payment notice, re-checked against the Asaas API
```

### WhatsApp Business (auth + active pousada + subscription in good standing)

```
GET    /api/whatsapp/config                      public bits for the Embedded Signup (app id, config id) + availability
GET    /api/whatsapp/conta                       connection status (never the token)
POST   /api/whatsapp/conectar                    owner/admin: { code, waba_id, phone_number_id, coexistencia }
POST   /api/whatsapp/desconectar                 owner/admin
PUT    /api/whatsapp/agente                      owner/admin: { ativo } — virtual attendant on/off
GET    /api/whatsapp/conversas                   owner/admin/front desk
GET    /api/whatsapp/conversas/:id               messages (decrypted)
POST   /api/whatsapp/conversas/:id/responder     staff reply within the 24h window (pauses the agent for 12h)
POST   /api/whatsapp/conversas/:id/agente        hand the conversation back to the agent
GET    /api/webhooks/whatsapp                    Meta verification (hub.challenge)
POST   /api/webhooks/whatsapp                    Meta events, X-Hub-Signature-256 checked over the raw body
```

### Pousadas (auth)

```
POST   /api/pousadas                          create (name + rooms; plan limits and Rede coverage decided in-transaction)
GET    /api/pousadas/minha                    active pousada (for this tab)
GET    /api/pousadas/minhas                   all memberships
POST   /api/pousadas/trocar                   set the default pousada for new tabs
GET    /api/pousadas/:id                      details (member)
PUT    /api/pousadas/:id                      update (owner/admin); refuses removing rooms with current reservations
DELETE /api/pousadas/:id                      definitive deletion (owner, body {confirmacao: <exact name>})
POST   /api/pousadas/:id/desativar            deactivate
POST   /api/pousadas/:id/reativar             reactivate
GET    /api/pousadas/:id/dashboard            today's occupancy, revenue, receivables
GET    /api/pousadas/:id/quartos              rooms
PUT    /api/pousadas/:id/motor                public booking page: on/off, deadline, deposit, policies
GET    /api/pousadas/:id/pix                  Pix settings (a stored gateway token is never returned)
PUT    /api/pousadas/:id/pix                  set the Pix key or gateway (owner only)
GET    /api/pousadas/:id/whatsapp             whether automatic messages can be sent
GET    /api/pousadas/:id/usuarios             team (owner/admin)
PATCH  /api/pousadas/:id/usuarios/:userId     change role (only the owner grants/revokes admin)
DELETE /api/pousadas/:id/usuarios/:userId     remove member (access ends immediately)
POST   /api/pousadas/:id/convites             invite (plan limit counts pending invites)
GET    /api/pousadas/:id/convites             invites
POST   /api/pousadas/:id/convites/:inviteId/reenviar resend (renews 7 days)
DELETE /api/pousadas/:id/convites/:inviteId   revoke
```

Joining a team is invite-only (the old "attach user by id" route was removed).

### Invites

```
GET    /api/convites/:token                   public, validates token (404 / 410)
POST   /api/convites/:token/aceitar           auth + verified e-mail matching the invite; checks the plan's user limit
```

### Billing (auth)

```
GET    /api/billing/situacao                  subscription state (effective one, for pousadas covered by a Rede plan)
GET    /api/billing/planos                    sellable plans
POST   /api/billing/checkout                  owner; refused when a live Stripe subscription exists
POST   /api/billing/trocar-plano              owner; updates the existing subscription with proration
POST   /api/billing/portal                    owner; Stripe customer portal
POST   /api/webhooks/stripe                   signed webhook; event record and effects in one transaction
```

### Account (LGPD) and misc

```
GET    /api/conta/exportar                    the user's own data as JSON
DELETE /api/conta                             anonymize own account (body {confirmacao: "EXCLUIR"})
PUT    /api/conta/consentimento               cookie-banner decision for ads ({anuncios: boolean}); revoking stops server-side conversions
POST   /api/telemetria/erro                   browser error reports (public, rate-limited)
GET    /api/admin/margem                      margin per tenant (ADMIN_EMAILS + verified e-mail)
GET    /api/admin/margem/:pousadaId           the entries behind one tenant's margin
GET    /api/admin/aquisicao?dias=             sign-ups → pousadas → paying, per acquisition channel
```

### Health

```
GET    /                                      API status
GET    /health/live                           process is up, with the image version (Docker healthcheck, CI)
GET    /health                                also checks Postgres; 503 when unreachable (uptime monitor)
```

## Planned work

- [`docs/deploy-producao.md`](docs/deploy-producao.md) — production go-live runbook:
  VPS secrets, Resend, GitHub Variables for the `NEXT_PUBLIC_*` build args, backup,
  monitoring, Google OAuth, Stripe, GA4/Meta, WhatsApp, smoke test.
- [`docs/whatsapp-meta.md`](docs/whatsapp-meta.md) — what to set up at Meta (business
  verification, Embedded Signup configuration, webhook, App Review) and the env vars.

Design decisions recorded before implementation, so the reasoning survives the
conversation that produced it:

- [`docs/chat-ia-dashboard.md`](docs/chat-ia-dashboard.md) — natural-language chat
  over each tenant's own reservation data. **Deferred, not cancelled**: every
  question is a paid model call, and it only becomes useful once paying inns have
  months of real reservations to ask about. The document records the
  prerequisites, the architecture (fixed read-only tools with the tenant injected
  server-side — never text-to-SQL, never RAG), why CPF must not enter the model
  context, and the cost model.

## License

All rights reserved. The source is public to be read and evaluated, not reused: see [`LICENSE`](LICENSE).
