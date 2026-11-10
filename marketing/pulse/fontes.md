# Fontes de sinais

Ordem de preferência: dado próprio medido > fonte oficial > pesquisa com engajamento real > imprensa
do setor. Endereços conferidos com `curl -sL` em 10/11/2026: "200" respondeu, "200, feed" é RSS ou
Atom com itens do dia. O que não respondeu ao `curl` está em "a confirmar", para abrir no navegador
antes de usar.

## 1. Dado próprio (o melhor sinal)

| Fonte | Serve para | Como obter |
|---|---|---|
| Funil por campanha | Revisão semanal, P2 | `GET /api/admin/aquisicao?dias=7` (cadastros, pousadas criadas e pagantes por `utm_source` e `utm_campaign`, `docs/funil-pago.md`) |
| Pousada de demonstração com dados fictícios | P1, P4 | Criar uma pousada de teste e gravar a tela da tarefa, com data |
| Landing pública | P1 | https://diaria.gomio.com.br (mapa com dados de exemplo) |
| `registro.csv` | Velocidade e novidade da nota | Métricas das peças publicadas |

## 2. Fontes oficiais

| Fonte | Pilar | Endereço | Status |
|---|---|---|---|
| Ministério do Turismo, notícias | P3 | https://www.gov.br/turismo/pt-br/assuntos/noticias | 200, página (o `/RSS` dá 404) |
| FNRH, Ficha Nacional de Registro de Hóspedes | P3, P4 | https://www.gov.br/turismo/pt-br/acesso-a-informacao/acoes-e-programas/programas-projetos-acoes-obras-e-atividades/ficha-nacional-de-registro-de-hospedes | 200, página |
| Cadastur | P3 | https://cadastur.turismo.gov.br/hotsite/ | 200, página |
| Banco Central, notícias | P3 (Pix) | https://www.bcb.gov.br/api/feed/sitebcb/sitefeeds/noticias | 200, feed Atom |
| Banco Central, Pix | P2, P3 | https://www.bcb.gov.br/estabilidadefinanceira/pix | 200, página |
| Banco Central, estatísticas do Pix | P3 | https://www.bcb.gov.br/estatisticas/pix | 200, página |
| Agência Brasil, economia | P3 | https://agenciabrasil.ebc.com.br/rss/economia/feed.xml | 200, feed |
| Agência Brasil, geral | P3 | https://agenciabrasil.ebc.com.br/rss/geral/feed.xml | 200, feed |
| Changelog da WhatsApp Business Platform | P2, P3 | https://developers.facebook.com/documentation/business-messaging/whatsapp/changelog | 200, página |
| Preços da WhatsApp Business Platform | P2 | https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing | 200, página |
| Booking.com Partner Hub | P3, P4 | https://partner.booking.com/pt-br | 200, página. Fonte da regra da própria OTA (comissão, calendário); nunca para sugerir parceria |
| Airbnb Newsroom | P3 | https://news.airbnb.com/pt | 200, página (feed dá 404) |

## 3. Imprensa e entidades do setor

| Fonte | Endereço | Status |
|---|---|---|
| Hotelier News | https://hoteliernews.com.br/feed/ | 200, feed |
| Revista Hotéis | https://revistahoteis.com.br/feed/ | 200, feed |
| Mercado & Eventos | https://www.mercadoeeventos.com.br/feed/ | 200, feed |
| PANROTAS, hotelaria | https://www.panrotas.com.br/hotelaria | 200, página. O `/feed` devolve "Acesso Bloqueado" ao `curl` |
| Agência Sebrae | https://agenciasebrae.com.br/feed/ | 200, feed (filtrar turismo e hospedagem) |
| FOHB, Fórum de Operadores Hoteleiros do Brasil | https://fohb.com.br/ | 200, página |
| ABIH Nacional | https://abih.com.br/ | 200, página |

## 4. A confirmar (não responderam ao `curl` em 10/11/2026)

| Fonte | Endereço | O que aconteceu |
|---|---|---|
| IBGE, Pesquisa Mensal de Serviços (atividades turísticas) | https://www.ibge.gov.br/estatisticas/economicas/servicos/9229-pesquisa-mensal-de-servicos.html | 403 |
| IBGE, Pesquisa de Serviços de Hospedagem | https://www.ibge.gov.br/estatisticas/economicas/servicos/9064-pesquisa-de-servicos-de-hospedagem.html | 403 |
| Embratur | https://embratur.com.br/ | 403 |
| Dados e Fatos do Turismo (MTur) | https://www.dadosefatos.turismo.gov.br/ | sem resposta |
| Brasilturis | https://brasilturis.com.br/feed/ | 403 |
| CNC (turismo) | https://www.cnc.org.br/ | sem resposta |

## 5. Voz do comprador

- Não há pesquisa de público neste repositório (10/11/2026).
- Pesquisa nova: skill `opinioes` (usa créditos pagos do ScrapeCreators; confirmar antes de rodar).
  Temas: overbooking, reserva pelo WhatsApp, comissão de OTA, sistema para pousada, FNRH.
- Pesquisa global dos últimos 30 dias: skill `last30days`.

## Não usar como fonte

Post de rede social sem origem, print sem link, "pesquisa diz" sem link, número de blog de fornecedor
de software para hotel sem metodologia, resposta de modelo de IA sem fonte.
