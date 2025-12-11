# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sistema de Gerenciamento de Reservas para Pousada - Single-tenant application for managing room reservations in a 25-room inn. Security-hardened production-ready system (90% security level) with comprehensive validation, sanitization, and audit logging.

**Tech Stack:**
- Backend: Node.js + Express.js + Supabase (PostgreSQL)
- Frontend: Vanilla JavaScript + Bootstrap 5
- Authentication: JWT with bcrypt
- Security: Rate limiting, RLS policies, XSS protection, CPF validation

## Development Commands

### Backend

```bash
# Install dependencies (run once from backend/)
cd backend
npm install

# Development server with auto-reload
npm run dev

# Production server
npm start

# Manual database backup
npm run backup
```

### Environment Setup

Required `.env` variables in `backend/` directory:

```env
NODE_ENV=development|production
PORT=3000
JWT_SECRET=<REQUIRED: minimum 32 chars, never use fallback>
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=<your anon key>
CORS_ORIGIN=http://localhost:3000
```

**CRITICAL:** `JWT_SECRET` is mandatory - application will exit if not defined. Never commit `.env` to git.

### Database Setup

1. Create Supabase project at [supabase.com](https://supabase.com)
2. Execute SQL script in Supabase SQL Editor:
   ```bash
   # Copy contents of supabase_setup.sql to Supabase SQL Editor
   ```
3. The script creates:
   - `usuarios` and `reservas` tables with proper indexes
   - Helper functions with `SECURITY DEFINER`
   - Optional `logs` table for audit trail
   - RLS policies for row-level security

## Architecture

### Backend Structure

```
backend/
├── server.js              # Main Express server with security middleware
├── database/
│   └── db.js             # Supabase client initialization
├── models/
│   ├── Usuario.js        # User authentication and management
│   └── Reserva.js        # Reservation CRUD operations
├── routes/
│   ├── auth.js           # /api/auth endpoints (login, verify)
│   └── reservas.js       # /api/reservas endpoints (protected)
├── utils/
│   └── validation.js     # Data validation and sanitization
├── config/
│   └── security.js       # Security configs, cache, activity logger
└── backup.js             # Database backup script
```

### Frontend Structure

```
public/
├── index.html            # Single-page application entry
├── css/                  # Styling
└── js/
    └── app.js            # Client-side logic with XSS protection
```

### Key Architectural Patterns

**Authentication Flow:**
1. Client sends credentials to `/api/auth/login`
2. Server validates via `Usuario.verificarSenha()` (bcrypt comparison)
3. JWT token generated with 24h expiration
4. All `/api/reservas/*` routes protected by `authenticateJWT` middleware
5. Token verified on each request, decoded user attached to `req.user`

**Database Access Pattern:**
- All database operations go through Supabase client
- Models (`Usuario.js`, `Reserva.js`) encapsulate all queries
- Row Level Security (RLS) policies enforce access control at database level
- Prepared statements prevent SQL injection

**Security Layers:**
1. **Input validation** - `utils/validation.js` validates all user input
2. **Sanitization** - Removes dangerous characters before processing
3. **Rate limiting** - 100 requests per 15 minutes per IP
4. **Security headers** - X-Frame-Options, XSS-Protection, CSP, etc.
5. **RLS policies** - Database-level access control
6. **Activity logging** - All requests logged via `activityLogger` middleware

**Cache System:**
- In-memory cache in `config/security.js`
- TTL-based expiration (default 60 seconds)
- Used for frequent queries to reduce database load
- Cache invalidation on data mutations

## Critical Security Rules

### Validation Module (`utils/validation.js`)

**ALWAYS use validation functions before database operations:**
- `validarCPF(cpf)` - Complete Brazilian CPF validation with check digits
- `validarReserva(reserva)` - Validates entire reservation object
- `sanitizarReserva(reserva)` - Sanitizes all fields
- `sanitizarString(str)` - Removes HTML/script tags (XSS protection)

**Never skip validation** - Both client-side AND server-side validation are required.

### JWT Handling

- `JWT_SECRET` must be set - server exits if missing
- Never expose JWT_SECRET in logs or responses
- Token format: `Bearer <token>` in Authorization header
- Always verify token structure and required fields (`id`, `username`)

### CPF Validation

Uses full algorithm validation (not just format check):
- Must be 11 digits
- Cannot be all same digits
- Validates both check digits using modulo 11 algorithm

### Database Queries

**NEVER construct raw SQL with user input.** Use Supabase query builder:

```javascript
// ✅ CORRECT - Parameterized query
const { data } = await supabase
  .from('reservas')
  .select('*')
  .eq('id', reservaId);

// ❌ WRONG - SQL injection vulnerable
const query = `SELECT * FROM reservas WHERE id = ${reservaId}`;
```

### Error Messages

**Never expose internal details in error responses:**
- Generic messages: "Erro no servidor" instead of stack traces
- No database error details to client
- Log detailed errors server-side only

## Common Development Tasks

### Adding a New Reservation Field

1. Update `supabase_setup.sql` with new column
2. Run migration in Supabase SQL Editor
3. Add validation in `utils/validation.js`:
   - Create `validar<FieldName>()` function
   - Update `validarReserva()` to include field
   - Update `sanitizarReserva()` if needed
4. Update `models/Reserva.js` methods to include field
5. Update frontend `public/js/app.js` form handling
6. Test validation on both client and server

### Adding a New API Endpoint

1. Add route in `backend/routes/reservas.js` or `auth.js`
2. Use `authenticateJWT` middleware for protected routes
3. Validate all inputs using `utils/validation.js`
4. Log activity if needed via `activityLogger`
5. Return consistent JSON format: `{ sucesso: boolean, mensagem: string, data?: any }`

### Testing Authentication

```bash
# Login and get token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Use token for protected route
curl http://localhost:3000/api/reservas \
  -H "Authorization: Bearer <token>"
```

### Running Backups

Backups export all data to JSON files:

```bash
cd backend
npm run backup
```

- Backups stored in `backend/backup/`
- Keeps 10 most recent backups automatically
- Includes `usuarios` and `reservas` tables
- Recommended: Schedule daily backups in production

## Environment-Specific Behavior

**Development (`NODE_ENV=development`):**
- Detailed console logging
- CORS allows all origins (if `CORS_ORIGIN` not set)
- No HSTS header
- Activity logger prints to console

**Production (`NODE_ENV=production`):**
- Minimal logging
- CORS restricted to `CORS_ORIGIN` value
- HSTS header enabled (requires HTTPS)
- Activity logger can write to database (optional)

## Database Schema

### usuarios
- `id` (SERIAL PK) - Auto-increment
- `username` (TEXT UNIQUE) - Login identifier
- `password` (TEXT) - bcrypt hash (salt 10)
- `nome` (TEXT) - Full name
- `role` (TEXT) - User role (admin, funcionario)
- `created_at` (TIMESTAMPTZ) - Creation timestamp

### reservas
- `id` (SERIAL PK)
- `nome` (TEXT) - Guest name
- `cpf` (TEXT) - Brazilian CPF (validated)
- `quarto` (INTEGER) - Room number (1-25)
- `data_entrada`, `data_saida` (DATE) - Check-in/out dates
- `status` (TEXT) - ativa | finalizada | cancelada
- `valor` (NUMERIC) - Reservation amount
- `pago` (BOOLEAN) - Payment status
- `observacoes` (TEXT) - Notes
- `criado_por` (INTEGER FK) - User who created
- `created_at`, `updated_at` (TIMESTAMPTZ)

**Indexes:**
- `idx_reservas_status` on `status`
- `idx_reservas_pago` on `pago`
- `idx_reservas_datas` on `(data_entrada, data_saida)`

## Supabase Integration

When using Supabase MCP tools, prefer them for all Supabase operations:

- **Use `mcp__supabase__search_docs`** for documentation queries
- **Use `mcp__supabase__execute_sql`** for SELECT queries
- **Use `mcp__supabase__apply_migration`** for DDL changes (CREATE, ALTER, DROP)
- **Use `mcp__supabase__get_advisors`** to check for security/performance issues

Always verify RLS policies are working correctly after schema changes.
