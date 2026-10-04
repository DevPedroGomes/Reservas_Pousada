# Deploy do Diária em produção — passo a passo completo

Tudo o que precisa ser configurado fora do código, na ordem em que vale a pena
fazer. Cada passo diz **onde** clicar, **o que** copiar e **para qual
variável** vai.

> Convenção: **[VPS]** = arquivo `.env` ao lado do `docker-compose.yml` na
> VPS. **[GitHub]** = GitHub → repositório → *Settings → Secrets and variables
> → Actions → aba **Variables***. Os valores `NEXT_PUBLIC_*` vão no GitHub
> porque a imagem do frontend é buildada lá (o runner não lê o `.env` da VPS).

---

## 0. Como o deploy funciona hoje

```
push na main ──> GitHub Actions: testes ──> build das imagens ──> GHCR (tags <sha> e latest)
                                                                  │
VPS: auto-pull do latest ──> docker compose (Traefik + backend + frontend) ──> central-db (Postgres)
```

- Domínios: `https://diaria.pgdev.com.br` (app) e `https://api.diaria.pgdev.com.br` (API).
- As migrations rodam sozinhas quando a API sobe; se alguma falha, a API não
  sobe (de propósito).
- Mudou o `.env` da VPS → `docker compose up -d` (recria só o que mudou).
- Mudou uma variável **[GitHub]** → é preciso **buildar de novo**: *Actions →
  "Build & push image (VPS auto-pulls)" → Run workflow* (ou qualquer push na
  `main`).
- Rollback para uma versão exata: README, seção *Release and rollback*.

### O que é obrigatório e o que é opcional

| Serviço | Para quê | Obrigatório? |
|---|---|---|
| Segredos da VPS | a API nem sobe sem eles | **sim** |
| Resend (e-mail) | confirmar cadastro, redefinir senha, convites, avisos | **sim** (sem ele ninguém novo entra) |
| Dados da empresa | política de privacidade e termos | **sim** (antes de divulgar) |
| Backup + cópia das chaves | não perder os dados | **sim** |
| Monitor de uptime + Sentry | saber da queda antes do cliente | **sim** |
| Google OAuth | "Continuar com Google" | opcional (recomendado) |
| Stripe | cobrar a assinatura | quando for cobrar |
| GA4 / Meta Pixel | medir anúncios | opcional |
| Meta (WhatsApp) + Anthropic | WhatsApp da pousada e atendente virtual | opcional |
| Asaas | Pix automático | nada global: cada pousada liga a dela |

---

## 1. Segredos da VPS **[VPS]** — obrigatório

Gere na sua máquina e cole no `.env`:

```bash
openssl rand -base64 32   # BETTER_AUTH_SECRET
openssl rand -hex 32      # CPF_ENCRYPTION_KEY (64 caracteres hex)
openssl rand -base64 24   # POSTGRES_PASSWORD (se ainda não existe)
```

| Variável | Observação |
|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | o banco precisa existir na `central-db` |
| `BETTER_AUTH_SECRET` | assina as sessões; trocar desloga todo mundo |
| `CPF_ENCRYPTION_KEY` | cifra CPF, documentos, tokens de integração e mensagens do WhatsApp |
| `APP_TIMEZONE` | `America/Sao_Paulo` |

⚠️ **Se esses valores já estão na VPS, não troque.** `CPF_ENCRYPTION_KEY` nova
torna ilegíveis todos os CPFs, fichas de pré-check-in, chaves do Asaas e
tokens do WhatsApp já gravados.

**Guarde `CPF_ENCRYPTION_KEY` e `BETTER_AUTH_SECRET` num cofre de senhas
(Bitwarden, 1Password), fora do backup do banco.** Backup sem a chave não
recupera os dados cifrados; chave junto do backup não protege nada.

---

## 2. E-mail — Resend **[VPS]** — obrigatório e urgente

O login exige e-mail confirmado. Sem Resend o link não é enviado e **nenhum
cadastro novo consegue entrar**. Quem já tinha conta e nunca confirmou o
e-mail também fica preso (o sistema reenvia o link no login, mas sem Resend
ele não sai).

