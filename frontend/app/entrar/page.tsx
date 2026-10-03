import type { Metadata } from "next"
import { Suspense } from "react"
import { TelaDeAcesso } from "../../components/auth/TelaDeAcesso"

export const metadata: Metadata = { title: "Entrar — Diária", robots: { index: false } }

export default function Entrar() {
  return (
    <Suspense>
      <TelaDeAcesso modo="entrar" />
    </Suspense>
  )
}
