import Link from "next/link"

export function PaginaLegal({ titulo, vigencia, children }: { titulo: string; vigencia: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border/40 bg-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" className="h-8 w-8 rounded-lg object-cover" />
            <span className="text-sm font-semibold">Diária</span>
          </Link>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <Link href="/privacidade" className="hover:text-foreground">Privacidade</Link>
            <Link href="/termos" className="hover:text-foreground">Termos</Link>
          </nav>
        </div>
      </header>
      <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_p]:mb-3 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-muted-foreground [&_li]:text-sm [&_li]:leading-relaxed [&_li]:text-muted-foreground [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        <h1 className="text-3xl font-bold tracking-tight">{titulo}</h1>
        <p className="mt-2 !text-xs">Vigente desde {vigencia}.</p>
        {children}
      </article>
    </main>
  )
}
