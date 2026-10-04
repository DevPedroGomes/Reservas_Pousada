import type { MetadataRoute } from "next"

/** App instalável: abre direto no painel, como um aplicativo. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Diária — reservas da pousada",
    short_name: "Diária",
    description: "Mapa de ocupação, reservas, hóspedes e recebimentos da sua pousada.",
    start_url: "/painel?origem=app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fafaf9",
    theme_color: "#ea580c",
    lang: "pt-BR",
    categories: ["business", "productivity", "travel"],
    icons: [
      { src: "/icones/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icones/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icones/icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Nova reserva", url: "/reservas/nova", icons: [{ src: "/icones/icone-192.png", sizes: "192x192" }] },
      { name: "Mapa de ocupação", url: "/mapa", icons: [{ src: "/icones/icone-192.png", sizes: "192x192" }] },
    ],
  }
}
