"use client"

import { useEffect, useState } from "react"

interface EventoInstalar extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

let eventoGuardado: EventoInstalar | null = null
const ouvintes = new Set<() => void>()

/** Registra o service worker (só em produção) e guarda o convite de instalação. */
export function RegistrarPwa() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => { /* sem SW, o site funciona igual */ })
    }
    const guardar = (e: Event) => {
      e.preventDefault()
      eventoGuardado = e as EventoInstalar
      ouvintes.forEach((f) => f())
    }
    const instalado = () => { eventoGuardado = null; ouvintes.forEach((f) => f()) }
    window.addEventListener("beforeinstallprompt", guardar)
    window.addEventListener("appinstalled", instalado)
    return () => {
      window.removeEventListener("beforeinstallprompt", guardar)
      window.removeEventListener("appinstalled", instalado)
    }
  }, [])
  return null
}

const ehIos = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent)
const jaInstalado = () =>
  typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true)

/**
 * "Instalar app": no Android/Chrome usa o convite do navegador; no iPhone
 * explica o caminho (Compartilhar → Adicionar à Tela de Início).
 */
export function BotaoInstalar({ className }: { className?: string }) {
  const [pode, setPode] = useState(false)
  const [ios, setIos] = useState(false)
  const [ajuda, setAjuda] = useState(false)

  useEffect(() => {
    const atualizar = () => setPode(Boolean(eventoGuardado))
    ouvintes.add(atualizar)
    atualizar()
    setIos(ehIos() && !jaInstalado())
    return () => { ouvintes.delete(atualizar) }
  }, [])

  if (jaInstalado() || (!pode && !ios)) return null

  async function instalar() {
    if (eventoGuardado) {
      await eventoGuardado.prompt()
      await eventoGuardado.userChoice.catch(() => null)
      eventoGuardado = null
      setPode(false)
    } else {
      setAjuda((x) => !x)
    }
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => void instalar()} className={className ?? "rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground"}>
        Instalar app
      </button>
      {ajuda && (
        <div role="dialog" className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-border bg-white p-3 text-xs shadow-lg">
          No iPhone: toque em <strong>Compartilhar</strong> (quadrado com seta) e depois em <strong>Adicionar à Tela de Início</strong>.
        </div>
      )}
    </div>
  )
}
