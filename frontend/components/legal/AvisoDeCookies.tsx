"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { gravarConsentimento, lerConsentimento, temRastreadores } from "../../lib/consentimento"

export function AvisoDeCookies() {
  const [visivel, setVisivel] = useState(false)

  useEffect(() => {
    setVisivel(temRastreadores() && lerConsentimento() === null)
  }, [])

  if (!visivel) return null

  const decidir = (aceitar: boolean) => {
    gravarConsentimento({ medicao: aceitar, anuncios: aceitar })
    setVisivel(false)
  }

  return (
    <div role="dialog" aria-label="Aviso de cookies" className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-2xl rounded-xl border border-border bg-white p-4 shadow-xl sm:inset-x-6">
      <p className="text-sm text-muted-foreground">
        Usamos cookies essenciais para o site funcionar e, se você permitir, cookies para medir visitas e
        melhorar nossos anúncios. Veja a <Link href="/privacidade" className="underline">política de privacidade</Link>.
      </p>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button onClick={() => decidir(false)} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted/50">
          Só os essenciais
        </button>
        <button onClick={() => decidir(true)} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Aceitar todos
        </button>
      </div>
    </div>
  )
}