1. Crie a conta em <https://resend.com>.
2. **Domains → Add domain** → `pgdev.com.br` (ou o domínio da marca, quando
   tiver).
3. O Resend mostra os registros DNS (DKIM em `resend._domainkey`, MX e SPF
   num subdomínio de envio). Crie todos no seu DNS e clique em **Verify**.
4. Crie também o DMARC no DNS (se ainda não existe):
   `_dmarc.pgdev.com.br  TXT  "v=DMARC1; p=none; rua=mailto:seu-email@..."`
   (depois de algumas semanas sem problema, suba para `p=quarantine`).
5. **API Keys → Create API key** → permissão *Sending access*, restrita ao
   domínio → copie.
6. No `.env`:
   ```
   RESEND_API_KEY=re_...
   EMAIL_FROM=Diária <noreply@pgdev.com.br>
   EMAIL_REPLY_TO=contato@seudominio.com.br
   ```
7. `docker compose up -d backend` e veja no log:
   `[Email] Resend configurado com sucesso`.
8. Teste: cadastre-se com um e-mail seu → o e-mail chega → o link abre o
   onboarding. Em *Resend → Emails* aparece cada envio.

**Usuários antigos (opcional).** Se as contas criadas antes desta versão são
todas de gente que você conhece, dá para marcá-las como confirmadas:

```bash
docker exec -it central-db psql -U <POSTGRES_USER> -d <POSTGRES_DB> \
  -c "UPDATE \"user\" SET email_verified = true WHERE email_verified = false AND created_at < '2026-10-04';"
```

Só faça isso se confiar nessas contas: a confirmação existe justamente para
ninguém se cadastrar com o e-mail de outra pessoa.

---

## 3. Dados da empresa e páginas legais **[GitHub]** — obrigatório

As páginas `/privacidade` e `/termos` mostram **"[a definir]"** até isso ser
preenchido (de propósito, para não ir ao ar com dado inventado).

1. GitHub → repositório → *Settings → Secrets and variables → Actions →*
   aba **Variables** → **New repository variable**, uma por linha:

   | Variable | Exemplo |
   |---|---|
   | `NEXT_PUBLIC_EMPRESA_RAZAO_SOCIAL` | PG Dev Tecnologia Ltda |
   | `NEXT_PUBLIC_EMPRESA_CNPJ` | 12.345.678/0001-90 |
   | `NEXT_PUBLIC_EMPRESA_ENDERECO` | Rua ..., nº, cidade/UF, CEP |
   | `NEXT_PUBLIC_EMPRESA_FORO` | Comarca de ... /UF |
   | `NEXT_PUBLIC_CONTATO_EMAIL` | contato@... |
   | `NEXT_PUBLIC_PRIVACIDADE_EMAIL` | privacidade@... (encarregado LGPD) |
   | `NEXT_PUBLIC_ENCARREGADO_NOME` | nome do encarregado (DPO) |

2. *Actions → "Build & push image (VPS auto-pulls)" → Run workflow* (branch
   `main`). Quando terminar, a VPS puxa a imagem nova.
3. Confira `https://diaria.pgdev.com.br/privacidade` — nenhum "[a definir]".
4. **Peça a um advogado para revisar** a política e os termos.

---

## 4. Backup **[VPS]** — obrigatório

A `central-db` é compartilhada e o backup dela não está neste repositório.
Garanta, no mínimo:

1. **Dump diário** do banco do Diária, comprimido, enviado para fora da VPS
   (Backblaze B2, Cloudflare R2, S3...). Exemplo com cron + rclone:
   ```cron
   0 3 * * * docker exec central-db pg_dump -U <POSTGRES_USER> -Fc <POSTGRES_DB> > /backups/diaria-$(date +\%F).dump && rclone copy /backups remote:diaria-backups --max-age 25h && find /backups -name 'diaria-*.dump' -mtime +7 -delete
   ```
   Retenção sugerida no destino: 7 diários, 4 semanais, 6 mensais.
