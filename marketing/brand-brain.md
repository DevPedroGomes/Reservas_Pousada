# Brand Brain do Diária (conteúdo orgânico e anúncios)

Fonte de verdade para gerar post, carrossel, reel e anúncio do Diária. Usado pela skill `/pulse`
(`.claude/skills/pulse/SKILL.md`) e pelo kit em `marketing/kit/`. Adaptado do brand-brain da Gomio
(`gomio-workspace/marketing/pulse/brand-brain.md`), com a mesma mecânica.

**Regra de conflito:** vale primeiro o que o código e o site mostram hoje
(`backend/config/planos.ts`, `frontend/lib/planos-publicos.ts`, `frontend/app/page.tsx`,
`frontend/app/termos/page.tsx`, `README.md`). Se este arquivo divergir deles, este arquivo está
errado e é corrigido. Afirmações conferidas em 10/11/2026 no código desta branch e em
https://diaria.gomio.com.br.

## Produto em uma frase

Sistema de reservas e gestão para pousadas: mapa de ocupação, reservas, Pix do sinal, hóspedes,
equipe e relatórios num lugar só, com teste grátis de 14 dias sem cartão.

## Público e trilhas

Dono de pousada pequena ou média no Brasil. Duas trilhas, com o plano que o site indica para cada uma:

| Trilha | Para quem | Plano do site | O que a peça mostra |
|---|---|---|---|
| **Pousada do dono** | Pousada pequena em que o dono atende o WhatsApp, faz a recepção e anota no caderno ou na planilha | Essencial: até 10 quartos, 3 usuários | O mapa no celular, o Pix do sinal, a mensagem pronta no WhatsApp, a pré-reserva que se cancela sozinha |
| **Pousada com equipe** | Pousada média com gente na recepção em turnos, ou dono com mais de uma propriedade | Pousada: até 25 quartos, usuários ilimitados, papéis por função. Rede: até 3 propriedades e 100 quartos | Equipe trabalhando ao mesmo tempo, a trava de reserva em dobro, a trilha de quem mudou o quê, os relatórios |

**Não há pesquisa de público no repositório** (conferido em 10/11/2026: `docs/` e `README.md` não têm
entrevista, enquete nem coleta de comentários). Os medos abaixo saem do que o site e o código já
tratam. São hipóteses até haver voz real do comprador (skill `opinioes`, com autorização porque gasta
crédito pago). Quando houver, a fala entra aqui com a fonte e a data.

### Medos (hipóteses, com a origem)

| Medo | De onde vem |
|---|---|
| Vender o mesmo quarto duas vezes (overbooking) | Landing, passo "Duas reservas no mesmo quarto?" e FAQ; trava no banco descrita no `README.md` |
| Reserva perdida no WhatsApp, entre as conversas | Landing, momento das 19:30 e mensagens prontas; página `/whatsapp` do produto |
| Caderno e planilha que só uma pessoa entende | Landing ("Um dia na recepção, sem caderno", "O que perguntam antes de sair do caderno"); importação de CSV |
| Comissão por reserva nas OTAs | Landing: "Pedido pelo seu site, sem comissão" e "Sem comissão por reserva". **Sem percentual**: comissão de Booking ou Airbnb só com fonte primária da própria OTA, com data |
| Pix do sinal que caiu e ninguém conferiu | Landing, momento das 07:12; `README.md`, Pix com "Recebi o Pix" ou Asaas |
| Ficha do hóspede em papel na chegada | Landing, momento das 13:25; pré-check-in com os campos da FNRH |

### Desejos

Saber se tem vaga em segundos, do celular. Receber o sinal antes de segurar o quarto. A equipe vendo a
mesma agenda. Vender pelo próprio site sem pagar comissão. Fechar o mês sabendo ocupação, diária média e
o que falta receber.

## Promessa

"Tem vaga? O mapa da sua pousada responde em segundos." (landing e imagem de prévia). Apoio:
"Reservas, Pix do sinal e equipe num lugar só."

## Pilares e pesos

