import type { Metadata } from "next"
import Link from "next/link"
import { AcessoNoTopo } from "../components/landing/AcessoNoTopo"
import { DIAS_DE_TRIAL, PLANOS_PUBLICOS } from "../lib/planos-publicos"

/**
 * Página pública — renderizada no servidor.
 *
 * Antes a landing e o painel eram o MESMO componente client: o HTML que o
 * Google e a prévia dos anúncios recebiam era um spinner "Carregando...".
 * Agora o HTML já vem com o conteúdo (SEO, índice de qualidade do anúncio,
 * primeira pintura rápida no celular).
 *
 * Só promete o que o produto entrega hoje. Recurso novo entra aqui quando
 * estiver no ar — anúncio que promete o que não existe vira cancelamento no
 * trial e reclamação.
 */

const URL_APP = process.env.NEXT_PUBLIC_APP_URL || "https://diaria.pgdev.com.br"
const CONTATO = process.env.NEXT_PUBLIC_CONTATO_EMAIL || ""

export const metadata: Metadata = {
  title: "Diária — sistema de reservas para pousadas",
  description:
    "Reservas sem overbooking, chegadas e saídas do dia e a equipe trabalhando junta. Teste grátis por 14 dias, sem cartão.",
  alternates: { canonical: URL_APP },
  openGraph: {
    title: "Diária — a recepção da sua pousada, organizada",
    description: "Reservas sem overbooking, painel do dia e equipe com permissões. 14 dias grátis, sem cartão.",
    url: URL_APP,
    siteName: "Diária",
    locale: "pt_BR",
    type: "website",
  },
}

const recursos = [
  {
    titulo: "Mapa de ocupação",
    texto: "Todos os quartos e os próximos dias numa grade: responda “tem vaga?” em segundos e clique no espaço livre para reservar.",
  },
  {
    titulo: "Booking e Airbnb sem overbooking",
    texto: "O sistema recusa duas reservas no mesmo quarto e período. Com o calendário das OTAs ligado, o que entra por lá também bloqueia o quarto.",
  },
  {
    titulo: "O dia na primeira tela",
    texto: "Chegadas, saídas e hospedados, com check-in e check-out em um clique e pré-reserva que se cancela sozinha se o sinal não vier.",
  },
  {
    titulo: "Hóspedes com histórico",
    texto: "CPF ou passaporte, WhatsApp a um clique e todas as estadias de cada cliente — para atender bem quem volta.",
  },
  {
    titulo: "Sinal, pagamentos e saldo",
    texto: "Lance o sinal, pagamentos parciais e o consumo; o saldo de cada reserva e o total a receber aparecem sozinhos.",
  },
  {
    titulo: "Tarifário automático",
    texto: "Preço de temporada, fim de semana e pacote com mínimo de noites: o valor da reserva já vem calculado.",
  },
  {
    titulo: "Relatórios que ajudam a decidir",
    texto: "Ocupação, diária média, RevPAR e receita por canal no período que você escolher.",
  },
  {
    titulo: "Equipe junta, até no celular",
    texto: "Recepção, administração e auditoria com permissões e histórico de quem mudou o quê. No plano Rede, até 3 pousadas.",
  },
  {
    titulo: "Sua planilha entra em minutos",
    texto: "Importe as reservas do Excel: o sistema confere cada linha antes de gravar. E exporte quando quiser.",
  },
]

const dores = [
  ["Duas reservas no mesmo quarto", "Choque de datas é bloqueado na hora — inclusive com o que entra pelo Booking e pelo Airbnb."],
  ["Caderno que só uma pessoa entende", "Toda a equipe vê o mesmo mapa e a mesma agenda, atualizados sozinhos, de qualquer aparelho."],
  ["Não saber quanto falta receber", "Cada sinal e pagamento fica lançado: o saldo de cada hóspede e o total a receber estão sempre à vista."],
]

const passos = [
  ["Crie sua conta", "Com e-mail ou Google, em menos de um minuto."],
  ["Cadastre a pousada", "Nome e número de quartos — o resto pode ficar para depois."],
  ["Lance ou importe suas reservas", "Digite ou traga a planilha, ligue o Booking e o Airbnb e convide a equipe."],
]

