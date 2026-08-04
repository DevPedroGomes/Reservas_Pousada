"use client"

import Link from "next/link"
import { Button } from "../ui/button"
import { cn } from "../../lib/utils"
import type { SituacaoAssinatura } from "../../lib/types"

interface Props {
  situacao: SituacaoAssinatura | null
  billingHabilitado: boolean
}

/**
 * Faixa de estado da assinatura no topo do dashboard.
 *
 * Fica em silêncio quando não há nada a dizer — assinatura ativa, cortesia, ou
 * billing desligado. Um aviso permanente vira ruído e deixa de ser lido
 * justamente no dia em que passa a importar.
 */
export function AvisoAssinatura({ situacao, billingHabilitado }: Props) {
  if (!billingHabilitado || !situacao) return null
  if (situacao.status === "ativa" || situacao.status === "cortesia") return null

  const dias = situacao.diasRestantes ?? 0

  // Trial tranquilo: nada de alarme faltando mais de 3 dias. O aviso aparece
  // quando começa a ser acionável, não no primeiro dia de uso.
  if (situacao.status === "trial" && situacao.liberado && dias > 3) return null

  const urgente = !situacao.liberado
  const atencao = situacao.liberado && situacao.status !== "trial"

  const texto = !situacao.liberado
    ? textoBloqueado(situacao)
    : situacao.status === "trial"
    ? `Seu teste grátis termina ${dias <= 1 ? "hoje" : `em ${dias} dias`}.`
    : `Não conseguimos confirmar seu pagamento. Você tem ${dias} ${dias === 1 ? "dia" : "dias"} para regularizar.`

  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3",
        urgente
          ? "border-rose-200/80 bg-rose-50/80"
          : atencao
          ? "border-amber-200/80 bg-amber-50/80"
          : "border-sky-200/80 bg-sky-50/80",
      )}
    >
      <p
        className={cn(
          "text-sm",
          urgente ? "text-rose-800" : atencao ? "text-amber-800" : "text-sky-800",
        )}
      >
        {texto}
      </p>
      <Link href="/assinatura" className="shrink-0">
        <Button size="sm" variant={urgente ? "default" : "outline"}>
          {situacao.status === "inadimplente" ? "Atualizar pagamento" : "Ver planos"}
        </Button>
      </Link>
    </div>
  )
}

function textoBloqueado(s: SituacaoAssinatura): string {
  switch (s.motivo) {
    case "trial_expirado":
      return "Seu período de teste terminou. Escolha um plano para voltar a lançar reservas."
    case "tolerancia_esgotada":
      return "Não conseguimos confirmar o pagamento da sua assinatura. Atualize a forma de pagamento para reativar o acesso."
    case "suspensa":
      return "Sua assinatura está suspensa. Entre em contato com o suporte."
    case "cancelada":
      return "Sua assinatura foi cancelada. Escolha um plano para voltar a usar."
    default:
      return "Sua assinatura precisa de atenção."
  }
}
