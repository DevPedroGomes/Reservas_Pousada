# Plano de correção e evolução — out/2026

Origem: auditoria de 2026-10-03 (código, banco, infra, produto e go-to-market).
Cada item vira um commit (ou poucos) no branch de trabalho, com typecheck e
testes verdes antes do push. Itens que dependem de decisão ou conta externa
(gateway Pix, WhatsApp Business, domínio, dados da empresa) ficam atrás de
variável de ambiente: o código entra desligado e nada muda em produção até
alguém ligar.

Legenda: **[P0]** bloqueia produção · **[P1]** robustez · **[LG]** LGPD/legal ·
**[MK]** marketing/ativação · **[PR]** produto (paridade) · **[DF]** diferencial

---

## Fase 0 — Bloqueadores

| # | Item | Arquivos principais |
|---|------|---------------------|
| 0.1 | **[P0]** Atualizar dependências com CVE: better-auth 1.7.x (roubo de conta via OAuth + e-mail não verificado), Next 15.5.x + React 19 (RCE/DoS), drizzle-orm ≥0.45.2, express 4.22.x | `backend/package.json`, `frontend/package.json` |
| 0.2 | **[P0]** Exigir verificação de e-mail; parar de pedir token offline do Google; admin do SaaS só com e-mail verificado | `backend/lib/auth.ts`, `middleware/admin.ts` |
| 0.3 | **[P0]** Erro assíncrono não derruba o processo: handlers async protegidos + `unhandledRejection` logado | `server.ts`, `routes/billing.ts` |
| 0.4 | **[P0]** Webhook do Stripe: idempotência na mesma transação dos efeitos; assinatura sempre relida do Stripe (eventos fora de ordem) | `routes/stripe-webhook.ts`, `models/Assinatura.ts` |
| 0.5 | **[P0]** Checkout não cria segunda assinatura; troca de plano pelo portal; customer criado uma vez só (lock) | `routes/billing.ts`, `app/assinatura/page.tsx` |
| 0.6 | **[P0]** Plano Rede real: pousadas adicionais cobertas pela assinatura do dono; `maxPousadas` aplicado na criação | `models/Assinatura.ts`, `middleware/assinatura.ts`, `routes/pousadas.ts`, migration |
| 0.7 | **[P0]** Quarto validado contra a pousada; não reduzir quartos abaixo de reservas vigentes | `routes/reservas.ts`, `routes/pousadas.ts` |
| 0.8 | **[P0]** Pousada ativa por aba (header `X-Pousada-Id` validado contra o vínculo); papel lido do vínculo, não do usuário | `middleware/auth.ts`, `frontend/lib/api.ts`, `hooks/useAuth.ts` |
| 0.9 | **[P0]** Remover vínculo por `user_id` (só convite); limite de usuários conta convites pendentes | `routes/pousadas.ts` |
| 0.10 | **[P0]** CPF mínimo necessário: listagem mascarada, CPF completo só no detalhe para quem opera; conflito 409 sem dados de outras reservas | `models/Reserva.ts`, `routes/reservas.ts` |
| 0.11 | **[P0]** `/health` responde 503 sem banco; `/health/live` separado | `server.ts` |

## Fase 0b — Robustez operacional