const faq = [
  ["Preciso de cartão de crédito para testar?", `Não. São ${DIAS_DE_TRIAL} dias com tudo liberado. Você só escolhe um plano se quiser continuar.`],
  ["Minha equipe pode usar ao mesmo tempo?", "Pode. As telas se atualizam sozinhas e o sistema impede duas reservas no mesmo quarto e período, mesmo lançadas ao mesmo tempo."],
  ["Quantos quartos posso cadastrar?", "Até 10 no Essencial, 25 no Pousada e 100 no Rede (em até 3 propriedades)."],
  ["Funciona no celular?", "Sim, pelo navegador do celular ou do tablet, sem instalar nada."],
  ["Funciona com Booking e Airbnb?", "Sim, pela sincronização de calendário (iCal) de cada quarto: o que é vendido lá bloqueia aqui, e o que é vendido aqui bloqueia lá. As OTAs atualizam o calendário a cada 30 minutos, em média."],
  ["Consigo trazer minhas reservas do Excel?", "Sim. Salve a planilha como CSV e importe: o sistema mostra uma prévia, aponta as linhas com problema e só grava depois da sua conferência."],
  ["E os dados dos meus hóspedes?", "O CPF é guardado cifrado, cada pessoa da equipe só acessa o que o papel dela permite, e cada visualização fica registrada."],
  ["Posso cancelar quando quiser?", "Sim, sem fidelidade. E você exporta suas reservas em planilha a qualquer momento."],
]

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Diária",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description: "Sistema de reservas e gestão para pousadas.",
  offers: PLANOS_PUBLICOS.map((p) => ({
    "@type": "Offer",
    name: p.nome,
    price: p.mensal,
    priceCurrency: "BRL",
  })),
}

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="sticky top-0 z-50 border-b border-border/40 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" className="h-8 w-8 rounded-lg object-cover" />
            <span className="text-sm font-semibold">Diária</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#recursos" className="hover:text-foreground">Recursos</a>
            <a href="#planos" className="hover:text-foreground">Planos</a>
            <a href="#perguntas" className="hover:text-foreground">Dúvidas</a>
          </nav>
          <AcessoNoTopo />
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-4 pb-16 pt-14 sm:px-6 md:pb-24 md:pt-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{ background: "radial-gradient(ellipse 70% 50% at 50% 0%, hsl(25 80% 55% / 0.12), transparent 60%)" }}
        />
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
          <div className="space-y-7">
            <span className="inline-flex rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              Para pousadas de 3 a 100 quartos
            </span>
            <h1 className="text-4xl font-bold leading-[1.05] tracking-tight md:text-5xl lg:text-6xl">
              A recepção da sua pousada, <span className="text-primary">organizada</span>.
            </h1>
            <p className="max-w-lg text-lg leading-relaxed text-muted-foreground">
              Mapa de ocupação, reservas sem overbooking (inclusive Booking e Airbnb), sinal e saldo de cada hóspede
              e a equipe trabalhando junta — do computador ou do celular. Sem planilha, sem caderno.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/cadastro" className="inline-flex h-12 items-center justify-center rounded-lg bg-primary px-6 text-base font-semibold text-primary-foreground hover:bg-primary/90">
                Testar {DIAS_DE_TRIAL} dias grátis
              </Link>
              <a href="#planos" className="inline-flex h-12 items-center justify-center rounded-lg border border-border bg-white px-6 text-base font-medium hover:bg-muted/50">
                Ver planos e preços
              </a>
            </div>
            <p className="text-xs text-muted-foreground">Sem cartão de crédito · Cancele quando quiser · Dados protegidos pela LGPD</p>
          </div>

          {/* Ilustração do painel (estática) */}
          <div aria-hidden className="rounded-2xl border border-border/60 bg-white p-5 shadow-xl shadow-orange-900/5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold">Hoje</p>
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Ocupação 82%</span>
            </div>
            <div className="mb-4 grid grid-cols-3 gap-3 text-center">
              {[["3", "chegadas"], ["2", "saídas"], ["R$ 1.840", "a receber"]].map(([n, t]) => (
                <div key={t} className="rounded-xl bg-muted/50 p-3">
                  <p className="text-lg font-bold">{n}</p>
                  <p className="text-xs text-muted-foreground">{t}</p>
                </div>
              ))}
            </div>
            {[["4", "Família Souza", "a pagar"], ["7", "Marina e Lucas", ""], ["2", "João Pereira", ""]].map(([q, n, s]) => (
              <div key={n} className="flex items-center justify-between border-t border-border/50 py-2.5 text-sm">
                <span className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-xs font-semibold text-primary">{q}</span>
                  {n}
                </span>
                {s && <span className="text-xs text-amber-600">{s}</span>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Dores */}
      <section className="border-t border-border/40 bg-white px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">Chega de improviso na recepção</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {dores.map(([dor, solucao]) => (
              <div key={dor} className="rounded-xl border border-border/50 p-6">
                <p className="text-sm font-medium text-rose-600 line-through decoration-rose-300">{dor}</p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{solucao}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recursos */}
      <section id="recursos" className="border-t border-border/40 px-4 py-16 sm:px-6 md:py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">O que você tem no Diária</h2>
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {recursos.map((r) => (
              <div key={r.titulo} className="rounded-xl border border-border/50 bg-white p-6">
                <h3 className="text-base font-semibold">{r.titulo}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{r.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section className="border-t border-border/40 bg-white px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-semibold tracking-tight">Em 5 minutos a primeira reserva está lançada</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {passos.map(([t, d], i) => (
              <li key={t} className="rounded-xl border border-border/50 p-6">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{i + 1}</span>
                <p className="mt-4 font-semibold">{t}</p>
                <p className="mt-1 text-sm text-muted-foreground">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="border-t border-border/40 px-4 py-16 sm:px-6 md:py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">Planos simples, sem fidelidade</h2>
          <p className="mt-3 text-center text-muted-foreground">
            {DIAS_DE_TRIAL} dias grátis em qualquer plano. No anual, 2 meses saem de graça.
          </p>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {PLANOS_PUBLICOS.map((p) => (
              <div
                key={p.codigo}
                className={`flex flex-col rounded-2xl border bg-white p-6 ${"destaque" in p && p.destaque ? "border-primary shadow-lg shadow-orange-900/10" : "border-border/60"}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{p.nome}</h3>
                  {"destaque" in p && p.destaque && (
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">Mais escolhido</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{p.resumo}</p>
                <p className="mt-5">
                  <span className="text-4xl font-bold">R$ {p.mensal}</span>
                  <span className="text-sm text-muted-foreground">/mês</span>
                </p>
                <ul className="mt-5 flex-1 space-y-2 text-sm">
                  {p.itens.map((i) => (
                    <li key={i} className="flex gap-2"><span className="text-emerald-600">✓</span>{i}</li>
                  ))}
                </ul>
                <Link href="/cadastro" className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                  Começar teste grátis
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Perguntas */}
      <section id="perguntas" className="border-t border-border/40 bg-white px-4 py-16 sm:px-6 md:py-20">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">Perguntas frequentes</h2>
          <div className="mt-10 space-y-3">
            {faq.map(([q, a]) => (
              <details key={q} className="group rounded-xl border border-border/50 bg-white p-5">
                <summary className="cursor-pointer list-none font-medium">{q}</summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="border-t border-border/40 px-4 py-20 text-center sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Pronto para tirar a pousada da planilha?</h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">Crie a conta agora e lance a primeira reserva ainda hoje.</p>
        <Link href="/cadastro" className="mt-8 inline-flex h-12 items-center justify-center rounded-lg bg-primary px-7 text-base font-semibold text-primary-foreground hover:bg-primary/90">
          Testar {DIAS_DE_TRIAL} dias grátis
        </Link>
      </section>

      <footer className="border-t border-border/40 bg-white px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-sm text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} Diária — gestão de reservas para pousadas</p>
          <nav className="flex flex-wrap items-center gap-4">
            <Link href="/privacidade" className="hover:text-foreground">Privacidade</Link>
            <Link href="/termos" className="hover:text-foreground">Termos de uso</Link>
            {CONTATO && <a href={`mailto:${CONTATO}`} className="hover:text-foreground">Contato</a>}
          </nav>
        </div>
      </footer>
    </main>
  )
}
