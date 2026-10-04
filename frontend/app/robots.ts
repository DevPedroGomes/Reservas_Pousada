import type { MetadataRoute } from "next"

const URL_APP = process.env.NEXT_PUBLIC_APP_URL || "https://diaria.pgdev.com.br"

/** Só as páginas públicas são indexáveis; a área logada e fluxos de token não. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/cadastro", "/privacidade", "/termos"],
      disallow: ["/painel", "/reservas", "/configuracoes", "/assinatura", "/admin", "/convite", "/onboarding", "/reset-password", "/verify-email", "/auth", "/checkin"],
    },
    sitemap: `${URL_APP}/sitemap.xml`,
  }
}