2. **Teste de restauração** (agora e depois uma vez por mês):
   ```bash
   docker exec central-db createdb -U <POSTGRES_USER> diaria_restore_teste
   docker exec -i central-db pg_restore -U <POSTGRES_USER> -d diaria_restore_teste < /backups/diaria-AAAA-MM-DD.dump
   docker exec central-db psql -U <POSTGRES_USER> -d diaria_restore_teste -c "select count(*) from reservas"
   docker exec central-db dropdb -U <POSTGRES_USER> diaria_restore_teste
   ```
3. As chaves do passo 1 no cofre de senhas (não no bucket do backup).

---

## 5. Monitoramento **[VPS]** — obrigatório

**Uptime** (UptimeRobot, Better Stack ou similar, plano grátis serve):
- Monitor HTTP(S) em `https://api.diaria.pgdev.com.br/health`, a cada 1–5 min,
  esperando status 200 e a palavra `healthy`. Ele responde **503** quando o
  banco cai — é o alerta que importa.
- Monitor em `https://diaria.pgdev.com.br`.
- Alerta de vencimento do certificado.
- Avisos por e-mail + Telegram/WhatsApp.

**Sentry** (erros):
1. <https://sentry.io> → *Create project* → plataforma **Node.js / Express** →
   nome `diaria-api`.
2. Copie o **DSN** → `SENTRY_DSN=https://...@...ingest.sentry.io/...` **[VPS]**.
3. `docker compose up -d backend`. Erros do navegador também chegam (vão pela
   API, em `/api/telemetria`), sem cookies, corpo ou dados de hóspedes.
4. *Alerts*: deixe o alerta de "new issue" por e-mail.

**Admin do SaaS** **[VPS]**:
- `ADMIN_EMAILS=seu@email.com` (vê `/admin/margem`; vazio = ninguém).
- `CUSTO_INFRA_MENSAL_CENTAVOS=10000` (ex.: R$ 100/mês de VPS etc.).

---

## 6. Login com Google **[VPS]** — opcional (recomendado)

O código já está pronto: o botão "Continuar com Google" aparece **sozinho**
quando as duas variáveis abaixo estão preenchidas na API. Convidado que entra
pelo Google cai direto no convite; cancelamento ou erro volta para a tela de
login com a mensagem; só são pedidos nome, e-mail e foto (sem acesso
permanente à conta Google).

1. <https://console.cloud.google.com> → crie um projeto **Diaria**.
2. Menu → **Google Auth Platform** (antigo "Tela de consentimento OAuth") →
   **Get started**:
   - Nome do app: **Diária**; e-mail de suporte: o seu.
   - Público (*Audience*): **Externo**.
   - E-mail de contato do desenvolvedor → concordar → criar.
3. **Branding** (Marca):
   - Página inicial: `https://diaria.pgdev.com.br`
   - Política de privacidade: `https://diaria.pgdev.com.br/privacidade`
   - Termos de serviço: `https://diaria.pgdev.com.br/termos`
   - Domínios autorizados: `pgdev.com.br`
   - Logo: opcional. **Com logo, o Google exige verificação da marca (alguns
     dias)**; sem logo, pode publicar na hora.
4. **Data access** (Acesso a dados): os escopos usados são `openid`,
   `.../auth/userinfo.email` e `.../auth/userinfo.profile` — todos não
   sensíveis, sem revisão do Google.
5. **Audience → Publish app** (colocar **Em produção**). Em "Teste", só os
   e-mails cadastrados como testadores conseguem entrar.
6. **Clients → Create client** → tipo **Aplicativo da Web** → nome
   "Diária produção":
   - Origens JavaScript autorizadas: `https://diaria.pgdev.com.br`
   - URIs de redirecionamento autorizados:
     `https://api.diaria.pgdev.com.br/api/auth/callback/google`
   - Criar → **copie o Client ID e o Client secret na hora** (o Google pode não
     mostrar o secret de novo; baixe o JSON).