| # | Item |
|---|------|
| 0.12 | **[P1]** Pool configurável (tamanho/timeout por env), `statement_timeout`, limite de memória do Node coerente com o container |
| 0.13 | **[P1]** Rate limit com store no Postgres (pronto para 2+ réplicas) e limites que não punem a pousada atrás de um único IP |
| 0.14 | **[P1]** Deploy: imagem com tag do commit (rollback), sem `container_name` fixo, runbook de rollback |
| 0.15 | **[P1]** Observabilidade: Sentry opcional (`SENTRY_DSN`), request-id em todo log, alerta por healthcheck |
| 0.16 | **[P1]** Fila de jobs no Postgres (pg-boss): e-mails com retry, limpeza de sessão, finalização automática de estadias, lembretes |
| 0.17 | **[P1]** E-mail: falha visível, retry pela fila, remetente e reply-to por env, template com a marca |
| 0.18 | **[P1]** Sanitização que não corrompe texto (apóstrofo, &); remover script de CPF com hash errado |
| 0.19 | **[P1]** Sincronização entre recepcionistas: refetch ao focar a aba + polling leve |
| 0.20 | **[P1]** Endpoint de agenda (chegadas/saídas/hospedados) — corrige "próximas reservas" |
| 0.21 | **[P1]** Telas que faltam: editar pousada, listar/remover equipe, trocar papel |
| 0.22 | **[P1]** Navegação por URL (rotas reais) e landing separada do painel |
| 0.23 | **[P1]** Testes HTTP de autorização e isolamento entre pousadas |

## Fase 0c — LGPD e base de marketing

| # | Item |
|---|------|
| 0.24 | **[LG]** Páginas de privacidade e termos (dados da empresa por env), banner de consentimento, rodapé com contato |
| 0.25 | **[LG]** Titular: exportar e excluir a própria conta; retenção/anonimização de hóspedes configurável |
| 0.26 | **[MK]** Landing SSR: promessas corrigidas, seção de preços, metadados/OG, sitemap/robots, sem seção de stack |
| 0.27 | **[MK]** Medição: GA4 / Meta Pixel só após consentimento, UTM gravada no cadastro, eventos de funil |
| 0.28 | **[MK]** Onboarding enxuto (nome + quartos), resto depois |

## Fase 1 — Paridade de produto

| # | Item |
|---|------|
| 1.1 | **[PR]** Quartos como cadastro (nome, tipo, capacidade, preço base, ativo) |
| 1.2 | **[PR]** Mapa de ocupação (grade de calendário) |
| 1.3 | **[PR]** Hóspede como cadastro (WhatsApp, e-mail, CPF **ou** passaporte, nacionalidade, histórico); nº de hóspedes e canal na reserva |
| 1.4 | **[PR]** Pagamentos da reserva (sinal, parciais, forma, saldo) e consumo extra |
| 1.5 | **[PR]** Ciclo de status: pré-reserva → confirmada → hospedada → finalizada / cancelada / no-show, com expiração da pré-reserva |
| 1.6 | **[PR]** Tarifário (temporada, dia da semana, mínimo de noites) e valor sugerido |
| 1.7 | **[PR]** iCal por quarto (exportar e importar de Booking/Airbnb) |
| 1.8 | **[PR]** Relatórios: ocupação, ADR, RevPAR, receita por canal, a receber |
| 1.9 | **[PR]** Importação de planilha (CSV) |

## Fase 2 — Diferenciais

| # | Item |
|---|------|
| 2.1 | **[DF]** Motor de reservas público por pousada (`/r/<slug>`) gerando pré-reserva |
| 2.2 | **[DF]** Pix para o sinal (gateway atrás de interface; confirma a reserva pelo webhook) |
| 2.3 | **[DF]** WhatsApp: links prontos (wa.me) já; API oficial atrás de env |
| 2.4 | **[DF]** Pré-check-in online com os campos da FNRH |
| 2.5 | **[DF]** PWA instalável para o dono |
| 2.6 | **[DF]** Recepcionista IA no WhatsApp — só depois de 2.2/2.3 e cobrança ativa (ver `docs/chat-ia-dashboard.md`) |

## Fora do código (ação do dono do produto)

- Registrar domínio próprio e e-mail da marca; configurar SPF/DKIM/DMARC no Resend.
- Dados da empresa (razão social, CNPJ, endereço, e-mail do encarregado LGPD) para as variáveis das páginas legais — e revisão jurídica dos textos.
- Testar restauração do backup da `central-db`; guardar `CPF_ENCRYPTION_KEY` fora do backup.
- Conta de gateway Pix, Meta Business (WhatsApp), GA4/Meta Ads, Sentry.
- Ligar `BILLING_ENABLED` só depois da Fase 0 completa.
