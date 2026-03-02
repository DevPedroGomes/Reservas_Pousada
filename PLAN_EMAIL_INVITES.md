# Plano: Email (Resend) + Forgot Password + Email Verification + Staff Invites

## Contexto

A aplicação não envia nenhum email. Falta: recuperação de senha, verificação de email, e convites de staff. O usuario escolheu **Resend** como provedor de email.

---

## Fase 1: Backend - Email Service + Resend

### 1.1 Instalar dependência
- `cd backend && npm install resend`

### 1.2 Criar `backend/lib/email.ts`
- Instanciar Resend client com `RESEND_API_KEY`
- Se key não configurada: logar aviso, funções retornam sem enviar (graceful degradation)
- `FROM_EMAIL`: `Reservas Pousada <noreply@pgdev.com.br>` (prod) ou `onboarding@resend.dev` (dev/teste)
- Base HTML template com branding (logo RP, cores indigo)
- 3 funções de envio:
  - `sendPasswordResetEmail(email, name, resetUrl)`
  - `sendVerificationEmail(email, name, verificationUrl)`
  - `sendStaffInviteEmail(email, pousadaNome, role, inviterName, inviteUrl)`
- Padrão fire-and-forget (`.catch(console.error)`) - igual ao audit log

### 1.3 Atualizar `docker-compose.yml`
- Adicionar `RESEND_API_KEY: ${RESEND_API_KEY:-}` no backend environment

---

## Fase 2: Forgot Password (Better Auth built-in)

Better Auth já expõe `POST /api/auth/request-password-reset` e `POST /api/auth/reset-password`. Só falta wiring.

### 2.1 Modificar `backend/lib/auth.ts`
- Adicionar `sendResetPassword` callback no `emailAndPassword` config
- Callback chama `sendPasswordResetEmail(user.email, user.name, url)`

### 2.2 Adicionar métodos em `frontend/lib/auth-client.ts`
- `requestPasswordReset(email)` - chama `authClient.forgetPassword({email, redirectTo: APP_URL/reset-password})`
- `resetPassword(newPassword, token)` - chama `authClient.resetPassword({newPassword, token})`

### 2.3 Criar `frontend/app/forgot-password/page.tsx`
- Form com campo email, botão enviar
- Estados: loading, sent (mostra "verifique seu email"), error
- Link "Voltar ao login"
- Visual: Card centralizado, estilo igual onboarding

### 2.4 Criar `frontend/app/reset-password/page.tsx`
- Lê `token` de searchParams
- Form: nova senha + confirmar senha (autoComplete="new-password")
- Valida: senhas iguais, min 8 chars
- No sucesso: "Senha redefinida!" + redirect para `/` em 2s
- Sem token: "Link inválido" + link para `/forgot-password`

### 2.5 Modificar `frontend/components/auth/AuthCard.tsx`
- Adicionar link "Esqueceu a senha?" entre campo senha e botão "Entrar" no form de login

---

## Fase 3: Email Verification (Better Auth built-in)

### 3.1 Modificar `backend/lib/auth.ts`
- Adicionar config `emailVerification`:
  - `sendOnSignUp: true`
  - `autoSignInAfterVerification: true`
  - `sendVerificationEmail` callback

### 3.2 Adicionar método em `frontend/lib/auth-client.ts`
- `sendEmailVerification(email)` - chama `authClient.sendVerificationEmail({email, callbackURL})`

### 3.3 Criar `frontend/app/verify-email/page.tsx`
- Página callback após clicar link de verificação
- Mostra "Email verificado com sucesso!" ou erro
- Link para dashboard

### 3.4 Modificar `frontend/lib/types.ts`
- Adicionar `email_verified?: boolean` em `Usuario`

### 3.5 Modificar `frontend/hooks/useAuth.ts`
- Mapear `emailVerified` da session para `email_verified` do user

### 3.6 Modificar `frontend/app/page.tsx`
- Adicionar banner de verificação no dashboard quando `email_verified === false`
- Banner amarelo com botão "Reenviar email"

---

## Fase 4: Staff Invites (Custom)

