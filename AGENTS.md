# Repository Guidelines

## Project Structure & Module Organization
- Root: `backend` (Express API), `public` (vanilla JS UI), `supabase_setup.sql` (schema/RLS for Supabase).
- `backend/server.js` inicia a API, aplica headers de segurança, rate limiting e serve o frontend.
- Rotas em `backend/routes/`: `auth.js` para login/JWT e `reservas.js` para CRUD, usando middlewares compartilhados.
- Modelos em `backend/models/*.js`, conexão e utilitários de banco em `backend/database/db.js`, segurança em `backend/config/security.js`, validação/sanitização em `backend/utils/validation.js`, e backups via `backend/backup.js` (saídas em `backend/backup/`).
- Frontend estático em `public/index.html`, `public/js/` e `public/css/`, servido pelo Express.

## Build, Test, and Development Commands
- Instalação: `cd backend && npm install` (Node >= 14).
- Desenvolvimento: `npm run dev` para recarga automática com nodemon e leitura do `.env`.
- Execução padrão: `npm start` para subir o servidor HTTP.
- Backup: `npm run backup` para exportar dados do Supabase; não versione os arquivos gerados.
- Verificação rápida: `curl http://localhost:3000/health` após o boot para checar ambiente/config.

## Coding Style & Naming Conventions
- JavaScript CommonJS com aspas simples e indentação de 2 espaços; prefira `const`/`let` e arrow functions para middlewares/helpers.
- Preserve terminologia e respostas em português (`sucesso`, `mensagem`, `reservas`) para consistência da API.
- Centralize validações e sanitização em `utils/validation.js` em vez de lógica inline.
- Alterações de segurança (headers, rate limiting) devem ocorrer em `config/security.js` ou `server.js`, sempre com justificativa clara.

## Testing Guidelines
- Ainda não há suíte automatizada; ao adicionar, use Jest + Supertest para rotas e middlewares.
- Salve testes em `backend/tests` ou ao lado do módulo como `<modulo>.spec.js`; cubra autenticação, expiração de JWT, utilitários de validação e fluxos CRUD de reservas.
- Atualize o script `npm test` para rodar a suíte e documente fixtures/env necessários.

## Commit & Pull Request Guidelines
- Commits curtos e descritivos, alinhados ao histórico (`Security implemented`, `Update README.md`); título em tempo presente e até 72 caracteres.
- PRs devem incluir resumo do objetivo, áreas alteradas, passos de verificação realizados e mudanças de ambiente/segurança.
- Para ajustes de frontend, anexe screenshots/GIFs; referencie issues ou TODOs relevantes.

## Security & Configuration Tips
- `.env` obrigatório: `JWT_SECRET` (o servidor encerra sem ele), `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `CORS_ORIGIN`, `PORT`; nunca versione secrets ou backups.
- Execute `supabase_setup.sql` no Supabase antes do primeiro boot para aplicar schema e políticas RLS.
- Novas rotas devem ficar atrás do middleware de autenticação e do rate limiting; registre ações sensíveis via `activityLogger`.
