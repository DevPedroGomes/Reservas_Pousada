"use client"

import { abrirAvisoDeCookies, temRastreadores } from "../../lib/consentimento"

/** Reabre o aviso de cookies: revogar precisa ser tão fácil quanto aceitar (LGPD, art. 8º, § 5º). */
export function PreferenciasDeCookies({ className }: { className?: string }) {
  if (!temRastreadores()) return null
  return (
    <button type="button" onClick={abrirAvisoDeCookies} className={className ?? "underline"}>
      Preferências de cookies
    </button>
  )
}
