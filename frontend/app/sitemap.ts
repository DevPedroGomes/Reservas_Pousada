import type { MetadataRoute } from "next"

const URL_APP = process.env.NEXT_PUBLIC_APP_URL || "https://diaria.pgdev.com.br"

export default function sitemap(): MetadataRoute.Sitemap {
  const agora = new Date()
  return [
    { url: `${URL_APP}/`, lastModified: agora, changeFrequency: "weekly", priority: 1 },
    { url: `${URL_APP}/cadastro`, lastModified: agora, changeFrequency: "monthly", priority: 0.8 },
    { url: `${URL_APP}/privacidade`, lastModified: agora, changeFrequency: "yearly", priority: 0.3 },
    { url: `${URL_APP}/termos`, lastModified: agora, changeFrequency: "yearly", priority: 0.3 },
  ]
}
