// Gera as pecas do Instagram e do TikTok do Diaria a partir de posts.json e exporta PNG pelo Chrome headless.
// Uso: node gerar.mjs            (gera tudo)
//      node gerar.mjs 01-tem-vaga (gera so os ids que comecam com o filtro)
// Saida: build/<id>-<n>.html e exports/<id>-<n>.png. Peca com o campo 'bloqueio' sai em
// bloqueadas/, para que exports/ tenha so o que pode ser publicado.
// Mesma interface do kit da Gomio (modelos e campos); muda a marca: porta do Diaria, tokens do
// frontend/app/globals.css, fontes de frontend/app/fontes e o credito do rodape vindo de posts.json.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(fileURLToPath(import.meta.url));

// Chrome, nesta ordem: CHROME=<caminho> (se definido, e obrigatorio existir),
// ~/.local/bin/chrome-gomio (chrome-headless-shell sem sudo no Linux/WSL, ver LEIAME.md)
// e, por fim, o Chrome do macOS.
function acharChrome() {
  if (process.env.CHROME) {
    if (!fs.existsSync(process.env.CHROME)) throw new Error(`CHROME=${process.env.CHROME} nao existe.`);
    return process.env.CHROME;
  }
  const candidatos = [
    path.join(os.homedir(), '.local', 'bin', 'chrome-gomio'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  const achado = candidatos.find((c) => fs.existsSync(c));
  if (!achado) throw new Error(`Chrome nao encontrado. Defina CHROME=<caminho> ou instale um destes: ${candidatos.join(', ')}`);
  return achado;
}
const CHROME = acharChrome();
const FORMATOS = { feed: [1080, 1350], vertical: [1080, 1920], quadrada: [1080, 1080] };
const TEMAS = { papel: '', cafe: 'tema-cafe', porta: 'tema-porta' };

const ler = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8');
const icone = (nome) => ler(`assets/icones/${nome}.svg`).replace(/^<svg /, '<svg aria-hidden="true" ');

// Marca do Diaria: a porta com verga em arco, copiada de frontend/components/landing/MarcaDiaria.tsx.
// As cores saem de tokens do CSS para o simbolo inverter no tema porta (fundo claro, vao terracota).
const PORTA = {
  externa: 'M8 27V12.5C8 8.4 11.6 5.5 16 5.5s8 2.9 8 7V27z',
  interna: 'M10.2 27V13c0-3 2.6-5.2 5.8-5.2s5.8 2.2 5.8 5.2v14z',
  montante: 'M15.3 7.9h1.4V27h-1.4z',
};
const simbolo = (classe = 'simbolo') => `<svg class="${classe}" viewBox="0 0 32 32" aria-hidden="true">
  <rect width="32" height="32" rx="7" class="s-fundo"/><path d="${PORTA.externa}" class="s-porta"/>
  <path d="${PORTA.interna}" class="s-vao"/><path d="${PORTA.montante}" class="s-porta"/></svg>`;

const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Texto corrido aceita **negrito** e quebra de paragrafo com linha em branco. Titulo nao aceita marcacao.
const rico = (s = '') => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').split(/\n{2,}/).map((p) => p.replace(/\n/g, '<br>')).join('</p><p class="corpo" style="margin-top:28px">');

function semTravessao(texto, onde) {
  if (/[—–]/.test(texto)) throw new Error(`Travessao proibido em texto visivel (${onde}). Use ponto, virgula ou dois-pontos.`);
}

// Supergrafico: o batente da porta, recortado pela borda (papel e cafe), ou as almofadas da porta
// pintada da landing (tema porta). So em capa e vertical.
const supergrafico = (pos = 'canto') => pos === 'porta'
  ? '<div class="super almofadas" aria-hidden="true"><i></i><i></i><i></i><i></i></div>'
  : `<svg class="super ${pos}" viewBox="8 5.5 16 21.5" aria-hidden="true"><path fill-rule="evenodd" d="${PORTA.externa} ${PORTA.interna} ${PORTA.montante}"/></svg>`;
const superPadrao = (s, tema, pos) => (s.super === false ? '' : supergrafico(s.super || (tema === 'porta' ? 'porta' : pos)));

// Um ou mais recortes reais empilhados no mesmo bezel
const imagens = (s) => [].concat(s.imagem || s.imagens).map((src) =>
  `<img src="../assets/prints/${esc(src)}" alt="${esc(s.alt || '')}">`).join('');

// Hifen de dominio nao pode quebrar linha
const dominio = (t) => esc(t).replace(/([a-z])-([a-z]+\.)/g, '$1&#8209;$2');

// ---------- modelos ----------
const modelos = {
  // Capa ou manchete: a peca que para o dedo. Unica com supergrafico.
  capa: (s, tema) => `
    ${superPadrao(s, tema, 'canto')}
    ${s.serie ? `<div class="serie">${esc(s.serie)}</div>` : ''}
    <h1 class="manchete ${s.tamanho || ''}">${esc(s.titulo)}</h1>
    ${s.sub ? `<div class="espaco-m"></div><p class="sub">${rico(s.sub)}</p>` : ''}`,

  // Slide de texto com lista opcional (um fio por item, so em cima)
  texto: (s) => `
    <h2 class="titulo">${esc(s.titulo)}</h2>
    ${s.corpo ? `<div class="espaco-m"></div><p class="corpo ${s.itens ? '' : 'grande'}">${rico(s.corpo)}</p>` : ''}
    ${s.itens ? `<ul class="lista">${s.itens.map((i) => `<li><span class="lead">${esc(i.lead)}</span>${i.mais ? `<span class="mais">${rico(i.mais)}</span>` : ''}</li>`).join('')}</ul>` : ''}`,

  // Pergunta numerada: so para carrossel que e de fato uma sequencia
  pergunta: (s) => `
    <div class="pergunta-n">${esc(s.n)}</div>
    <div class="empurra"></div>
    <h2 class="pergunta-t">${esc(s.titulo)}</h2>
    <div class="espaco-m"></div>
    <p class="corpo">${rico(s.corpo)}</p>
    <div style="height:190px"></div>`,

  // Numero grande com fonte citada
  numero: (s) => `
    ${s.serie ? `<div class="serie">${esc(s.serie)}</div>` : ''}
    <div class="empurra"></div>
    <div class="num valor ${s.tamanho || ''}">${esc(s.valor)}</div>
    <p class="rotulo-valor">${rico(s.rotulo)}</p>
    ${s.fonte ? `<p class="fonte">${esc(s.fonte)}</p>` : ''}
    <div style="height:210px"></div>`,

  // Prova: recorte real de tela dentro do bezel. Legenda fica fora da imagem.
  prova: (s) => `
    <h2 class="titulo" style="font-size:${s.tamanhoTitulo || 60}px">${esc(s.titulo)}</h2>
    <div class="espaco-m"></div>
    <figure style="width:${s.largura || 904}px;align-self:${s.alinhar || 'center'}">
      <div class="bezel"><div class="bezel-nucleo empilhado ${s.imagens ? 'chat' : ''}" style="${s.altura ? `height:${s.altura}px;` : ''}">${imagens(s)}</div></div>
      <figcaption class="legenda">${dominio(s.legenda || 'Tela do Diária com dados fictícios.')}</figcaption>
    </figure>`,

  // Prova lado a lado: para recorte alto (tela de celular)
  provaLado: (s) => `
    <h2 class="titulo">${esc(s.titulo)}</h2>
    <div class="lado">
      <div>${s.corpo ? `<p class="corpo">${rico(s.corpo)}</p>` : ''}<p class="legenda">${dominio(s.legenda || 'Tela do Diária com dados fictícios.')}</p><div style="height:150px"></div></div>
      <div class="bezel"><div class="bezel-nucleo empilhado">${imagens(s)}</div></div>
    </div>`,

  // Citacao curta (ate 3 linhas). So com autor real e autorizacao registrada.
  citacao: (s, tema) => `
    ${s.super ? superPadrao(s, tema, s.super) : ''}
    <div class="empurra"></div>
    <blockquote class="aspas">${esc(s.texto)}</blockquote>
    <p class="autor"><strong>${esc(s.autor)}</strong>${s.cargo ? `, ${esc(s.cargo)}` : ''}</p>
    <div style="height:220px"></div>`,

  // Comparativo em duas colunas
  comparativo: (s) => `
    <h2 class="titulo">${esc(s.titulo)}</h2>
    <div class="duas">
      ${[s.esquerda, s.direita].map((c, i) => `<div class="coluna ${i ? 'forte' : ''}"><h3>${esc(c.titulo)}</h3><ul>${c.itens.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`).join('')}
    </div>`,

  // Chamada final: o botao nomeia a acao exata
  cta: (s) => `
    <div class="empurra"></div>
    <h2 class="manchete media">${esc(s.titulo)}</h2>
    ${s.corpo ? `<div class="espaco-s"></div><p class="sub">${rico(s.corpo)}</p>` : ''}
    <div class="acao">${esc(s.acao)}<span class="seta">${icone('arrow-right')}</span></div>
    ${s.detalhe ? `<p class="detalhe">${rico(s.detalhe)}</p>` : ''}
    <div style="height:200px"></div>`,

  // Capa de reel e story: conteudo dentro da zona segura
  vertical: (s, tema) => `
    ${superPadrao(s, tema, 'alto')}
    <div class="zona">
      ${s.serie ? `<div class="serie">${esc(s.serie)}</div>` : ''}
      <h1 class="manchete ${s.tamanho || ''}">${esc(s.titulo)}</h1>
      ${s.sub ? `<div class="espaco-m"></div><p class="sub">${rico(s.sub)}</p>` : ''}
      ${s.acao ? `<div class="acao">${esc(s.acao)}<span class="seta">${icone('arrow-right')}</span></div>` : ''}
      ${s.detalhe ? `<p class="detalhe">${rico(s.detalhe)}</p>` : ''}
    </div>`,

  // Capa de destaque: o app recorta um circulo no centro
  destaque: (s) => `<div class="disco">${icone(s.icone)}</div>`,

  // Foto de perfil: o simbolo da porta
  avatar: (s) => `<div style="position:absolute;inset:0;display:grid;place-items:center">${simbolo('simbolo-avatar').replace('class="simbolo-avatar"', `class="simbolo-avatar" style="height:${s.altura || 560}px"`)}</div>`,
};

const posts = JSON.parse(ler('posts.json'));
// Assinatura do rodape. Organico no perfil da Gomio e anuncio com identidade Gomio levam o credito;
// num perfil proprio do Diaria, credito vazio ("") tira a linha.
const MARCA = { nome: 'Diária', credito: 'da Gomio', site: 'diaria.gomio.com.br', ...(posts.marca || {}) };
const logo = `<span class="logo" role="img" aria-label="${esc(MARCA.nome)}${MARCA.credito ? `, ${esc(MARCA.credito)}` : ''}">${simbolo()}<span class="logo-nome">${esc(MARCA.nome)}</span>${MARCA.credito ? `<span class="logo-credito">, ${esc(MARCA.credito)}</span>` : ''}</span>`;
const rodape = (direita) => `<footer class="rodape">${logo}${direita}</footer>`;

function pagina(post, slide, i, total) {
  const formato = slide.formato || post.formato || 'feed';
  const tema = slide.tema || post.tema || 'papel';
  if (!(tema in TEMAS)) throw new Error(`Tema desconhecido: ${tema} em ${post.id}. Use ${Object.keys(TEMAS).join(', ')}.`);
  const [w, h] = FORMATOS[formato];
  const corpo = modelos[slide.modelo];
  if (!corpo) throw new Error(`Modelo desconhecido: ${slide.modelo} em ${post.id}`);
  const semRodape = ['destaque', 'avatar'].includes(slide.modelo) || slide.rodape === false;
  const direita = total > 1 ? `<span class="contador">${i + 1}/${total}</span>` : `<span class="site">${dominio(MARCA.site)}</span>`;
  const classes = ['peca', `m-${slide.modelo}`, TEMAS[tema], formato !== 'feed' ? formato : '', slide.modelo === 'destaque' ? 'destaque' : ''].join(' ');
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(post.id)}</title>
<link rel="stylesheet" href="../sistema.css"><style>html,body{width:${w}px;height:${h}px;overflow:hidden}</style></head>
<body><main class="${classes}">${corpo(slide, tema)}${semRodape ? '' : rodape(direita)}</main></body></html>`;
  semTravessao(html.replace(/<[^>]+>/g, ''), `${post.id} slide ${i + 1}`);
  return { html, w, h };
}

const filtro = process.argv[2] || '';
fs.mkdirSync(path.join(RAIZ, 'build'), { recursive: true });
fs.mkdirSync(path.join(RAIZ, 'exports'), { recursive: true });
let n = 0;
let bloqueadas = 0;
for (const post of posts.pecas) {
  if (filtro && !post.id.startsWith(filtro)) continue;
  const destino = post.bloqueio ? 'bloqueadas' : 'exports';
  fs.mkdirSync(path.join(RAIZ, destino), { recursive: true });
  const slides = post.slides || [post];
  slides.forEach((slide, i) => {
    const { html, w, h } = pagina(post, slide, i, slides.length);
    const nome = slides.length > 1 ? `${post.id}-${String(i + 1).padStart(2, '0')}` : post.id;
    const arq = path.join(RAIZ, 'build', `${nome}.html`);
    fs.writeFileSync(arq, html);
    execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--run-all-compositor-stages-before-draw',
      '--allow-file-access-from-files', '--virtual-time-budget=2500', `--window-size=${w},${h}`,
      `--screenshot=${path.join(RAIZ, destino, `${nome}.png`)}`, `file://${arq}`], { stdio: 'ignore' });
    if (post.bloqueio) bloqueadas++; else n++;
  });
}
console.log(`${n} pecas exportadas em exports/` + (bloqueadas ? `; ${bloqueadas} bloqueadas em bloqueadas/` : ''));
