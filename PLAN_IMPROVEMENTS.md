# Plano de Melhorias — Reservas Pousada

> Foco: showcase robusto, pronto para migrar a SaaS sem retrabalho.

---

## PHASE 1: CRITICAL (Segurança + Integridade)

### 1.1 — Pagination Cap (DoS Prevention)
**Problema:** `?limit=999999` aceito sem cap em export e auditoria.
**Risco:** Muito baixo. Limites aditivos.

| Arquivo | Mudança |
|---------|---------|
| `backend/routes/reservas.ts` | Cap export em 5000, header `X-Total-Truncated` se truncado |
| `backend/models/Auditoria.ts` | `Math.min(limit, 500)` no `listar()` |
| `backend/models/Pousada.ts` | `.limit(200)` em `listarUsuarios()`, `.limit(50)` em `listarPousadasDoUsuario()` |

---

### 1.2 — Error Boundary (Resiliência Frontend)
**Problema:** API offline = frontend trava sem mensagem amigável.
**Risco:** Muito baixo. Aditivo.

| Arquivo | Mudança |
|---------|---------|
| `frontend/components/error-boundary.tsx` | **NOVO** — React class component com `componentDidCatch`, card amigável "Algo deu errado" |
| `frontend/app/layout.tsx` | Wrap `{children}` no ErrorBoundary |
| `frontend/lib/api.ts` | Try/catch no `authenticatedFetch()`, throw `NetworkError` tipado |
| `frontend/hooks/useReservations.ts` | Estado `error` + `clearError` exportados |
| `frontend/hooks/useAuth.ts` | Estado `connectionError` para erros de rede |
| `frontend/app/page.tsx` | Banner de erro quando `error` truthy, botão "Tentar novamente" |

---

### 1.3 — Optimistic Locking (Proteção contra edição concorrente)
**Problema:** 2 recepcionistas editam mesma reserva = último salva por cima.
**Risco:** Baixo. Frontend antigo precisa de fallback durante deploy.

| Arquivo | Mudança |
|---------|---------|
| `backend/db/schema.ts` | `version: integer('version').notNull().default(1)` em `reservas` |
| `backend/migrations/006_optimistic_locking.sql` | **NOVO** — `ALTER TABLE reservas ADD COLUMN version INTEGER NOT NULL DEFAULT 1` |
| `backend/models/Reserva.ts` | `atualizar()`: WHERE inclui `version`, SET `version = version + 1`, retorna 409 se `rowCount === 0` |
| `backend/routes/reservas.ts` | `PUT /:id` e `PATCH /:id/status`: extrair `version` do body, 409 em conflito |
| `frontend/lib/types.ts` | `version: number` em `Reserva` |
| `frontend/hooks/useReservations.ts` | Enviar `version` no payload de update |

---

### 1.4 — CPF Encryption (LGPD)
**Problema:** CPF em texto puro no banco.
**Risco:** Médio. Perda da chave = dados irrecuperáveis. Script de migração deve ser testado.

| Arquivo | Mudança |
|---------|---------|
| `backend/utils/crypto.ts` | **NOVO** — `encryptCpf()`, `decryptCpf()`, `hashCpf()` (AES-256-GCM + SHA-256) |
| `backend/db/schema.ts` | `cpfHash: text('cpf_hash')` em `reservas` + índice |
| `backend/migrations/007_cpf_encryption.sql` | **NOVO** — ADD COLUMN + index |
| `backend/models/Reserva.ts` | Encrypt no `criar()`/`atualizar()`, decrypt no `buscar*()`, busca por hash |
| `backend/scripts/encrypt-existing-cpfs.ts` | **NOVO** — Script one-time para criptografar CPFs existentes |
| `docker-compose.yml` | Adicionar `CPF_ENCRYPTION_KEY` |
| `.env` + `.env.example` | Adicionar `CPF_ENCRYPTION_KEY` |

**Ordem de deploy:** migration → script de criptografia → novo backend code

---

## PHASE 2: IMPORTANT (Features de domínio)

### Cluster A: Hóspede + Quartos + Check-in/out (Items 8, 9, 10)

#### 2.1 — Quartos como entidade (Item 9)

| Arquivo | Mudança |
|---------|---------|
| `backend/db/schema.ts` | Tabela `quartos`: id, pousadaId, numero, tipo, capacidade, precoDiaria, descricao, ativo |
| `backend/migrations/009_quartos_table.sql` | **NOVO** — CREATE TABLE + auto-seed dos quartos existentes |
| `backend/models/Quarto.ts` | **NOVO** — CRUD + `listarPorPousada()` com status de ocupação |
| `backend/routes/pousadas.ts` | `GET /:id/quartos` retorna objetos completos; `PUT /:id/quartos/:id` para update; `POST /:id/quartos` para criar |
| Frontend | Seletor de quarto mostra tipo/preço; Config page com edição de quartos |

