import type { Metadata } from "next"
import { Suspense } from "react"
import { TelaDeAcesso } from "../../components/auth/TelaDeAcesso"

export const metadata: Metadata = {
  title: "Criar conta grátis — Diária",
  description: "Teste o Diária por 14 dias, sem cartão de crédito.",
}

export default function Cadastro() {
  return (
    <Suspense>
      <TelaDeAcesso modo="cadastro" />
    </Suspense>
  )
}
