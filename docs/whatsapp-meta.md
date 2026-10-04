# WhatsApp Business das pousadas — o que configurar na Meta

Cada pousada conecta o **próprio número** pelo painel (Configurações → WhatsApp
Business da pousada), num fluxo oficial da Meta chamado *Embedded Signup*. O
Diária atua como **Tech Provider**: um app nosso, aprovado pela Meta, que recebe
permissão para operar a conta de WhatsApp de cada pousada. A conta, o número e a
cobrança das conversas continuam sendo da pousada — a Meta cobra direto dela.

Este documento é o passo a passo do nosso lado. Depois de feito uma vez, o
onboarding de cada pousada é self-service.

---

## Como funciona (visão geral)

```
Pousada (painel) ──FB.login(config_id)──> Meta: entra com o Facebook, escolhe/cria
       │                                  o portfólio, confirma o número
       │<── code + waba_id + phone_number_id
       ▼
API: POST /api/whatsapp/conectar
  1. troca o code pelo token da conta da pousada (guardado cifrado)
  2. assina o webhook da WABA para o nosso app
  3. registra o número na Cloud API (exceto coexistência)
  4. cria os modelos lembrete_chegada e reserva_confirmada

Hóspede escreve ──> Meta ──POST /api/webhooks/whatsapp (assinado)──> fila ──> atendente virtual
                                                                          └─> ou equipe (painel /whatsapp)
```

- **Um app, um webhook** para todas as pousadas. A pousada é identificada pelo
  `phone_number_id` de cada evento.
- **Coexistência** (recomendado): a pousada continua usando o app WhatsApp
  Business no celular. As mensagens que a equipe manda pelo celular chegam como
  eco (`smb_message_echoes`) e pausam o atendente virtual naquela conversa.
- **Número novo**: o número passa a existir só na API (não pode estar em uso
  no app do celular).

---

## 1. Portfólio empresarial e verificação

1. Em <https://business.facebook.com>, use (ou crie) o portfólio empresarial do
   Diária — o CNPJ da empresa que opera o SaaS.
2. **Central de Segurança → Verificação da empresa**: envie CNPJ e comprovante
   de endereço/telefone. Sem verificação não há Tech Provider nem acesso
   avançado às permissões.
3. Adicione pelo menos dois administradores (evita ficar trancado fora).

## 2. Criar o app

1. <https://developers.facebook.com/apps> → **Criar app** → tipo **Empresa
   (Business)**, ligado ao portfólio do passo 1.
2. Adicione os produtos **WhatsApp** e **Facebook Login for Business**.
3. **Configurações → Básico**:
   - Copie o **ID do app** → `META_APP_ID`.
   - Copie a **Chave secreta do app** → `META_APP_SECRET` (nunca vai ao navegador;
     é usada para trocar o código e para conferir a assinatura do webhook).
   - Domínios do app: `diaria.pgdev.com.br`.
   - URL da Política de Privacidade: `https://diaria.pgdev.com.br/privacidade`.
   - URL dos Termos: `https://diaria.pgdev.com.br/termos`.
   - Exclusão de dados: instruções em `https://diaria.pgdev.com.br/privacidade`.
   - Ícone e categoria (Negócios e páginas).

## 3. Tornar-se Tech Provider