#### 2.2 — Hóspede como entidade (Item 8)

| Arquivo | Mudança |
|---------|---------|
| `backend/db/schema.ts` | Tabela `hospedes`: id, pousadaId, nome, cpf (encrypted), cpfHash, email, telefone, observacoes + unique(pousadaId, cpfHash) |
| `backend/migrations/008_hospedes_table.sql` | **NOVO** — CREATE TABLE + `hospedeId` FK em reservas |
| `backend/models/Hospede.ts` | **NOVO** — `criarOuBuscar()` (upsert por hash), `buscarPorCpf()`, `listarPorPousada()`, `historicoReservas()` |
| `backend/routes/hospedes.ts` | **NOVO** — `GET /api/hospedes`, `GET /:id`, `GET /buscar?cpf=` |
| `backend/server.ts` | Montar rota `/api/hospedes` |
| `backend/models/Reserva.ts` | `criar()` chama `Hospede.criarOuBuscar()`, seta `hospedeId` |
| Frontend form | Autocomplete: ao digitar CPF, busca hóspede e preenche nome |

#### 2.3 — Check-in / Check-out (Item 10)

| Arquivo | Mudança |
|---------|---------|
| `backend/db/schema.ts` | `checkinAt` e `checkoutAt` em `reservas` |
| `backend/migrations/010_checkin_checkout.sql` | **NOVO** |
| `backend/utils/validation.ts` | Adicionar `'checkin'` e `'checkout'` como status válidos |
| `backend/routes/reservas.ts` | `POST /:id/checkin` e `POST /:id/checkout` com validação de datas |
| Frontend | Botões de ação check-in/check-out na tabela; badges para novos status |

---

### Cluster B: Relatórios + Calendário + Notificações (Items 5, 6, 7)

#### 2.4 — Calendário Visual (Item 7)

| Arquivo | Mudança |
|---------|---------|
| `frontend/components/calendar/CalendarView.tsx` | **NOVO** — Grid: Y=quartos, X=dias do mês, barras coloridas por status |
| `frontend/hooks/useCalendar.ts` | **NOVO** — Fetch reservas do mês + quartos |
| `frontend/app/page.tsx` | Novo page type `"calendario"` |
| Dashboard nav | Adicionar "Calendário" no header |

**Sem mudanças no backend** — usa endpoint existente com filtro de datas.

#### 2.5 — Relatórios Financeiros (Item 5)

| Arquivo | Mudança |
|---------|---------|
| `backend/routes/relatorios.ts` | **NOVO** — `GET /financeiro?mes=`, `GET /ocupacao?mes=`, `GET /hospedes?mes=` |
| `backend/models/Relatorio.ts` | **NOVO** — Queries SQL com GROUP BY, date_trunc |
| `backend/server.ts` | Montar `/api/relatorios` |
| Frontend | Novo page type `"relatorios"` com seletor de mês e cards de resumo |

#### 2.6 — Notificações In-App (Item 6)

| Arquivo | Mudança |
|---------|---------|
| `backend/db/schema.ts` | Tabela `notificacoes`: id, pousadaId, userId, tipo, titulo, mensagem, lida, createdAt |
| `backend/migrations/012_notificacoes.sql` | **NOVO** |
| `backend/models/Notificacao.ts` | **NOVO** — CRUD + `listarNaoLidas()` |
| `backend/routes/notificacoes.ts` | **NOVO** — GET list, PATCH marcar lida, POST ler todas |
| `backend/server.ts` | Cron periódico: check-in hoje, checkout hoje, overdue |
| Frontend | `NotificationBell.tsx` no header com badge de contagem |

---

### Cluster C: Auditoria + Backup + Senha (Items 11, 12, 13)

#### 2.7 — Auditoria Completa (Item 11)

| Arquivo | Mudança |
|---------|---------|
| `backend/db/schema.ts` | `pousadaId` na tabela `auditoria` |
| `backend/migrations/011_audit_pousada_id.sql` | **NOVO** — ADD COLUMN + backfill |
| `backend/routes/pousadas.ts` | Adicionar `AuditoriaModel.log()` em: PUT pousada, POST/DELETE usuarios, POST/DELETE convites |
| `backend/routes/convites.ts` | Audit no `POST /:token/aceitar` |
| `backend/models/Auditoria.ts` | Filtrar por `pousadaId` direto |

#### 2.8 — Backup Automatizado (Item 12)

