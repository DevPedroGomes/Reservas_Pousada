"use client"

import { useEffect } from "react"
import { EVENTO_CONSENTIMENTO, type Consentimento } from "../../lib/consentimento"
import { carregarRastreadores } from "../../lib/medicao"
import { capturarOrigem } from "../../lib/origem"

/** Captura a origem do visitante e liga os rastreadores quando (e se) houver consentimento. */
export function Medicao() {
  useEffect(() => {
    capturarOrigem()
    carregarRastreadores()
    const aoConsentir = (e: Event) => carregarRastreadores((e as CustomEvent<Consentimento>).detail)
    window.addEventListener(EVENTO_CONSENTIMENTO, aoConsentir)
    return () => window.removeEventListener(EVENTO_CONSENTIMENTO, aoConsentir)
  }, [])
  return null
}