### 4.1 Schema - Adicionar tabela `staff_invites` em `backend/db/schema.ts`
```
staff_invites: id, pousada_id, email, role, token (unique), status (pending/accepted/revoked),
               invited_by, accepted_by, expires_at, created_at, updated_at
```
- Indexes: token, pousada_id, email
- Relations: pousada, inviter user

### 4.2 Criar migration `backend/migrations/003_staff_invites.sql`

### 4.3 Criar `backend/models/StaffInvite.ts`
- `generateToken()` - crypto.randomBytes(32).toString('hex')
- `criar(data)` - cria convite com token e expiração 7 dias
- `buscarPorToken(token)` - join com pousadas/user para pegar nomes
- `listarPorPousada(pousadaId)` - lista convites
- `aceitar(token, userId)` - valida, associa user à pousada, marca accepted
- `revogar(inviteId, pousadaId)` - marca revoked
- `existeConvitePendente(email, pousadaId)` - evita duplicatas

### 4.4 Criar `backend/routes/convites.ts` (rotas públicas)
- `GET /api/convites/:token` - valida convite (público, sem auth) - retorna info da pousada
- `POST /api/convites/:token/aceitar` - aceita convite (requer auth)

### 4.5 Adicionar rotas em `backend/routes/pousadas.ts`
- `POST /api/pousadas/:id/convites` - criar convite + enviar email (owner/admin)
- `GET /api/pousadas/:id/convites` - listar convites (owner/admin)
- `DELETE /api/pousadas/:id/convites/:inviteId` - revogar (owner/admin)

### 4.6 Registrar rotas em `backend/server.ts`
- Adicionar `app.use('/api/convites', conviteRoutes)` antes das rotas autenticadas

### 4.7 Adicionar tipos em `frontend/lib/types.ts`
- `StaffInvite` interface
- `InviteInfo` interface

### 4.8 Criar `frontend/hooks/useStaffInvites.ts`
- `carregarConvites()`, `enviarConvite(email, role)`, `revogarConvite(id)`
- Estado: convites[], loading, message

### 4.9 Criar `frontend/app/convite/[token]/page.tsx`
- Fetch público `GET /api/convites/:token` para mostrar info
- Se autenticado: botão "Aceitar Convite" -> POST aceitar -> redirect /
- Se não autenticado: botões "Criar Conta" e "Já tenho conta" com returnTo

### 4.10 Modificar `frontend/app/page.tsx` - Settings tab
- Substituir placeholder "Em breve" por UI completa:
  - Card "Convidar Equipe": form email + select role + botão enviar
  - Lista de convites pendentes com botão revogar
  - Lista de membros atuais (reuse query existente `/api/pousadas/:id/usuarios`)

---

## Fase 5: Deploy

1. Adicionar `RESEND_API_KEY` no `.env` da VPS
2. `docker compose up -d --build`
3. Executar migration: `docker compose exec postgres psql -U reservas -d reservas_pousada -f /docker-entrypoint-initdb.d/003_staff_invites.sql`
4. Verificar logs: `docker compose logs -f backend`
5. Testar fluxo completo: signup -> verificar email -> forgot password -> reset -> convidar staff

---

## Arquivos

**Novos (9):**
- `backend/lib/email.ts`
- `backend/models/StaffInvite.ts`
- `backend/routes/convites.ts`
- `backend/migrations/003_staff_invites.sql`
- `frontend/app/forgot-password/page.tsx`
- `frontend/app/reset-password/page.tsx`
- `frontend/app/verify-email/page.tsx`
- `frontend/app/convite/[token]/page.tsx`
- `frontend/hooks/useStaffInvites.ts`

**Modificados (10):**
- `backend/package.json` - add resend
- `backend/lib/auth.ts` - email callbacks
- `backend/db/schema.ts` - staff_invites table
- `backend/routes/pousadas.ts` - invite routes
- `backend/server.ts` - register convites routes
- `docker-compose.yml` - RESEND_API_KEY
- `frontend/lib/auth-client.ts` - password reset + verification methods
- `frontend/lib/types.ts` - StaffInvite, email_verified
- `frontend/components/auth/AuthCard.tsx` - link "Esqueceu a senha?"
- `frontend/hooks/useAuth.ts` - emailVerified mapping
- `frontend/app/page.tsx` - verification banner + invite UI no Settings
