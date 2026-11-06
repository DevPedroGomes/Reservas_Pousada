import Link from "next/link"
import { cn } from "../../lib/utils"
import { formatarData } from "../../lib/formatters"
import { rotuloStatus } from "../../lib/status"
import { rotuloCanal } from "../../lib/hospedes"

export interface QuartoDoMapa {
  numero: number
  nome: string
  capacidade: number
  ativo: boolean
}

export interface ReservaDoMapa {
  id: number
  quarto: number
  nome: string
  data_entrada: string
  data_saida: string
  status: string
  pago: boolean
  adultos: number
  criancas: number
  canal: string
}

/** Data YYYY-MM-DD + n dias (aritmética em UTC, sem fuso no meio). */
export function somarDias(data: string, n: number): string {
  return new Date(Date.parse(`${data}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10)
}

function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 864e5)
}

const COR: Record<string, string> = {
  pre_reserva: "bg-accent border-primary/60 text-accent-foreground border-dashed",
  confirmada: "bg-accent border-primary/30 text-accent-foreground",
  hospedada: "bg-primary border-primary text-primary-foreground",
  finalizada: "bg-muted border-border text-muted-foreground",
  cancelada: "bg-destructive border-destructive text-destructive-foreground",
}

export const LEGENDA = ["pre_reserva", "confirmada", "hospedada", "finalizada"].map((s) => ({ status: s, classe: COR[s] }))

/**
 * Grade quartos x dias. Cada dia tem duas metades: a estadia começa na
 * metade da tarde do dia de entrada e termina na metade da manhã do dia de
 * saída — assim a troca de hóspede no mesmo dia aparece lado a lado, sem
 * parecer conflito. Clicar num espaço livre abre uma reserva já com quarto e
 * data.
 */
export function MapaOcupacao({ inicio, dias, hoje, quartos, reservas, podeCriar, classeDaReserva, estatico = false }: {
  inicio: string
  dias: number
  hoje: string
  quartos: QuartoDoMapa[]
  reservas: ReservaDoMapa[]
  podeCriar: boolean
  /** Classe extra por reserva, usada na animação da página pública. */
  classeDaReserva?: (r: ReservaDoMapa) => string | undefined
  /** Sem links: a grade é só ilustração, com dados de exemplo. */
  estatico?: boolean
}) {
  const datas = Array.from({ length: dias }, (_, i) => somarDias(inicio, i))
  const colunas = `9rem repeat(${dias * 2}, minmax(1.15rem, 1fr))`
  const fimDeSemana = (d: string) => [0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay())
  const ativos = quartos.filter((q) => q.ativo).length
  const ocupacao = datas.map((d) => {
    const n = new Set(
      reservas
        .filter((r) => r.status !== "finalizada" && r.status !== "cancelada" && r.data_entrada <= d && r.data_saida > d)
        .map((r) => r.quarto),
    ).size
    return ativos ? Math.round((n / ativos) * 100) : 0
  })

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <div className="min-w-max" style={{ minWidth: `calc(9rem + ${dias * 2.3}rem)` }}>
        {/* Cabeçalho: dias */}
        <div className="grid border-b border-border" style={{ gridTemplateColumns: colunas }}>
          <div className="sticky left-0 z-20 bg-card px-3 py-2 text-xs font-semibold text-muted-foreground">Quarto</div>
          {datas.map((d) => (
            <div
              key={d}
              className={cn(
                "col-span-2 border-l border-border px-1 py-1.5 text-center num text-[11px] leading-tight",
                fimDeSemana(d) && "bg-muted/40",
                d === hoje && "bg-primary/10 font-semibold text-primary",
              )}
            >
              <div>{new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "")}</div>
              <div>{d.slice(8, 10)}/{d.slice(5, 7)}</div>
            </div>
          ))}
        </div>

        {/* Linhas: quartos */}
        {quartos.map((q) => (
          <div key={q.numero} className="grid border-b border-border last:border-b-0" style={{ gridTemplateColumns: colunas }}>
            <div className="sticky left-0 z-20 flex flex-col justify-center bg-card px-3 py-1.5" style={{ gridRow: 1, gridColumn: 1 }}>
              <span className="truncate text-sm font-medium">{q.nome}</span>
              <span className="text-[11px] text-muted-foreground">até {q.capacidade}{q.ativo ? "" : ", inativo"}</span>
            </div>
            {datas.map((d, i) => {
              const classe = cn(
                "h-11 border-l border-border",
                fimDeSemana(d) && "bg-muted/30",
                d === hoje && "bg-primary/5",
                podeCriar && q.ativo && "hover:bg-primary/10",
              )
              const pos = { gridRow: 1, gridColumn: `${2 + 2 * i} / span 2` }
              return podeCriar && q.ativo && d >= hoje ? (
                <Link
                  key={d}
                  href={`/reservas/nova?quarto=${q.numero}&entrada=${d}`}
                  className={classe}
                  style={pos}
                  aria-label={`Nova reserva no ${q.nome} em ${formatarData(d)}`}
                />
              ) : (
                <div key={d} className={classe} style={pos} />
              )
            })}
            {reservas.filter((r) => r.quarto === q.numero).map((r) => {
              const ie = diasEntre(inicio, r.data_entrada)
              const is = diasEntre(inicio, r.data_saida)
              const comeco = ie < 0 ? 2 : 2 + 2 * ie + 1
              const fim = is >= dias ? 2 + 2 * dias : 2 + 2 * is + 1
              if (is <= 0 || ie >= dias) return null
              const pessoas = r.adultos + r.criancas
              const classe = cn(
                "z-10 my-1.5 flex items-center gap-1 overflow-hidden rounded-md border px-1.5 text-xs font-medium",
                COR[r.status] ?? COR.confirmada,
                ie < 0 && "rounded-l-none",
                is >= dias && "rounded-r-none",
                classeDaReserva?.(r),
              )
              const posicao = { gridRow: 1, gridColumn: `${comeco} / ${fim}` }
              const conteudo = (
                <>
                  <span className="truncate">{r.nome}</span>
                  {!r.pago && r.status !== "finalizada" && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-warning" aria-label="a pagar" />}
                </>
              )
              if (estatico) return <span key={r.id} className={classe} style={posicao}>{conteudo}</span>
              return (
                <Link
                  key={r.id}
                  href={`/reservas/${r.id}`}
                  data-reserva={r.id}
                  title={`${r.nome}, ${formatarData(r.data_entrada)} a ${formatarData(r.data_saida)}, ${rotuloStatus(r.status)}, ${pessoas} pessoa${pessoas > 1 ? "s" : ""}, ${rotuloCanal(r.canal)}${r.pago ? "" : ", a pagar"}`}
                  className={cn(classe, "hover:brightness-95")}
                  style={posicao}
                >
                  {conteudo}
                </Link>
              )
            })}
          </div>
        ))}

        {/* Rodapé: ocupação por noite */}
        <div className="grid border-t border-border bg-muted/20" style={{ gridTemplateColumns: colunas }}>
          <div className="sticky left-0 z-20 bg-muted/20 px-3 py-1.5 text-xs font-semibold text-muted-foreground">Ocupação</div>
          {ocupacao.map((p, i) => (
            <div
              key={datas[i]}
              className={cn(
                "num col-span-2 border-l border-border py-1.5 text-center text-[11px]",
                p >= 80 ? "text-foreground font-medium" : p === 0 ? "text-muted-foreground" : "",
              )}
            >
              {p}%
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