7. No `.env` **[VPS]**:
   ```
   GOOGLE_CLIENT_ID=....apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-...
   ```
8. `docker compose up -d backend` → `https://api.diaria.pgdev.com.br/api/config`
   deve responder `"google":true` → o botão aparece em `/entrar` e `/cadastro`.
9. Teste: entrar com uma conta Google nova (vai para o onboarding) e com um
   link de convite (vai para o convite).

Para desenvolvimento local, crie **outro** client com a origem
`http://localhost:3000` e o redirecionamento
`http://localhost:4000/api/auth/callback/google`.

---

## 7. Cobrança — Stripe **[VPS]** — quando for cobrar

O teste grátis de 14 dias é do próprio Diária (sem cartão): **não configure
trial no Stripe**. Faça tudo primeiro em **modo de teste**, depois repita em
modo live (chaves, preços e webhook são diferentes em cada modo).

1. <https://dashboard.stripe.com> → **Ativar pagamentos**: dados da empresa
   (CNPJ), responsável, conta bancária para os repasses.
2. **Configurações → Detalhes públicos da empresa**: nome **Diária**, e-mail
   e telefone de suporte, site, descrição na fatura do cartão (ex.: `DIARIA`).
3. **Catálogo de produtos → Adicionar produto**, três produtos, cada um com
   dois preços **recorrentes em BRL**:

   | Produto | Mensal | Anual | Variáveis |
   |---|---|---|---|
   | Essencial | R$ 89,00 | R$ 890,00 | `STRIPE_PRICE_ESSENCIAL_MENSAL` / `_ANUAL` |
   | Pousada | R$ 149,00 | R$ 1.490,00 | `STRIPE_PRICE_POUSADA_MENSAL` / `_ANUAL` |
   | Rede | R$ 299,00 | R$ 2.990,00 | `STRIPE_PRICE_REDE_MENSAL` / `_ANUAL` |

   Copie o id de cada preço (`price_...`). Plano sem preço configurado não
   aparece na tela de planos.
4. **Desenvolvedores → Webhooks → Adicionar destino**:
   - URL: `https://api.diaria.pgdev.com.br/api/webhooks/stripe`
   - Eventos: `checkout.session.completed`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted`,
     `invoice.paid`, `invoice.payment_failed`
   - Copie o **segredo de assinatura** (`whsec_...`) → `STRIPE_WEBHOOK_SECRET`.
5. **Desenvolvedores → Chaves de API** → chave secreta (`sk_test_...` /
   `sk_live_...`) → `STRIPE_SECRET_KEY`.
6. **Configurações → Billing → Portal do cliente** (o botão "Abrir portal de
   assinatura", na tela de assinatura do Diária, abre este portal) → ative:
   - atualizar forma de pagamento e ver faturas;
   - cancelar assinatura (no fim do período);
   - **trocar de plano**: adicione os três produtos com os seus preços;
   - links de termos e privacidade; link de retorno
     `https://diaria.pgdev.com.br/assinatura`.
7. **Configurações → E-mails para clientes**: recibos de pagamento e aviso de
   pagamento com falha. Em **Billing → Recuperação de receita**, deixe as
   novas tentativas automáticas (Smart Retries) ligadas.
8. No `.env` **[VPS]**: as chaves, os 6 preços e, quando quiser começar a
   cobrar, `BILLING_ENABLED=true` → `docker compose up -d backend`.
9. Teste em modo de teste: assine com o cartão `4242 4242 4242 4242`
   (validade futura, qualquer CVC) → a assinatura fica ativa no Diária em
   segundos → `/admin/margem` mostra o cliente. Em *Webhooks*, as entregas
   devem estar todas com 200.
10. **Ir para live**: troque `STRIPE_SECRET_KEY`, recrie o webhook no modo live
    (segredo novo), recrie os preços no live (ids novos) e atualize o `.env`.

---

## 8. Medição — GA4 e Meta Pixel — opcional

