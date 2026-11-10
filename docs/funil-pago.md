# Funil pago: anúncio → cadastro → trial → assinatura

Roteiro para ligar a cobrança e a medição de anúncios, e para testar o funil
inteiro antes de pôr dinheiro em mídia.

## O funil e o que ele grava

| Etapa | Onde acontece | O que fica gravado | Evento na Meta (`event_id`) |
|---|---|---|---|
| Visita do anúncio | landing `/` | primeira origem (utm_*, fbclid, referrer) no navegador | PageView (Pixel, só com consentimento) |
| Cadastro | `/cadastro` (e-mail ou Google) | `"user".origem` com a UTM e a escolha de cookies | CompleteRegistration (`cadastro:<user id>`) |
| Início do trial | `/onboarding`, primeira pousada | `assinaturas` com `status = 'trial'` e 14 dias | StartTrial (`trial:<pousada id>`) |
| Fim do trial | qualquer rota da operação | 402 `BILLING_001`; a tela leva a `/assinatura` | — |
| Checkout | `/assinatura` → Stripe Checkout | customer no Stripe; IP e user agent em `assinaturas.contexto_conversao` | InitiateCheckout (só Pixel) |
| Pagamento | webhook `invoice.paid`, primeira fatura | `status = 'ativa'`, receita e taxa em `financeiro_lancamentos` | Subscribe com valor (`assinatura:<sub id>`) |

- Cadastro e trial saem do Pixel e do servidor (Conversions API) com o mesmo
  `event_id`, e a Meta fica com um só. A assinatura sai só do servidor.
  Renovação e troca de plano não são enviadas.