No painel do app: **WhatsApp → Início rápido** (ou "Tornar-se um Tech
Provider"), e siga os passos da Meta. Em resumo:

1. Verificação da empresa (passo 1) concluída.
2. **Análise do app (App Review)** pedindo acesso avançado a:
   - `whatsapp_business_management`
   - `whatsapp_business_messaging`
3. Para cada permissão, a Meta pede uma descrição do uso e um **vídeo**
   (screencast). Grave:
   - o dono da pousada clicando em "Conectar o número do app WhatsApp
     Business" em Configurações, passando pelo fluxo da Meta e voltando com o
     número conectado;
   - uma mensagem chegando em `/whatsapp`, a equipe respondendo pelo painel, e
     o atendente virtual respondendo uma pergunta de disponibilidade.
4. Enquanto a análise não sai, o fluxo funciona **só com contas que têm papel
   no app** (administradores, desenvolvedores, testadores) — use isso para
   testar com a sua própria pousada.

## 4. Configuração do Embedded Signup

1. **Facebook Login for Business → Configurações → Criar configuração**.
2. Escolha o modelo **WhatsApp Embedded Signup** (variação de login com
   *token de usuário do sistema da integração de negócios*).
3. Permissões: `whatsapp_business_management` e `whatsapp_business_messaging`.
4. Ativos: **Contas do WhatsApp**.
5. Salve e copie o **ID da configuração** → `META_CONFIG_ID`.
6. **Facebook Login for Business → Configurações**:
   - *Login com o SDK do JavaScript*: **Sim**.
   - *Domínios permitidos para o SDK do JavaScript*: `https://diaria.pgdev.com.br`
     (e o domínio antigo, se ainda estiver no ar).
   - *URIs de redirecionamento OAuth válidos*: `https://diaria.pgdev.com.br/`.

O painel chama o SDK assim (já implementado em
`frontend/components/whatsapp/WhatsappBusiness.tsx`):

```js
FB.login(cb, {
  config_id: META_CONFIG_ID,
  response_type: 'code',
  override_default_response_type: true,
  extras: { setup: {}, sessionInfoVersion: '3', featureType: 'whatsapp_business_app_onboarding' /* só coexistência */ },
})
```

O SDK precisa de **HTTPS** — em `localhost` o fluxo não abre; teste em
homologação/produção ou com um túnel HTTPS.

## 5. Webhook

1. **WhatsApp → Configuração → Webhook → Editar**:
   - URL de callback: `https://api.diaria.pgdev.com.br/api/webhooks/whatsapp`
   - Token de verificação: o valor de `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (invente
     uma string longa e aleatória, ex. `openssl rand -hex 24`).
   - A Meta faz um GET com `hub.challenge`; a API responde se o token bater.
2. Assine os campos:
   - `messages` (obrigatório — mensagens dos hóspedes)
   - `smb_message_echoes` (coexistência — respostas dadas pelo app do celular)
   - opcionais: `message_template_status_update`, `account_update`
3. A assinatura `X-Hub-Signature-256` de cada POST é conferida com
   `META_APP_SECRET` sobre os bytes crus do corpo. Corpo sem assinatura válida
   → 401.

Ao conectar, a API também chama `POST /{waba_id}/subscribed_apps` na conta da
pousada, para que os eventos daquela WABA venham para o nosso app.

## 6. Variáveis de ambiente (backend)

| Variável | O que é |
|---|---|
| `META_APP_ID` | ID do app (passo 2) — vai ao navegador, não é segredo |
| `META_APP_SECRET` | Chave secreta do app (passo 2) — **segredo** |
| `META_CONFIG_ID` | ID da configuração do Embedded Signup (passo 4) |
| `META_GRAPH_VERSAO` | versão da Graph API (padrão `v21.0`) |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | token de verificação do webhook (passo 5) — **segredo** |
| `AGENTE_PROVEDOR` | `anthropic` (padrão) ou `openai` (qualquer API compatível) |
| `AGENTE_API_KEY` | chave do provedor do modelo — **segredo**; sem ela o atendente fica desligado |
| `AGENTE_MODELO` | padrão `claude-haiku-4-5-20251001` / `gpt-4o-mini` |
| `AGENTE_BASE_URL` | só para `openai`: ex. `https://api.groq.com/openai/v1` |
| `AGENTE_LIMITE_DIARIO` | teto de respostas do atendente por pousada em 24h (padrão 300) |

Estão no `docker-compose.yml` lendo do `.env` do servidor. Sem `META_*`, o card
aparece como "não liberado"; sem `AGENTE_*`, a pousada conecta o número e usa o
painel de conversas, mas o atendente virtual fica indisponível.

O CSP do frontend (`docker-compose.yml`, labels do Traefik) já libera
`connect.facebook.net` (script), `*.facebook.com` (frame do SDK) e
`graph.facebook.com`.

## 7. Cobrança (quem paga o quê)

- **Meta → pousada**: a pousada cadastra a forma de pagamento no WhatsApp
  Manager da conta dela (o próprio fluxo da Meta pede). Responder ao hóspede
  dentro de 24h da última mensagem dele é gratuito; mensagens iniciadas pela
  pousada (modelos, como o lembrete de chegada) são cobradas por mensagem,
  pela tabela da Meta para o Brasil.
- **Modelo de linguagem → Diária**: cada resposta do atendente é uma chamada
  ao provedor configurado em `AGENTE_*`, paga por nós. O teto
  `AGENTE_LIMITE_DIARIO` deixa o custo previsível; acima dele a conversa vai
  para a equipe. Um modelo pequeno basta: o modelo só conversa e escolhe
  ferramentas — vaga, preço e reserva vêm do banco, nunca da cabeça dele.
- Prefira provedores que **não treinam com os dados da API** (Anthropic e
  OpenAI, por padrão, não treinam). Evite planos gratuitos que treinam com o
  conteúdo — são conversas de hóspedes (LGPD).

## 8. Modelos de mensagem

Criados automaticamente na conta da pousada ao conectar (categoria UTILITY,
`pt_BR`):

| Nome | Corpo |
|---|---|
| `lembrete_chegada` | Olá, {{1}}! Passando para lembrar que a {{2}} espera você em {{3}} ({{4}}). … |
| `reserva_confirmada` | Olá, {{1}}! Sua reserva na {{2}} está confirmada: {{3}}, de {{4}} a {{5}}. … |

A Meta aprova em minutos a algumas horas. Se a criação falhar (ex.: nome já
existe), o painel mostra "modelos de mensagem pendentes"; dá para criar à mão
no WhatsApp Manager com o mesmo nome e corpo. O lembrete da véspera (job diário
às 10h) sai pelo número da pousada quando ela está conectada e ligou "Enviar
lembrete automático" em Mensagens do WhatsApp; quem respondeu "parar" não recebe.

## 9. O atendente virtual

- Ferramentas (rodam no servidor, com a pousada e o telefone de quem escreve
  já fixados): `informacoes_da_pousada`, `consultar_disponibilidade`,
  `criar_pre_reserva` (com Pix do sinal, se a pousada tiver), `minhas_reservas`,
  `chamar_atendente`.
- Não confirma pagamento, não cancela, não altera reserva, não dá desconto:
  passa para a equipe e avisa por e-mail (dono, admins e e-mail da pousada).
- Primeira mensagem de cada contato: aviso de que é um atendente virtual e
  link da política de privacidade.
- "atendente"/"humano" → passa para a equipe. "parar" → sem mensagens
  automáticas (inclusive lembretes); "voltar" → religa.
- Áudio, foto e figurinha → passa para a equipe.
- Quando a equipe responde (painel ou celular), o atendente fica calado
  naquela conversa por 12h, ou até alguém clicar em "Devolver ao atendente
  virtual".
- Mensagens ficam cifradas no banco e são apagadas após 90 dias.

## 10. Testar sem a Meta (desenvolvimento)

Com `META_APP_SECRET` definido no `.env` local, simule uma mensagem assinada
(o número precisa estar em `whatsapp_contas`):

```bash
CORPO='{"object":"whatsapp_business_account","entry":[{"id":"w","changes":[{"field":"messages","value":{"metadata":{"phone_number_id":"5550001"},"contacts":[{"wa_id":"5548991110000","profile":{"name":"Marina"}}],"messages":[{"from":"5548991110000","id":"wamid.teste1","type":"text","text":{"body":"Tem vaga no feriado?"}}]}}]}]}'
SIG="sha256=$(printf '%s' "$CORPO" | openssl dgst -sha256 -hmac "$META_APP_SECRET" -r | cut -d' ' -f1)"
curl -X POST localhost:4000/api/webhooks/whatsapp -H "Content-Type: application/json" -H "X-Hub-Signature-256: $SIG" -d "$CORPO"
```

Os testes (`backend/tests/http.test.ts`, bloco "WhatsApp Business e atendente
virtual") trocam a Meta e o modelo por versões falsas
(`usarClienteMetaDeTeste`, `usarModeloDeTeste`).

## Checklist

- [ ] Portfólio verificado
- [ ] App Business com WhatsApp + Facebook Login for Business
- [ ] Política de privacidade, termos e exclusão de dados no app
- [ ] Configuração do Embedded Signup criada (`META_CONFIG_ID`)
- [ ] Domínio do frontend no SDK do JavaScript
- [ ] Webhook verificado, campos `messages` e `smb_message_echoes` assinados
- [ ] `META_*`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` e `AGENTE_*` no `.env` do servidor
- [ ] App Review aprovado (`whatsapp_business_management`, `whatsapp_business_messaging`)
- [ ] Conectar a primeira pousada (a sua) e trocar mensagens de teste
