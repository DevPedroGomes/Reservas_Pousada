import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { MotorDeReservas, type PousadaPublica, type QuartoPublico } from "../../../components/publico/MotorDeReservas"

const API = (process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "")

async function carregar(slug: string): Promise<{ pousada: PousadaPublica; quartos: QuartoPublico[] } | null> {
  try {
    const r = await fetch(`${API}/api/publico/${encodeURIComponent(slug)}`, { next: { revalidate: 60 } })
    if (!r.ok) return null
    const d = await r.json()
    return d.sucesso ? { pousada: d.pousada, quartos: d.quartos } : null
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const dados = await carregar(slug)
  if (!dados) return { title: "Reservas — Diária", robots: { index: false } }
  const { pousada } = dados
  const local = [pousada.cidade, pousada.estado].filter(Boolean).join(" - ")
  return {
    title: `Reservas — ${pousada.nome}${local ? ` (${local})` : ""}`,
    description: pousada.descricao?.slice(0, 160) || `Veja quartos e disponibilidade e faça sua reserva na ${pousada.nome}.`,
    alternates: { canonical: `/r/${pousada.slug}` },
  }
}

/** Página pública de reservas da pousada (motor de reservas). */
export default async function PaginaDeReservas({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const dados = await carregar(slug)
  if (!dados) notFound()
  return <MotorDeReservas slug={slug} pousada={dados.pousada} quartos={dados.quartos} />
}