Peso = parte das últimas 10 peças. A nota da skill `/pulse` sobe para o pilar que está abaixo do peso.

| # | Pilar | Peso | O que é | Formato principal |
|---|---|---|---|---|
| P1 | Operação na tela | 40% | Uma tarefa da recepção resolvida na tela do Diária, com dados fictícios: mapa, pré-reserva, Pix do sinal, pré-check-in, reserva em dobro recusada | Reel de tela + carrossel |
| P2 | Conta aberta do custo | 20% | Quanto custa o sistema (preço do site), o que não tem custo (mensagem pronta pelo `wa.me`), o que é cobrado por terceiros (mensagens da API oficial pela Meta, tarifa do Asaas). Só número do site ou de fonte primária, com data | Carrossel |
| P3 | Gestão de pousada com fonte | 25% | Dica prática para a pousada (FNRH, Cadastur, Pix, temporada, regra nova do WhatsApp), sempre com fonte oficial ou imprensa do setor de `marketing/pulse/fontes.md` | Carrossel ou reel curto |
| P4 | Objeções | 15% | As perguntas do FAQ da landing: funciona com Booking e Airbnb, envia a FNRH, preciso de cartão, minha equipe usa junto, trago minhas reservas do Excel, e os dados dos hóspedes | Carrossel de perguntas |

## Voz

- **Mostrar, não falar sobre o Diária.** Cada peça tem uma tela com dados fictícios, um preço do site ou
  uma fonte nomeada.
- De dono para dono, com as palavras da recepção: vaga, diária, sinal, check-in, ficha, temporada,
  quarto, chalé. Sigla de hotelaria (RevPAR, ADR, OTA) só com a explicação junto.
- Uma ideia por peça. Frases curtas.
- Conta o limite junto com a função: o iCal tem janela de horas, a FNRH é coletada e não enviada. É o
  que a landing já faz e o que dá credibilidade.
- **Legenda e texto na peça sem marca de texto de IA:** sem travessão (o gerador recusa no texto
  visível), sem "não é X, é Y", sem pergunta retórica seguida de resposta de efeito, sem frase de
  fechamento de efeito, sem tríade forçada, sem "imagine", "descubra", "transforme", "revolucione".
- Frases gastas, não usar: "gestão completa", "tudo em um", "nunca mais perca uma reserva", "sua
  pousada no próximo nível", "lotação garantida".

## Afirmações permitidas (cada uma com a fonte)

