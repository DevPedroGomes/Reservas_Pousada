# Minha Pousada — Sistema de Reservas

Multi-tenant SaaS para gerenciamento de reservas em pousadas brasileiras.

## Stack

- **Backend:** Node.js + Express + TypeScript + Drizzle ORM + PostgreSQL 16
- **Frontend:** Next.js 14 + React + Tailwind CSS + shadcn/ui
- **Auth:** Better Auth (sessions via HTTPOnly cookies, Google OAuth)
- **Infra:** Docker multi-stage + Traefik v3 (HTTPS/Let's Encrypt)

## Funcionalidades

- RBAC multi-pousada (owner, admin, recepcao, auditoria, operacao)
- CRUD de reservas com validacao de CPF, conflitos de quarto e soft-delete
- Dashboard com estatisticas SQL-otimizadas (ocupacao, receita, check-ins)
- Export CSV com filtros, auditoria por reserva e convites de equipe por email
- Landing page animada com GSAP

## Desenvolvimento

```bash
# Backend
cd backend && npm install && npm run dev

# Frontend
cd frontend && npm install && npm run dev
```

## Deploy (Docker)

```bash
cd /opt/showcase/Reservas_Pousada
docker compose up -d --build
```

## URLs de Producao

- Frontend: https://minhapousada.pgdev.com.br
- API: https://api-pousada.pgdev.com.br
