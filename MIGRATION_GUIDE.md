# Guia de Migração: Supabase → PostgreSQL + Better Auth

Este guia descreve os passos para migrar o sistema de Supabase para PostgreSQL direto + Better Auth.

## Pré-requisitos

- Node.js 18+
- PostgreSQL instalado localmente (ou URL de conexão remota)
- Credenciais do Google OAuth (Google Cloud Console)

## 1. Configurar o Banco de Dados

### Criar o banco de dados

```bash
# Conectar ao PostgreSQL
psql -U postgres

# Criar o banco
CREATE DATABASE reservas_pousada;

# Conectar ao banco
\c reservas_pousada

# Executar a migration inicial
\i backend/migrations/001_initial_schema.sql
```

Ou via linha de comando:
```bash
psql -U postgres -c "CREATE DATABASE reservas_pousada;"
psql -U postgres -d reservas_pousada -f backend/migrations/001_initial_schema.sql
```

## 2. Configurar as Variáveis de Ambiente

### Backend (`backend/.env`)

```env
NODE_ENV=development
PORT=4000

# PostgreSQL
DATABASE_URL=postgresql://postgres:sua_senha@localhost:5432/reservas_pousada

# Better Auth
BETTER_AUTH_SECRET=gere-uma-chave-aleatoria-de-32-chars-minimo
BETTER_AUTH_URL=http://localhost:4000

# Google OAuth
GOOGLE_CLIENT_ID=seu-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-sua-google-client-secret

# CORS
CORS_ORIGIN=http://localhost:3000
```

### Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

## 3. Configurar Google OAuth

1. Acesse [Google Cloud Console](https://console.cloud.google.com/)
2. Crie ou selecione um projeto
3. Vá em **APIs & Services** > **Credentials**
4. Crie uma **OAuth 2.0 Client ID** (tipo: Web application)
5. Configure:
   - **Authorized JavaScript origins:**
     - `http://localhost:3000`
     - `http://localhost:4000`
   - **Authorized redirect URIs:**
     - `http://localhost:4000/api/auth/callback/google`
6. Copie o Client ID e Client Secret para o `.env`

## 4. Instalar Dependências

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

## 5. Executar o Sistema

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

## 6. Verificar a Instalação

1. Acesse `http://localhost:4000/health` - deve retornar `{"status":"online",...}`
2. Acesse `http://localhost:3000` - deve mostrar a página de login
3. Teste o login com Google
4. Complete o onboarding criando uma pousada

## Estrutura de Arquivos Modificados

### Backend (TypeScript)

```
backend/
├── server.ts                 # Servidor Express + Better Auth
├── tsconfig.json            # Configuração TypeScript
├── drizzle.config.ts        # Configuração Drizzle Kit
├── package.json             # Dependências atualizadas
├── .env.example             # Template de variáveis
├── db/
│   ├── index.ts             # Conexão PostgreSQL + Drizzle
│   └── schema.ts            # Schema Drizzle (todas as tabelas)
├── lib/
│   └── auth.ts              # Configuração Better Auth
├── models/
│   ├── Usuario.ts           # Model de usuário (Drizzle)
│   ├── Reserva.ts           # Model de reserva (Drizzle)
│   ├── Pousada.ts           # Model de pousada (Drizzle)
│   └── Auditoria.ts         # Model de auditoria (Drizzle)
├── routes/
│   ├── reservas.ts          # Rotas de reservas (TypeScript)
│   └── pousadas.ts          # Rotas de pousadas (TypeScript)
├── middleware/
│   ├── auth.ts              # Middleware Better Auth
│   ├── activity.ts          # Logger de atividades
│   └── errorHandler.ts      # Handler de erros
├── utils/
│   └── validation.ts        # Validações (TypeScript)
└── migrations/
    └── 001_initial_schema.sql
```

### Frontend (Next.js)

```
frontend/
├── package.json             # Sem @supabase/supabase-js
├── .env.example
└── lib/
    ├── auth-client.ts       # Cliente Better Auth
    ├── api.ts               # Fetch com cookies
    └── types.ts             # Tipos atualizados (id: string)
└── hooks/
    └── useAuth.ts           # Hook de autenticação (Better Auth)
└── app/auth/callback/
    └── page.tsx             # Callback OAuth simplificado
```

## Diferenças Principais

| Aspecto | Antes (Supabase) | Depois (Better Auth) |
|---------|------------------|---------------------|
| Auth Backend | JWT manual + bcrypt | Better Auth |
| Auth Frontend | Supabase Auth SDK | Better Auth Client |
| OAuth | Supabase OAuth | Better Auth OAuth |
| Tokens | Bearer tokens manuais | Cookies automáticos |
| User ID | `number` (SERIAL) | `string` (UUID) |
| ORM | Supabase SDK | Drizzle ORM |
| Database | Supabase hosted | PostgreSQL direto |

## Comandos Úteis

```bash
# Gerar migrations Drizzle
cd backend
npm run db:generate

# Aplicar migrations Drizzle
npm run db:migrate

# Push schema (dev)
npm run db:push

# Drizzle Studio (visualizar banco)
npm run db:studio
```

## Troubleshooting

### Erro: "BETTER_AUTH_SECRET não definido"
- Verifique se o arquivo `.env` existe e tem a variável configurada
- A secret deve ter pelo menos 32 caracteres

### Erro de CORS
- Verifique se `CORS_ORIGIN` está configurado corretamente
- O frontend deve estar no domínio permitido

### Google OAuth não funciona
- Verifique se as URLs de callback estão corretas no Google Console
- O redirect URI deve ser `http://localhost:4000/api/auth/callback/google`

### Cookies não estão sendo enviados
- Verifique se `credentials: 'include'` está nos requests
- Verifique as configurações de CORS (`credentials: true`)

## Rollback (se necessário)

Os arquivos antigos `.js` não foram removidos. Para voltar ao sistema anterior:

1. Reverta o `package.json` do backend e frontend
2. Execute `npm install` em ambos
3. Use os arquivos `.js` ao invés dos `.ts`
