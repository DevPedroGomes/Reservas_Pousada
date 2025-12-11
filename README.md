# Sistema de Reservas - Pousada

Backend Express + Supabase e frontend Next.js (App Router) para gerenciar 25 quartos com segurança empresarial (JWT access/refresh, auditoria, rate limiting, validação de datas/CPF, RLS).

## Stack
- **Backend:** Node.js, Express, Supabase (PostgreSQL), JWT (access + refresh), bcryptjs, rate limiting, validação/sanitização centralizada.
- **Frontend:** Next.js 14, Tailwind/shadcn-like, TypeScript, lucide-react. Fluxo com refresh/logout, filtros/paginação, export CSV e histórico de auditoria.

## Estrutura
- `backend/` — API Express (`/api`), rotas de auth/reservas com auditoria e RBAC (roles: `admin`, `recepcao`, `auditoria`, `operacao`).
- `frontend/` — UI Next.js consumindo a API.
- `supabase_setup.sql` — tabelas: `usuarios`, `reservas`, `logs` (auditoria), `refresh_tokens` (sessões), índices e políticas RLS.

## Requisitos
- Node.js >= 18
- Conta Supabase e executar `supabase_setup.sql`

## Configuração
1) Backend  
```bash
cd backend
npm install
```
`.env` exemplo:  
```
NODE_ENV=development
PORT=4000
JWT_SECRET=sua_chave_jwt_super_secreta
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=sua_anon_key
CORS_ORIGIN=http://localhost:3000
ACCESS_TOKEN_TTL=1h
REFRESH_TTL_DAYS=7
```
Rodar: `npm start` (API em `http://localhost:4000/api`).

2) Frontend  
```bash
cd ../frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:4000/api" > .env.local
npm run dev  # http://localhost:3000
```

## Uso
- Login em `/auth/login` retorna `token` e `refresh_token` (guardados no front).  
- Fluxos de reservas: filtros (status/pago/período/busca), paginação, export CSV, auditoria por reserva.  
- Auditoria e RBAC: apenas roles permitidas acessam/alteram; deletar reserva exige `admin`.

## Produção (resumo)
- Aplicar `supabase_setup.sql` e RLS.
- Definir `JWT_SECRET` forte e variáveis de ambiente corretas.
- Configurar CORS para o domínio do frontend e HTTPS/HSTS.
- Revisar logs/auditoria e backups do banco.
