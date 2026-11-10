# Kit de peças do Diária

Gera os PNG de feed, reel e story do Diária com a mesma mecânica do kit da Gomio
(`gomio-workspace/marketing/instagram/`): mesmos modelos de slide, mesmos campos, mesma recusa de
travessão. Muda a marca: símbolo da porta, tokens e fontes do site do Diária, e o crédito "Diária, da
Gomio" no rodapé.

**Regras de conteúdo** (detalhe em [`../brand-brain.md`](../brand-brain.md)):
- Só sai preço que o site mostra: Essencial R$ 89/mês, Pousada R$ 149/mês, Rede R$ 299/mês; 14 dias
  grátis, sem cartão. Sem valor do anual.
- Booking e Airbnb sempre com o limite do iCal (horas de atraso do lado delas). Nunca "parceiro" nem
  "integração oficial".
- A FNRH é coletada no pré-check-in e não é enviada ao governo.
- Atendente virtual do WhatsApp só depois de confirmar o App Review da Meta em produção.
- Prova é tela real com dados fictícios, com "dados fictícios" na legenda.

## Gerar as peças

```bash
node gerar.mjs                 # tudo
node gerar.mjs 01-tem-vaga     # só os ids que começam com o filtro
```

O conteúdo fica em `posts.json`; a saída vai para `exports/` (PNG, versionado) e `build/` (HTML,
ignorado pelo Git). Peça com o campo `bloqueio` sai em `bloqueadas/`, fora de `exports/`. O gerador
não usa npm e **recusa texto com travessão**. Chrome, nesta ordem: `CHROME=<caminho>`,
`~/.local/bin/chrome-gomio` (Linux/WSL: `chrome-headless-shell` com as libs em
`~/.local/lib/chrome-deps/`, o mesmo da Gomio; teste com `chrome-gomio --version`) e o Chrome do macOS.

Depois de gerar, abra cada PNG novo e confira texto estourado, contraste e legibilidade. Confira
também que `exports/` só tem peça que está no `posts.json`.

| Arquivo | Para quê |
|---|---|
| `sistema.css` | Tokens: papel e café (os temas claro e escuro de `frontend/app/globals.css`) e porta (a porta pintada da landing) |
| `gerar.mjs` | Modelos de peça, símbolo da porta e exportação |
| `posts.json` | Conteúdo de cada peça e o bloco `marca` (nome, crédito, site do rodapé) |
| `fonts/` | Space Grotesk, IBM Plex Sans e IBM Plex Mono, cópia de `frontend/app/fontes` (OFL 1.1, ver `fonts/LICENCA.md`) |
| `assets/prints/` | Recortes reais de tela com dados fictícios. Nunca tela montada à mão nem conta de cliente |
| `assets/icones/` | Ícones Lucide (ISC), os mesmos do site: seta do botão e capas de destaque |
| `roteiros-reels.md` | Roteiros dos reels |

**Modelos** (campo `modelo`): `capa` (único com supergráfico), `texto` (título com `itens` ou
corpo), `pergunta` (item de sequência), `numero` (número grande, sempre com fonte), `prova` e
`provaLado` (recorte real na moldura), `comparativo`, `cta` (o botão diz a ação exata), `citacao`
(só com autor real e autorização), `vertical` (capa de reel e story), `destaque` (campo `icone` com o
nome de um arquivo de `assets/icones/`) e `avatar`.

**Campos comuns:** `tema` (`papel`, `cafe` ou `porta`; vale para a peça e pode ser trocado por slide),
`formato` (`feed` 1080x1350, `vertical` 1080x1920, `quadrada` 1080x1080), `tamanho` na manchete
(`menor`, `media`, `gigante`), `super` (`canto`, `alto`, `porta` ou `false`), `rodape: false`.

**Marca no feed:**
- Capa na grade: ímpar = `porta` (terracota, com as almofadas da porta e o texto centrado, como a
  abertura do site), par = `papel` (batente da porta no supergráfico). O miolo do carrossel fica em
  `papel`; `cafe` para story e para contraste pontual.
- Terracota em uma coisa só por slide de papel (o botão ou o número).
- Margem de 88 px, porque a grade corta a peça 4:5 para 3:4.
- Rodapé em toda peça de feed: símbolo da porta, "Diária" e o crédito de `marca.credito`. Num perfil
  próprio do Diária, `"credito": ""` tira o "da Gomio".

**Recortes atuais** (`assets/prints/`), capturados de https://diaria.gomio.com.br em 10/11/2026, com
os dados de exemplo da landing e "prefers-reduced-motion" ligado (o mapa aparece inteiro):
- `mapa-ocupacao-celular.png`: mapa de 5 dias na largura de celular (920x923).
- `mapa-ocupacao-desktop.png`: mapa de 12 dias (2232x738). Texto pequeno demais para um slide
  inteiro; serve para recorte ou para anúncio horizontal.

## Ordem de publicação

| Ordem | Peça | Capa | Trilha |
|---|---|---|---|
| 1 | `01-tem-vaga` | porta | as duas |
| 2 | Reel R1 (capa `r1-capa-reserva-em-dobro`) | papel | pousada com equipe |

O reel R1 só sai com o vídeo gravado (`roteiros-reels.md`); a capa sozinha não vai para a grade.

## Legendas

Link da bio para a semana desta peça (troque o `utm_campaign` a cada peça e anote no `registro.csv`):
`https://diaria.gomio.com.br/?utm_source=instagram&utm_medium=organic&utm_campaign=01-tem-vaga`

No TikTok, o mesmo link com `utm_source=tiktok`. Em anúncio, `utm_medium=paid`.

### 01 · Tem vaga? (carrossel, capa porta)
> Tem vaga? Quando a resposta depende do caderno da recepção, da planilha e das conversas do WhatsApp, o mesmo quarto pode ser vendido duas vezes.
> No Diária, todo quarto e todo dia ficam numa tela só. O sistema recusa duas reservas no mesmo quarto e período, venham da equipe, do site da pousada, de planilha importada ou dos calendários do Booking e do Airbnb.
> O Booking e o Airbnb levam horas para atualizar o calendário do lado deles. Nessa janela, feche à mão as datas mais disputadas.
> Também tem Pix do sinal na sua chave ou pela sua conta Asaas, pré-reserva com prazo, mensagens prontas no WhatsApp e pré-check-in pelo link.
> Teste 14 dias grátis, sem cartão. Planos a partir de R$ 89 por mês, sem comissão por reserva: diaria.gomio.com.br, link na bio.
> Mapa com dados fictícios.
> #pousada #hotelaria #gestaodepousada

### Reel R1 · Reserva em dobro (capa papel)
> Tentei vender o mesmo quarto duas vezes, para a mesma data. O Diária recusou a segunda reserva.
> A trava vale para reserva feita pela equipe, pelo site da pousada, por planilha importada e pelos calendários do Booking e do Airbnb. Esses dois levam horas para atualizar do lado deles, então feche à mão as datas mais disputadas.
> Gravado numa pousada de teste, com dados fictícios. Teste 14 dias grátis, sem cartão: link na bio.
> Mande para quem cuida das reservas aí.
> #pousada #hotelaria #recepcao
