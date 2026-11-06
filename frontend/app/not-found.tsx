import type { Metadata } from "next"
import Link from "next/link"
import { SimboloPorta } from "../components/landing/MarcaDiaria"
import { Button } from "../components/ui/button"

export const metadata: Metadata = { title: "Página não encontrada | Diária", robots: { index: false } }

export default function NaoEncontrada() {
  return (
    <main className="flex min-h-dvh flex-col items-start justify-center gap-6 px-6 py-16 sm:px-12">
      <SimboloPorta className="h-10 w-10" />
      <h1 className="max-w-[14ch] text-5xl font-semibold leading-[0.98] sm:text-7xl">Esta porta não abre.</h1>
      <p className="max-w-md text-muted-foreground">
        O endereço não existe ou mudou. Se você veio por um link de reserva, peça um novo à pousada.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button asChild><Link href="/painel">Ir para o painel</Link></Button>
        <Button asChild variant="outline"><Link href="/">Conhecer o Diária</Link></Button>
      </div>
    </main>
  )
}