Os rastreadores só carregam **depois do consentimento** do visitante (banner
de cookies). Eventos de funil enviados: `sign_up`, `pousada_criada`,
`reserva_criada`, `begin_checkout`, `purchase` (GA4) e
`CompleteRegistration`, `StartTrial`, `InitiateCheckout`, `Subscribe` (Meta).
A conversão de pagamento também sai pelo **servidor**, só para quem consentiu
com anúncios no cadastro.

**GA4**
1. <https://analytics.google.com> → *Administrador → Criar propriedade* →
   *Fluxo de dados da Web* → `https://diaria.pgdev.com.br`.
2. **ID da métrica** (`G-XXXXXXX`) → `NEXT_PUBLIC_GA_ID` **[GitHub]** e
   `GA_MEASUREMENT_ID` **[VPS]**.
3. No fluxo de dados → *Chaves secretas da API do Measurement Protocol* →
   criar → `GA_API_SECRET` **[VPS]**.
4. *Administrador → Eventos*: marque `sign_up` e `purchase` como eventos
   principais (conversões).

**Meta Pixel + API de Conversões**
1. <https://business.facebook.com> → *Gerenciador de Eventos → Conectar
   fontes de dados → Web → Pixel*.
2. **ID do pixel** → `NEXT_PUBLIC_META_PIXEL_ID` **[GitHub]** e
   `META_PIXEL_ID` **[VPS]**.
3. No pixel → *Configurações → API de Conversões → Gerar token de acesso* →
   `META_CAPI_TOKEN` **[VPS]**.
4. *Configurações do negócio → Segurança da marca → Domínios* → adicione e
   verifique `pgdev.com.br` (registro TXT no DNS).

Depois: **Run workflow** (passo 3) para as `NEXT_PUBLIC_*` entrarem no build,
e `docker compose up -d backend` para as da VPS.

---

## 9. WhatsApp Business das pousadas + atendente virtual — opcional

Passo a passo completo em **[`docs/whatsapp-meta.md`](whatsapp-meta.md)**.
Resumo:

1. Use o portfólio **já verificado** da sua software house (a verificação vale
   para todos os produtos).
2. Crie **um app só para o Diária** (tipo Empresa) no mesmo portfólio, com os
   produtos WhatsApp e *Facebook Login for Business* — o cliente vê "Diária"
   no cadastro, e um problema em outro produto não derruba este.
3. Configuração do **Embedded Signup** → `META_CONFIG_ID`.
4. **Webhook** do app: `https://api.diaria.pgdev.com.br/api/webhooks/whatsapp`,
   token = `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (`openssl rand -hex 24`), campos
   `messages` e `smb_message_echoes`.
5. `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID`,
   `WHATSAPP_WEBHOOK_VERIFY_TOKEN` **[VPS]**.
6. **App Review** das permissões `whatsapp_business_management` e
   `whatsapp_business_messaging` (com vídeo). Até aprovar, só contas com papel
   no app conseguem conectar — teste com a sua pousada.

**Atendente virtual (Anthropic)**
1. <https://console.anthropic.com> → crie um *workspace* "Diária" → *API
   Keys → Create key* → `AGENTE_API_KEY` **[VPS]**.
2. Em *Limits/Billing*, defina um **limite de gasto mensal**.
3. `AGENTE_LIMITE_DIARIO=300` (respostas por pousada em 24h; acima disso a
   conversa vai para a equipe).
4. Opcional: `AGENTE_MODELO` (padrão `claude-haiku-4-5-20251001`), ou
   `AGENTE_PROVEDOR=openai` + `AGENTE_BASE_URL` para uma API compatível.

---

## 10. Pix das pousadas — Asaas — nada global

Cada pousada configura a própria conta em *Configurações → Pix para o sinal*:
a chave Pix (QR copia e cola, confirmação manual) e, se quiser, a chave de
API do Asaas (confirmação automática). O webhook é registrado sozinho na conta
dela, apontando para `https://api.diaria.pgdev.com.br/api/webhooks/pix/asaas/...`.
Do seu lado, só garanta que a API está pública em HTTPS (já está).