| Afirmação | Condição | Fonte |
|---|---|---|
| Essencial R$ 89/mês, Pousada R$ 149/mês, Rede R$ 299/mês | Escrever como o site: "R$ 89 por mês" ou "a partir de R$ 89 por mês" | `backend/config/planos.ts` (`precoMensalCentavos`), `frontend/lib/planos-publicos.ts`, landing `#planos` |
| No anual, 2 meses saem de graça | Sem valor do anual na peça, porque o site não mostra | `backend/config/planos.ts` (`precoAnualCentavos`, "10 meses"), landing `#planos` |
| Limites: Essencial até 10 quartos e 3 usuários; Pousada até 25 quartos e usuários ilimitados; Rede até 3 propriedades e 100 quartos | Como o site | `backend/config/planos.ts`, `frontend/lib/planos-publicos.ts` |
| 14 dias grátis, sem cartão | | `DIAS_DE_TRIAL` em `backend/config/planos.ts`, landing, `termos` §3 |
| Sem comissão por reserva e sem fidelidade; cancela quando quiser | | Landing `#planos`, FAQ, `termos` §4 |
| Desistência em até 7 dias com devolução do que foi pago | Só citando o direito de arrependimento como nos termos | `frontend/app/termos/page.tsx` §4 |
| O Diária recusa duas reservas no mesmo quarto e período | "Dentro do Diária". Vale para equipe, site, planilha importada e calendário importado | `README.md`, "No overbooking, guaranteed by the database"; FAQ da landing |
| Funciona com Booking e Airbnb pela sincronização de calendário (iCal) de cada quarto, buscada a cada 30 minutos | Sempre com o limite: as OTAs levam horas para atualizar do lado delas, e nessa janela uma venda dupla é possível. Cada quarto precisa existir como unidade na OTA | `README.md` (iCal sync), FAQ da landing |
| Pix do sinal com QR e "copia e cola" na chave Pix da própria pousada, com "Recebi o Pix" | | `README.md` (Pix for the deposit), landing |
| Confirmação automática do Pix pela conta Asaas da própria pousada | Sempre "com a sua conta Asaas". A tarifa do Asaas é do Asaas | `README.md`, `backend/lib/gatewayPix.ts` |
| Pré-reserva com prazo que se cancela sozinha se o sinal não vier | | `README.md` (Reservation lifecycle), landing |
| Página de reservas da pousada (`/r/<sua-pousada>`): o hóspede vê datas livres e preço, o pedido vira pré-reserva, sem comissão | | `README.md` (Public booking page), landing 16:05 |
| Pré-check-in pelo link com os campos da FNRH | **Nunca** dizer que envia ao Ministério do Turismo: não envia | `README.md`, FAQ da landing |
| Mensagens prontas no WhatsApp (confirmação, pedido de sinal, instruções de chegada, agradecimento) que abrem o WhatsApp da pousada, sem custo | | `README.md` (WhatsApp), landing 19:30 |
| Atendente virtual no WhatsApp que responde disponibilidade e passa o resto para a equipe | **Só depois de confirmar** que a conexão do número (Embedded Signup) e o App Review da Meta estão aprovados em produção: o checklist de `docs/whatsapp-meta.md` ainda não está marcado neste repositório. Nunca dizer que ele confirma pagamento, cancela ou altera reserva | `README.md`, landing 19:30 ("com a API oficial ligada") |
| Relatórios: ocupação, diária média, RevPAR, receita por canal e o que falta receber | | `README.md` (Reports), landing 23:10 |
| Equipe ao mesmo tempo, do computador ou do celular, com papéis: recepção, administração e auditoria | | FAQ da landing, `README.md` |
| Cada mudança fica registrada com quem fez e quando | | Landing 23:10, trilha de auditoria no `README.md` |
| Traz as reservas do Excel por CSV, com prévia e conferência antes de gravar | | FAQ da landing, `README.md` (CSV import) |
| CPF e ficha do hóspede ficam cifrados; você exporta as reservas ou exclui a conta quando quiser | Sem "em conformidade com a LGPD" | FAQ da landing, `README.md` |

## Afirmações proibidas

- Prometer ocupação, receita, mais reservas, menos cancelamento ou "pousada cheia".
- "Acabe com o overbooking", "zero overbooking", "sincroniza em tempo real com o Booking e o Airbnb",
  "channel manager": o iCal tem janela de horas e o próprio site diz que o Diária ainda não é channel
  manager.
- Chamar Booking ou Airbnb de parceiro, integração oficial ou "conectado à API" deles: a ligação é por
  calendário iCal, e não há parceria no repositório. Logo de OTA também não entra na peça.
- "Envia a FNRH ao governo" ou "cumpre a FNRH por você".
- "Em conformidade com a LGPD", "100% seguro".
- Número não medido: horas economizadas, percentual de reservas perdidas, comissão média de OTA,
  "pousadas que já usam". Número só do site ou de fonte primária nomeada, com data.
- Depoimento, cliente ou caso que não esteja registrado com autorização. Hoje não há nenhum neste
  repositório.
- Dado de hóspede real (nome, CPF, telefone, e-mail, foto, documento), print da produção de uma pousada
  cliente ou print do painel de administração (`/admin`).
- Atendente virtual que "atende 24 horas sozinho", "fecha a venda" ou "confirma o pagamento".
- "Pix automático" sem dizer que depende da conta Asaas da pousada.
- Preço, limite ou prazo diferente do site, ou valor do plano anual.

## Regras de imagem

