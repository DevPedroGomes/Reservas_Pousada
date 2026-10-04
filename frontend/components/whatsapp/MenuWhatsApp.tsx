"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "../../lib/utils"
import { linkDaMensagem, MODELOS, type DadosMensagem, type Modelo, type PousadaMensagem } from "../../lib/mensagens"

/** Botão "WhatsApp" com as mensagens prontas da pousada (abre o wa.me). */
export function MenuWhatsApp({ dados, pousada, sugerido, compacto = false }: {
  dados: DadosMensagem
  pousada: PousadaMensagem
  /** Mensagem mais provável no contexto (vai primeiro e em destaque). */
  sugerido?: Modelo
  compacto?: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function fora(e: MouseEvent) { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false) }
    if (aberto) document.addEventListener("mousedown", fora)
    return () => document.removeEventListener("mousedown", fora)
  }, [aberto])

  if (!linkDaMensagem("confirmacao", dados, pousada)) return null
  const ordem = [...MODELOS].sort((a, b) => Number(b.modelo === sugerido) - Number(a.modelo === sugerido))

  return (
    <div className="relative inline-block" ref={caixa}>
      <button
        type="button"
        onClick={() => setAberto((x) => !x)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        title="Mensagem pronta no WhatsApp"
        className={cn(
          "inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
          compacto ? "h-7 px-2 text-xs" : "h-9 px-3 text-sm",
        )}
      >
        <svg viewBox="0 0 24 24" className={compacto ? "h-3.5 w-3.5" : "h-4 w-4"} fill="currentColor" aria-hidden>
          <path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 01-3.3-2.9c-.2-.4.2-.4.7-1.3a.4.4 0 000-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 00-.7.3 3 3 0 00-.9 2.2 5.2 5.2 0 001.1 2.8 11.9 11.9 0 004.6 4c1.7.7 2.4.8 3.2.6a2.8 2.8 0 001.8-1.3 2.3 2.3 0 00.2-1.3c-.1-.1-.3-.2-.5-.3z" />
        </svg>
        {!compacto && "WhatsApp"}
      </button>
      {aberto && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-lg border border-border bg-white shadow-lg">
          {ordem.map((m) => (
            <a
              key={m.modelo}
              role="menuitem"
              href={linkDaMensagem(m.modelo, dados, pousada)!}
              target="_blank"
              rel="noreferrer"
              onClick={() => setAberto(false)}
              className={cn("block px-3 py-2 text-sm hover:bg-muted/60", m.modelo === sugerido && "font-medium")}
            >
              {m.rotulo}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