---

## 11. Colocar no ar e conferir

1. **VPS**: `.env` revisado (passos 1, 2, 5 e os opcionais que você ligou) →
   ```bash
   docker compose pull && docker compose up -d
   docker compose logs -f backend
   ```
   No log, espere ver:
   - `[migrate] aplicada 025_whatsapp_business.sql` (na primeira subida desta versão);
   - `[Fila] pg-boss iniciado`;
   - `[Email] Resend configurado com sucesso`.
2. **GitHub**: Variables do passo 3 (e 8) → *Run workflow* → a VPS puxa o
   frontend novo (ou `docker compose pull frontend && docker compose up -d frontend`).
3. **Teste de ponta a ponta em produção** (com um e-mail seu):
   - [ ] `https://api.diaria.pgdev.com.br/health` → `healthy`
   - [ ] cadastro por e-mail → e-mail chega → onboarding → pousada criada
   - [ ] "Continuar com Google" (se ligou o passo 6)
   - [ ] convidar alguém da equipe → o convite chega → a pessoa entra
   - [ ] criar quarto com preço, reserva, check-in e check-out
   - [ ] ligar a página pública (`/r/<endereço>`) e fazer um pedido de outro navegador
   - [ ] cadastrar a chave Pix e gerar o Pix de uma pré-reserva
   - [ ] gerar o link de pré-check-in e preencher pelo celular
   - [ ] instalar o app (PWA) no celular
   - [ ] `/privacidade` e `/termos` sem "[a definir]"
   - [ ] assinatura em modo de teste (se ligou o passo 7)
   - [ ] o monitor de uptime está verde e o projeto do Sentry está criado com o DSN na VPS
4. **Rollback**, se algo der errado: `IMAGE_TAG=<sha anterior>` no `.env` →
   `docker compose pull backend frontend && docker compose up -d backend frontend`
   (README → *Release and rollback*). Migrations não voltam: por isso cada
   versão é compatível com a anterior.

---

## Apêndice — todas as variáveis

| Variável | Onde | Obrigatória | Passo |
|---|---|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | VPS | sim | 1 |
| `BETTER_AUTH_SECRET` | VPS | sim | 1 |
| `CPF_ENCRYPTION_KEY` | VPS | sim | 1 |
| `APP_TIMEZONE` | VPS | não (padrão SP) | 1 |
| `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` | VPS | sim | 2 |
| `NEXT_PUBLIC_EMPRESA_*`, `NEXT_PUBLIC_CONTATO_EMAIL`, `NEXT_PUBLIC_PRIVACIDADE_EMAIL`, `NEXT_PUBLIC_ENCARREGADO_NOME` | GitHub | sim | 3 |
| `SENTRY_DSN` | VPS | recomendado | 5 |
| `ADMIN_EMAILS`, `CUSTO_INFRA_MENSAL_CENTAVOS` | VPS | recomendado | 5 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | VPS | não | 6 |
| `BILLING_ENABLED`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` (6) | VPS | para cobrar | 7 |
| `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_META_PIXEL_ID` | GitHub | não | 8 |
| `GA_MEASUREMENT_ID`, `GA_API_SECRET`, `META_PIXEL_ID`, `META_CAPI_TOKEN` | VPS | não | 8 |
| `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | VPS | não | 9 |
| `AGENTE_API_KEY`, `AGENTE_PROVEDOR`, `AGENTE_MODELO`, `AGENTE_BASE_URL`, `AGENTE_LIMITE_DIARIO` | VPS | não | 9 |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | VPS | não (número da plataforma para lembretes) | — |
| `DB_POOL_MAX`, `DB_POOL_TIMEOUT_MS`, `DB_STATEMENT_TIMEOUT_MS` | VPS | não | — |

Definidas no próprio `docker-compose.yml` (não mexa no `.env`):
`DATABASE_URL`, `BETTER_AUTH_URL`, `CORS_ORIGIN`, `APP_URL`,
`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`.