- Prova é tela real do Diária com **dados fictícios**: a landing pública (que usa dados de exemplo) ou
  uma pousada de demonstração criada só para isso. Nunca a conta de uma pousada cliente.
- Nenhum dado pessoal de hóspede: nome inventado, CPF e telefone fora do quadro ou de teste.
- A legenda da peça diz "dados fictícios". O modelo `prova` já escreve isso por padrão.
- Sem rosto até haver decisão. Sem logo de Booking, Airbnb, Asaas ou Meta na arte.
- Recortes em `marketing/kit/assets/prints/`. Os dois atuais foram capturados de
  https://diaria.gomio.com.br em 10/11/2026 (mapa de ocupação da landing, dados de exemplo).

## CTAs e links

| Situação | Botão (`acao`) | Link |
|---|---|---|
| Topo (alcance) | sem botão; na legenda, "Mande para quem cuida das reservas" ou "Salve para a próxima temporada" | mede envios e salvamentos |
| Chamada principal | "Testar 14 dias grátis" | `https://diaria.gomio.com.br/?utm_source=<rede>&utm_medium=<midia>&utm_campaign=<id da peça>` |
| Objeção de preço (P2, P4) | "Ver os planos" | o mesmo link com `#planos` no fim |

- `utm_source`: `instagram` ou `tiktok`. `utm_medium`: `organic` ou `paid`. `utm_campaign`: o id da peça
  no `posts.json` (ex.: `01-tem-vaga`). Anúncio pode acrescentar `utm_content` com a variação.
- O site guarda a primeira origem com esses parâmetros e manda no cadastro (`frontend/lib/origem.ts`). O
  funil por campanha sai de `GET /api/admin/aquisicao?dias=30` (`docs/funil-pago.md`).
- O link da bio é um só: troque o `utm_campaign` dele para o id da peça da semana e anote no
  `registro.csv`. Story com figurinha de link e anúncio levam o id da própria peça.
- No máximo 3 hashtags: `#pousada`, `#hotelaria`, `#gestaodepousada` (troque conforme a peça).

## Identidade da conta

| Onde | Identidade | Rodapé da arte |
|---|---|---|
| Orgânico | Instagram da Gomio (e TikTok, quando houver) | "Diária, da Gomio" |
| Anúncio pago | Página e conta de anúncios da Gomio | "Diária, da Gomio" |
| Perfil próprio do Diária, se um dia existir | Diária | só "Diária" |

O crédito é configurável em `marketing/kit/posts.json`, campo `marca.credito` (`"da Gomio"`; vazio
remove). O site mostrado é `marca.site`.

**Pendências antes do primeiro post:**
1. O perfil da Gomio segue o brand-brain dela, que hoje oferece só o que o gomio.com.br oferece, e o
   `docs/CATALOGO.md` da Gomio diz que o Diária ainda não está decidido como produto da Gomio. A
   decisão de postar o Diária ali precisa ser registrada no `gomio-workspace` antes.
2. A grade da Gomio alterna café e papel. As capas do Diária usam porta (terracota) e papel; combine a
   posição na grade com o `LEIAME.md` da Gomio.
3. Anúncio pago só com a cobrança ligada em produção e os eventos conferidos, como manda
   `docs/funil-pago.md`.

## Visual

Kit em `marketing/kit/`: tokens em `sistema.css`, copiados de `frontend/app/globals.css`; temas papel
(claro do site), café (escuro do site) e porta (a porta pintada da landing); Space Grotesk, IBM Plex
Sans e IBM Plex Mono de `frontend/app/fontes`; símbolo da porta de
`frontend/components/landing/MarcaDiaria.tsx`. Não trocar símbolo, cores, fontes nem layout sem
autorização.

- Capa na grade: ímpar = tema porta, par = papel. O miolo do carrossel fica em papel.
- Terracota em uma coisa só por slide de papel (o botão ou o número).
- Supergráfico (batente da porta ou almofadas) só na capa.
- Margem de 88 px.
- Texto visível sem travessão: o gerador recusa.
