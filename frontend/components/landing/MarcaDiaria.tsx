/** Marca do Diária: a porta da pousada, com verga em arco, e o nome em Space Grotesk. */
export function SimboloPorta({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <rect width="32" height="32" rx="7" fill="#b24a18" />
      <path d="M8 27V12.5C8 8.4 11.6 5.5 16 5.5s8 2.9 8 7V27z" fill="#14120e" />
      <path d="M10.2 27V13c0-3 2.6-5.2 5.8-5.2s5.8 2.2 5.8 5.2v14z" fill="#f4f2ed" />
      <path d="M15.3 7.9h1.4V27h-1.4z" fill="#14120e" />
    </svg>
  )
}

export function MarcaDiaria() {
  return (
    <span className="marca">
      <SimboloPorta className="marca-simbolo" />
      <span className="marca-nome">Diária</span>
    </span>
  )
}
