---
name: pulse
description: Use when asked what to post about the Diária on Instagram or TikTok, for a new Diária carousel, reel script, story or ad creative, when turning a tourism or hospitality news item, a product screen or a funnel number into a Diária post, when logging metrics of published Diária posts, or when /pulse is typed in this repository.
---

# Pulse

Ciclo de conteúdo do Diária rodado à mão, com a mesma mecânica do pulse da Gomio: **sinal → nota →
ângulo → peça renderizada → aprovação humana → registro → revisão**. O kit (`marketing/kit/`) desenha.
O `marketing/brand-brain.md` decide o que pode ser dito. **Nada é publicado daqui:** a sessão entrega
os PNG e a legenda; quem publica é uma pessoa, depois de aprovar.

Público: dono de pousada pequena ou média no Brasil, em duas trilhas (pousada do dono e pousada com
equipe). Orgânico no Instagram da Gomio e anúncio com a identidade da Gomio, com o crédito "Diária, da
Gomio" no rodapé. Preço e prazo só como o site mostra.

| Arquivo | Papel |
|---|---|
| `marketing/brand-brain.md` | Público, trilhas, medos, pilares e pesos, voz, afirmações permitidas (com fonte) e proibidas, CTAs com UTM, identidade da conta |
| `marketing/pulse/fontes.md` | Onde buscar sinais |
| `marketing/pulse/registro.csv` | O que foi publicado e como foi: fonte de verdade de "já postado" |
| `marketing/kit/posts.json` | Conteúdo das peças e o bloco `marca` |
| `marketing/kit/LEIAME.md` | Regras do kit, modelos, ordem de publicação e legendas |

## Regras de toda rodada

- **Toda afirmação de produto é conferida no código ou no site antes de entrar na peça**: preço,
  limite, prazo, integração, o que o sistema faz e o que não faz. Abra o arquivo da coluna "Fonte" do
  brand-brain (ou `curl -sL https://diaria.gomio.com.br`) e confira o valor do dia. Se o código e o
  brand-brain divergirem, vale o código, a peça usa o código e a resposta propõe corrigir o
  brand-brain.
- Afirmação sem fonte não entra. Ela vai para "pendências" da resposta, com o que falta para entrar.
- **Legenda e texto da peça sem marca de texto de IA:** sem travessão, sem "não é X, é Y", sem pergunta
  retórica com resposta de efeito, sem frase de fechamento de efeito, sem tríade forçada, sem as frases
  gastas do brand-brain. Releia a legenda antes de entregar.
- Prova é tela real com dados fictícios. Nunca dado de hóspede real, conta de cliente ou `/admin`.

## Escopo da rodada

Uma rodada de conteúdo altera só `posts.json`, a seção de legendas do `LEIAME.md`, `exports/`,
`assets/prints/` (recorte novo) e `registro.csv`. Peça que precise de layout inexistente usa o modelo
mais próximo, e a resposta termina com uma **proposta de mudança no kit** (arquivo, o quê, por quê). Se
a pessoa autorizar a mudança explicitamente, ela é aditiva: modelo novo, sem alterar modelos ou tokens
existentes, e uma peça antiga de cada tema é renderizada de novo para provar que não mudou.

## Modo 1: o que postar (padrão)

1. Leia `brand-brain.md`, `registro.csv`, os ids do `posts.json` e as legendas do `LEIAME.md`.
2. Peça no `posts.json` que não está no `registro.csv` = pronta e não publicada. Se houver, o primeiro
   item da resposta é publicar essas, com ids e ordem.