- O servidor só envia para quem aceitou cookies de anúncio. A escolha vai no
  cadastro e é atualizada quando a pessoa muda de ideia ("Preferências de
  cookies" no rodapé e na política de privacidade, `PUT /api/conta/consentimento`).
- E-mail e id vão em SHA-256. IP e user agent vão em claro, como a Meta pede. O
  contexto do checkout é apagado pela limpeza depois de 7 dias, e o job de
  conversão concluído é apagado depois de 1 dia.
- Funil por campanha: `GET /api/admin/aquisicao?dias=30` (cadastros, quem criou
  pousada e pagantes por `utm_source` e `utm_campaign`).

## Ligar a cobrança em produção

### 1. Stripe, modo live (feito no painel, por quem administra a conta)

1. **Produtos e preços.** Catálogo de produtos → Adicionar produto, um por
   plano, cada um com dois preços recorrentes em BRL:

   | Produto | Mensal | Anual | Variáveis |
   |---|---|---|---|
   | Diária Essencial | R$ 89,00 / mês | R$ 890,00 / ano | `STRIPE_PRICE_ESSENCIAL_MENSAL`, `STRIPE_PRICE_ESSENCIAL_ANUAL` |
   | Diária Pousada | R$ 149,00 / mês | R$ 1.490,00 / ano | `STRIPE_PRICE_POUSADA_MENSAL`, `STRIPE_PRICE_POUSADA_ANUAL` |
   | Diária Rede | R$ 299,00 / mês | R$ 2.990,00 / ano | `STRIPE_PRICE_REDE_MENSAL`, `STRIPE_PRICE_REDE_ANUAL` |

   O anual é 10 meses (2 grátis), como em `backend/config/planos.ts`. Se o
   Price e o arquivo divergirem, cobra o Price e a tela mostra o arquivo:
   mantenha os dois iguais. Copie cada id `price_…` para a variável da tabela.
   Plano sem Price não aparece para contratação.
2. **Webhook.** Desenvolvedores → Webhooks → Adicionar destino:
   - URL: `https://api.diaria.gomio.com.br/api/webhooks/stripe`
   - Eventos: `checkout.session.completed`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted`,
     `invoice.paid`, `invoice.payment_failed`, `charge.refunded`,
     `charge.dispute.created`, `charge.dispute.closed`
   - O segredo de assinatura (`whsec_…`) vai em `STRIPE_WEBHOOK_SECRET`.
3. **Chave.** Uma chave restrita é melhor que a `sk_live_` completa. Permissões
   de escrita: Customers, Checkout Sessions, Subscriptions, Customer portal.
   Leitura: Invoices, Invoice payments, Payment intents, Charges. A chave vai
   em `STRIPE_SECRET_KEY`.
4. **Portal do cliente.** Configurações → Billing → Portal do cliente: atualizar
   cartão, ver faturas, cancelar no fim do período e trocar entre os seis
   preços. Links de termos e privacidade: `https://diaria.gomio.com.br/termos`
   e `/privacidade`.

   A conta Stripe é compartilhada com outros produtos, e a configuração padrão
   do portal é a de um deles, com outro nome e outras regras (prazo mínimo,
   outros preços). Por isso o Diária tem uma configuração própria, criada como
   configuração adicional do portal, com retorno para
   `https://diaria.gomio.com.br/assinatura`. O id dela (`bpc_…`) vai em
   `STRIPE_PORTAL_CONFIGURATION`, e o backend o passa em cada sessão do portal.
   Sem a variável, a sessão usa a configuração padrão da conta.
5. **Recuperação de receita.** Billing → Recuperação de receita: Smart Retries
   ligado e e-mail de pagamento falho. O app dá 7 dias de tolerância a partir
   da primeira falha (`DIAS_DE_TOLERANCIA`) antes de bloquear.
6. **Marca e recibos.** Nome público "Diária", descritor da fatura do cartão,
   logo, e recibo por e-mail para pagamentos bem-sucedidos.

### 2. Contas que já existem

Pousadas criadas com a cobrança desligada podem estar com o trial vencido. Ao
ligar, elas são bloqueadas na hora. Conferir antes, no banco de produção:

```sql
SELECT status, trial_termina_em < now() AS vencido, count(*)
  FROM assinaturas GROUP BY 1, 2 ORDER BY 1, 2;
```

Se houver trial vencido de gente que usa o sistema, decidir antes de ligar:
dar um prazo (`UPDATE assinaturas SET trial_termina_em = now() + interval '7 days'
WHERE status = 'trial' AND trial_termina_em < now();`) ou passar a cortesia.

### 3. Variáveis

No `.env` da VPS (backend, lido em tempo de execução):

```
BILLING_ENABLED=true
STRIPE_SECRET_KEY=rk_live_…
STRIPE_WEBHOOK_SECRET=whsec_…
STRIPE_PORTAL_CONFIGURATION=bpc_…
STRIPE_PRICE_ESSENCIAL_MENSAL=price_…   (e as outras cinco)
META_PIXEL_ID=…
META_CAPI_TOKEN=…
```

Nas Variables do GitHub Actions (frontend, embutidas no build; exigem deploy
novo): `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_GA_ID` e os dados da empresa
(`NEXT_PUBLIC_EMPRESA_*`, `NEXT_PUBLIC_CONTATO_EMAIL`,
`NEXT_PUBLIC_PRIVACIDADE_EMAIL`, `NEXT_PUBLIC_ENCARREGADO_NOME`). Sem
`NEXT_PUBLIC_META_PIXEL_ID` e `NEXT_PUBLIC_GA_ID` o aviso de cookies nem aparece,
e sem aceite não há Pixel nem envio pelo servidor.

O backend recusa subir em produção com `BILLING_ENABLED=true` e sem
`STRIPE_WEBHOOK_SECRET` (`lib/configProducao.ts`). No boot, o log diz
`[Billing] habilitado — Stripe em modo PRODUÇÃO`.

### 4. Conferência depois de ligar

- `GET https://api.diaria.gomio.com.br/api/billing/planos?ciclo=mensal` (logado)
  devolve os três planos.
- No painel do Stripe, o webhook mostra 200 nas entregas.
- No Gerenciador de Eventos da Meta, com `META_TEST_EVENT_CODE` preenchido por
  alguns minutos, a aba "Testar eventos" mostra CompleteRegistration e
  StartTrial chegando do navegador e do servidor, com "Desduplicado". Tire o
  código depois: com ele, os eventos não contam para as campanhas.

## Teste em modo de teste da Stripe

### Automatizado (sem rede)

`backend/tests/funil-pago.test.ts` roda o funil pela API de verdade, com o
Stripe simulado e a verificação de assinatura do webhook real do SDK:

1. cadastro com UTM e consentimento: origem gravada, CompleteRegistration com
   IP, user agent, `fbc` e `fbp`;
2. onboarding: trial de 14 dias e StartTrial;
3. trial vencido: 402 nas rotas da operação;
4. checkout: URL do Stripe e contexto guardado;
5. `checkout.session.completed` e `invoice.paid` assinados: plano ativo,
   operação liberada, receita lançada, Subscribe com R$ 149;
6. renovação: nenhum evento novo;
7. sem consentimento: nada vai para a Meta; revogação chega ao servidor.

```bash
cd backend && DATABASE_URL=postgresql://… npm test
```

### Manual, com a Stripe em modo de teste

Precisa de uma chave `sk_test_` (ou de uma área restrita) e de um Price de teste.

1. No `backend/.env`:
   ```
   BILLING_ENABLED=true
   STRIPE_SECRET_KEY=sk_test_…
   STRIPE_PRICE_POUSADA_MENSAL=price_… (de teste)
   FILA_HABILITADA=false
   META_PIXEL_ID=…  META_CAPI_TOKEN=…  META_TEST_EVENT_CODE=TEST…   (opcional)
   ```
   E no `frontend/.env.local`: `NEXT_PUBLIC_META_PIXEL_ID=…`.
2. Encaminhar o webhook para a máquina local e copiar o `whsec_` que aparece
   para `STRIPE_WEBHOOK_SECRET`:
   ```bash
   stripe listen --api-key sk_test_… --forward-to localhost:4000/api/webhooks/stripe
   ```
3. Subir backend e frontend (`npm run dev` em cada um) e abrir
   `http://localhost:3000/?utm_source=meta&utm_campaign=teste-local`. Aceitar os
   cookies, cadastrar, abrir o link de confirmação que aparece no log do
   backend e criar a pousada.
4. Vencer o trial:
   ```sql
   UPDATE assinaturas SET trial_termina_em = now() - interval '1 hour'
    WHERE pousada_id = (SELECT max(id) FROM pousadas);
   ```
   O painel passa a pedir assinatura.
5. Em `/assinatura`, assinar o plano Pousada com o cartão `4242 4242 4242 4242`,
   validade futura e qualquer CVC.
6. Conferir: `stripe listen` mostra 200 em `checkout.session.completed` e
   `invoice.paid`; `/assinatura` mostra o plano ativo; a aba "Testar eventos"
   da Meta mostra os três eventos.
7. Casos de falha: cartão `4000 0000 0000 0341` (aceita no checkout, recusa a
   cobrança) e cancelamento pelo portal ("Gerenciar assinatura").
