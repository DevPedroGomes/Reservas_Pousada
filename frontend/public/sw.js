/*
 * Service worker do Diária (app instalável).
 *
 * Regras:
 * - Nunca guarda resposta da API (tem dado de hóspede) nem páginas logadas:
 *   navegação é sempre pela rede; sem rede, mostra /offline.html.
 * - Guarda só arquivo estático versionado (/_next/static, ícones), que não
 *   muda de conteúdo — abre mais rápido e funciona com rede ruim.
 */
const VERSAO = "diaria-v1";
const ESTATICOS = ["/offline.html", "/icones/icone-192.png", "/logo.png"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ESTATICOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (evento) => {
  const req = evento.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API e terceiros: nunca passam por aqui

  if (req.mode === "navigate") {
    evento.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icones/")) {
    evento.respondWith(
      caches.match(req).then((guardado) =>
        guardado ||
        fetch(req).then((resposta) => {
          if (resposta.ok) {
            const copia = resposta.clone();
            caches.open(VERSAO).then((c) => c.put(req, copia));
          }
          return resposta;
        }),
      ),
    );
  }
});