3. Sinais, nesta ordem: dado próprio medido (funil por campanha, tela nova do produto); feeds de
   `fontes.md` dos últimos 14 dias (`curl -sL`); voz do comprador (`opinioes` só com autorização,
   porque gasta crédito pago). Cada sinal entra com título, fonte (URL ou "medido em DD/MM/AAAA em
   <onde>") e data. Sem fonte, fica de fora.
4. Nota de cada candidato, com pesos fixos para ser comparável entre semanas:

   `nota = 0,25·velocidade + 0,15·recência + 0,25·marca + 0,15·público + 0,10·fonte + 0,10·novidade`

   | Componente (0 a 100) | Como pontuar |
   |---|---|
   | velocidade | vários sinais sobre o mesmo assunto ou envios altos num post parecido = alto |
   | recência | até 3 dias 100; 4 a 7 70; 8 a 14 40; 15 a 30 20; mais velho 0. Dado próprio conta pela data da medição |
   | marca | pilar abaixo do peso do brand-brain nas últimas 10 peças, com tela do produto ou preço do site = alto |
   | público | toca um medo listado no brand-brain (overbooking, reserva perdida no WhatsApp, caderno e planilha, comissão de OTA, Pix não conferido, ficha em papel) = alto |
   | fonte | dado próprio medido ou fonte oficial 100; imprensa do setor 60; blog de fornecedor 30 |
   | novidade | nenhuma das últimas 10 peças cobre o tema nem usa o mesmo print = 100 |

5. Três ângulos para o maior: gancho, pilar, trilha, formato e CTA do brand-brain.
6. Pedido que já quer a peça pronta: monte o ângulo 1. Senão, apresente e espere a escolha.

## Modo 2: peça a partir de um sinal dado

Confira a fonte do sinal e monte a peça. Número sem fonte primária sai, e a resposta diz o que falta
para ele entrar. Afirmação de produto passa pela conferência no código ou no site.

## Montar e renderizar

- id `NN-slug`, NN = maior número de peça de feed + 1. Capa: ímpar `porta`, par `papel`; miolo em
  `papel`. Reel: `rN-capa-slug`.
- Reel: roteiro no formato de `roteiros-reels.md` mais capa no modelo `vertical`.
- Legenda no `LEIAME.md`: `### NN · Título (formato, tema)` e a legenda em citação. Link com
  `utm_source=instagram|tiktok`, `utm_medium=organic|paid` e `utm_campaign=<id da peça>`.
- Recorte novo de tela: capture com dados fictícios (landing pública ou pousada de demonstração), salve
  em `marketing/kit/assets/prints/` e diga de onde e quando veio.
- `cd marketing/kit && node gerar.mjs <id>`. Chrome nesta ordem: `CHROME=<caminho>`,
  `~/.local/bin/chrome-gomio` (Linux/WSL, ver o `LEIAME.md`) e o Chrome do macOS. Erro "Chrome nao
  encontrado": confira o caminho antes de culpar a peça.
- Abra cada PNG com a ferramenta Read. Texto estourando, contraste fraco ou letra pequena demais se
  corrigem no texto ou na escolha do modelo, não no CSS.

## Modo 3: registrar métricas

Uma linha por peça e plataforma no `registro.csv`: alcance, envios, salvamentos, comentarios,
cliques_site, testes_iniciados, assinaturas, observacao. Testes e assinaturas por campanha saem de
`GET /api/admin/aquisicao?dias=30` (`utm_campaign` = id da peça). Campo não informado fica vazio,
nunca estimado.

## Modo 4: revisão semanal

Por pilar, trilha e gancho: envios/alcance, salvamentos/alcance, cliques no site, testes iniciados e
assinaturas. Diga o que repetir e o que parar. Pesos dos pilares mudam por decisão humana: proponha.

## Resposta da rodada

1. Peças prontas e não publicadas.
2. Tabela de candidatos: sinal, fonte, data, 6 componentes, nota.
3. Ângulos do escolhido.
4. A peça: id, slides, legenda, PNGs, afirmações usadas com a fonte conferida, "renderizado e
   conferido".
5. Pendências antes de publicar (aprovação humana sempre está na lista).
6. Proposta de mudança no kit, se houver.