| Arquivo | Mudança |
|---------|---------|
| `docker-compose.yml` | Serviço `backup`: container postgres:16-alpine com pg_dump diário + retenção 7 dias |
| `.gitignore` | Adicionar `backups/` |

#### 2.9 — Troca de Senha Logado (Item 13)

| Arquivo | Mudança |
|---------|---------|
| `frontend/lib/auth-client.ts` | Função `changePassword()` (Better Auth built-in) |
| `frontend/app/page.tsx` | Card "Alterar Senha" na aba Configurações |

**Sem mudanças no backend** — Better Auth já expõe `POST /api/auth/change-password`.

---

## PHASE 3: MINOR (Polish de UX)

### 3.1 — Esconder tabs por role (Item 14)

| Arquivo | Mudança |
|---------|---------|
| `frontend/components/dashboard/DashboardHeader.tsx` | Condicional: Config para owner+admin; esconder "Nova Reserva" de `auditoria` |

### 3.2 — Retry com backoff (Item 15)

| Arquivo | Mudança |
|---------|---------|
| `frontend/lib/api.ts` | `fetchWithRetry()`: 3 tentativas, backoff 500/1500/4500ms, só em network error e 502/503/504 |

### 3.3 — Rate limit por usuário (Item 16)

| Arquivo | Mudança |
|---------|---------|
| `backend/server.ts` | Segundo rate limiter com `keyGenerator: req.user?.id \|\| req.ip`, aplicado após authMiddleware |

### 3.4 — State stale ao trocar pousada (Item 17)

| Arquivo | Mudança |
|---------|---------|
| `frontend/hooks/useReservations.ts` | `clearAll()` que reseta reservas, dashboard, auditoria |
| `frontend/components/dashboard/DashboardHeader.tsx` | Substituir `window.location.reload()` por clearAll + reload de dados |
| `frontend/app/page.tsx` | Chamar `clearAll()` após `trocarPousada()` |

### 3.5 — CSRF Token (Item 18)

**Recomendação:** Baixa prioridade. SameSite + CORS já são suficientes pelo modelo de ameaça atual (OWASP). Implementar apenas se necessário para compliance específico.

---

## Sequência de Migrations

```
006_optimistic_locking.sql       # Phase 1 — Item 1
007_cpf_encryption.sql           # Phase 1 — Item 2
008_hospedes_table.sql           # Phase 2 — Item 8
009_quartos_table.sql            # Phase 2 — Item 9
010_checkin_checkout.sql         # Phase 2 — Item 10
011_audit_pousada_id.sql         # Phase 2 — Item 11
012_notificacoes_table.sql       # Phase 2 — Item 6
```

## Grafo de Dependências

```
Phase 1 (independentes entre si):
  1.1 Pagination cap
  1.2 Error boundary
  1.3 Optimistic locking
  1.4 CPF encryption

Phase 2:
  2.7 Auditoria completa ──────────── (standalone, fazer primeiro)
  2.8 Backup automatizado ─────────── (standalone)
  2.9 Troca de senha ──────────────── (standalone, trivial)
  2.1 Quartos como entidade ────────── (standalone)
  2.2 Hóspede como entidade ────────── depende de 1.4 (CPF encryption) e 2.1 (quartos)
  2.3 Check-in/out ─────────────────── beneficia de 2.1 (quartos)
  2.4 Calendário ──────────────────── depende de 2.1 (quartos para eixo Y)
  2.5 Relatórios ──────────────────── beneficia de 2.1, 2.2, 2.3
  2.6 Notificações ────────────────── depende de 2.3 (check-in/out statuses)

Phase 3 (todos independentes):
  3.1, 3.2, 3.3, 3.4, 3.5 em qualquer ordem
```

## Resumo de Risco

| Item | Risco | Risco Principal |
|------|-------|-----------------|
| 1.1 Pagination | Muito baixo | Limites aditivos |
| 1.2 Error Boundary | Muito baixo | Aditivo |
| 1.3 Optimistic Lock | Baixo | Frontend antigo precisa de fallback |
| 1.4 CPF Encryption | Médio | Perda de chave = dados irrecuperáveis |
| 2.1 Quartos | Baixo | Auto-seed dos existentes |
| 2.2 Hóspedes | Médio | Migração de dados nome/cpf existentes |
| 2.3 Check-in/out | Baixo | Novos status, existentes inalterados |
| 2.4 Calendário | Baixo | Só frontend |
| 2.5 Relatórios | Baixo | Queries novas, não altera existente |
| 2.6 Notificações | Baixo | Schema novo, não altera existente |
| 3.4 Stale state | Baixo | Substitui reload por clear targeted |
