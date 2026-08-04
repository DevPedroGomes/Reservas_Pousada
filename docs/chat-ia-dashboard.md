# Chat com IA no dashboard — decisão e desenho

**Status:** adiado, não cancelado · **Decidido em:** 2026-08-04

Feature proposta: um chat no dashboard principal onde cada pousada conversa em
linguagem natural com os próprios dados ("quantos quartos livres tenho no
sábado?", "qual foi meu melhor mês?"), com controles para o usuário não sair do
tópico.

A ideia é boa e é um diferencial real — nenhum concorrente do segmento tem. Mas
está fora de ordem, e este documento registra por quê e como construir quando a
hora chegar.

---

## Por que não agora

**1. Não existe cobrança.** Cada pergunta é uma chamada de API paga que sai do
bolso e não entra em lugar nenhum. Isso viola o primeiro princípio de controle
de custo do projeto: *cliente paga ANTES de consumir API; nunca consumir API
contra fatura aberta*. Adicionar consumo variável a um produto sem receita é
construir o telhado antes da parede.

**2. Não existe dado.** O banco de produção tem 0 reservas. Um chat sobre dados
inexistentes responde "não encontrei nenhuma reserva" para qualquer pergunta.

**3. Não é o que o cliente pede.** Na pesquisa de mercado (ago/2026), o item nº 1
de desejo do dono de pousada é **channel manager** (Booking/Airbnb), seguido de
tarifário por temporada, tipos de quarto e mapa de disponibilidade. Chat com IA
não aparece. Um PMS sem channel manager e com IA continua perdendo para um PMS
com channel manager e sem IA.

## Pré-requisitos, nesta ordem

1. **Cobrança funcionando** — plano, checkout, webhook, enforcement de cota
2. **Mapa de disponibilidade + tarifário por temporada** — o que o cliente pede
3. **~6 meses de dados reais** de clientes pagantes

Só depois disso o chat vira o que ele pode ser: o diferencial que justifica
cobrar acima do incumbente, porque se demonstra em 30 segundos numa venda.

---

## Desenho (quando for a hora)

### Decisão 1 — tool-calling sobre queries fixas, NÃO RAG

O instinto é gerar embeddings das reservas e fazer busca vetorial. Seria pior em
todos os eixos: fica desatualizado a cada nova reserva, perde precisão numérica,
custa mais, e não consegue responder "quantos quartos livres no sábado?" — que
exige **contar**, não recuperar.

O certo é um conjunto pequeno de ferramentas somente-leitura, cada uma com o
`pousada_id` **injetado no servidor** a partir de `req.user.pousadaId`:

```ts
ocupacao_periodo(data_inicio, data_fim)
  -> { taxa_ocupacao, quartos_ocupados, quartos_livres, por_dia[] }

receita_periodo(data_inicio, data_fim, incluir_pendente)
  -> { realizada, pendente, ticket_medio, num_reservas }

disponibilidade(data_inicio, data_fim, quarto?)
  -> { quartos_livres[], quartos_ocupados[] }

checkins_do_dia(data)
  -> { entradas[], saidas[] }   // nome + quarto, SEM CPF

historico_hospede(cpf_hash)
  -> { num_estadias, primeira, ultima, total_gasto }   // NUNCA devolve o CPF
```

**O modelo nunca gera SQL.** Text-to-SQL contra um banco multi-tenant é como se
vaza dado de um cliente para outro. Com ferramentas fixas e o tenant vindo do
servidor, o vazamento cross-tenant é impossível por construção — mesma lógica da
constraint `reservas_sem_overbooking`: a garantia é estrutural, não é confiança
no comportamento.

### Decisão 2 — CPF nunca entra no contexto

O `cpf` é cifrado em AES-256-GCM, o `cpf_hash` é HMAC com chave, e a auditoria
redige PII antes de gravar (`utils/pii.ts`). Mandar CPF para a API de um terceiro
desfaz tudo isso de uma vez, e adiciona uma transferência internacional de dado
pessoal que a LGPD exige declarar na política de privacidade e no contrato de
operador.

As ferramentas devolvem agregados e identificadores mascarados. O campo
`observacoes` também merece atenção: é texto livre digitado pela recepção e pode
conter dado sensível sem querer.

### Decisão 3 — o controle de escopo é de capacidade, não de instrução

Escrever *"só fale sobre a pousada"* no system prompt **não é controle** — é
sugestão, e é contornável. O controle real é que o modelo **não tem ferramenta
para mais nada**. Se as únicas capacidades são as 5 consultas acima, conversa
fora do tópico é token desperdiçado, não risco.

| Camada | Mecanismo |
|---|---|
| Custo | Cota por tenant verificada **antes** da chamada; insert em `usage_records` síncrono |
| Abuso | Limite de mensagens/hora por usuário, máximo de turnos por conversa, cap no tamanho do input |
| Escopo | Ferramentas somente-leitura, tenant fixado no servidor, zero operação de escrita |
| Off-topic barato | Classificador com Haiku 4.5 antes da chamada principal — só se a economia justificar a complexidade a mais |

**Prompt injection via campo de reserva.** Alguém escreve "IGNORE AS INSTRUÇÕES
ANTERIORES" no campo observações de uma reserva; esse texto entra no contexto
via resultado de ferramenta. Como as ferramentas são somente-leitura e escopadas
por tenant, o pior caso é uma resposta estranha — não perda nem vazamento de
dado. É exatamente por isso que somente-leitura não é preguiça, é a defesa.

### Tabela de uso

Necessária para o enforcement de cota (é a mesma estrutura exigida por qualquer
feature de IA paga do portfólio):

```sql
CREATE TABLE usage_records (
  id                   SERIAL PRIMARY KEY,
  pousada_id           INTEGER NOT NULL REFERENCES pousadas(id),
  user_id              TEXT REFERENCES "user"(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  feature              TEXT NOT NULL,        -- 'chat'
  model                TEXT NOT NULL,
  tokens_in            INTEGER NOT NULL,
  tokens_out           INTEGER NOT NULL,
  cache_read_tokens    INTEGER NOT NULL DEFAULT 0,
  custo_usd_estimado   NUMERIC(10,6) NOT NULL,
  request_id           TEXT
);
CREATE INDEX idx_usage_pousada_periodo ON usage_records (pousada_id, created_at);
```

---

## Modelo e custo

> ⚠️ Preços e IDs de modelo verificados em **2026-08-04**. Confirmar antes de
> implementar — mudam.

| Modelo | Entrada (US$/MTok) | Saída (US$/MTok) | Contexto | Mínimo p/ cache |
|---|---|---|---|---|
| Haiku 4.5 (`claude-haiku-4-5`) | 1,00 | 5,00 | 200K | **4.096 tokens** |
| Sonnet 5 (`claude-sonnet-5`) | 3,00 | 15,00 | 1M | **1.024 tokens** |

Uma pergunta = 2 chamadas (pedido da ferramenta + resposta com o resultado):
~5.500 tokens de entrada, ~230 de saída.

- Haiku 4.5: **~US$ 0,007/pergunta**
- Sonnet 5 com prompt caching: **~US$ 0,008/pergunta**

**Usar Sonnet 5.** A pegadinha está no mínimo de cache: o system prompt mais os
schemas das ferramentas deve ficar por volta de 2.500 tokens, ou seja **abaixo
dos 4.096 do Haiku 4.5 — o cache simplesmente não acontece, sem erro nenhum**, e
paga-se entrada cheia todo turno. O Sonnet 5 cacheia a partir de 1.024 (leitura a
0,1× do preço de entrada), erra muito menos na escolha de ferramenta e interpreta
data em português bem melhor ("no fim de semana do dia 12", "mês passado").
Com o cache funcionando, a diferença de custo desaparece.

**Margem:** a ~R$ 5,40/dólar, 200 perguntas/mês por pousada ≈ **R$ 8,60/mês de
API por cliente**. Contra uma mensalidade de R$ 149, são ~6% — bem dentro do teto
de 40% da regra de margem do portfólio.

### Prompt caching

Marcar `cache_control` no último bloco do system prompt (a ordem de renderização
é `tools` → `system` → `messages`, então isso cacheia ferramentas + system
juntos). Manter o prefixo **congelado**: nada de data atual, nome do usuário ou
id de sessão interpolado ali — vai para a mensagem, não para o system. Conferir
`usage.cache_read_input_tokens` > 0 nas requisições seguintes; se for zero, tem
invalidador silencioso no prefixo.

---

## Esforço estimado

~30–40h: ferramentas e schemas, middleware de cota, tabela `usage_records`,
streaming no frontend, painel de custo por cliente, e os testes de isolamento de
tenant (o chat é mais uma superfície onde vazamento cross-tenant seria fatal).

---

## Referências

- Auditoria de 2026-08-03 — bloqueadores, roadmap e precificação
- `backend/utils/pii.ts` — redação de PII, mesmo padrão a aplicar aqui
- `backend/models/Reserva.ts` — as queries que as ferramentas vão encapsular
- Regras de controle de custo e billing: `CLAUDE.md` global da VPS
