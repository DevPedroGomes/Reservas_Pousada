"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useApp } from "../../../components/app/ContextoApp"
import { Button } from "../../../components/ui/button"
import { Card } from "../../../components/ui/card"
import { Input } from "../../../components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table"
import { Pagination } from "../../../components/pagination"
import { buscarHospedes } from "../../../hooks/useHospedes"
import { formatarData, formatarValor } from "../../../lib/formatters"
import { formatarTelefone, linkWhatsApp } from "../../../lib/hospedes"
import type { Hospede } from "../../../lib/types"

/**
 * Base de hóspedes da pousada: quem já veio, quantas vezes, quanto gastou e
 * o WhatsApp a um clique — o começo de qualquer ação de retorno.
 */
export default function Hospedes() {
  const { auth } = useApp()
  const [busca, setBusca] = useState("")
  const [lista, setLista] = useState<Hospede[]>([])
  const [total, setTotal] = useState(0)
  const [paginas, setPaginas] = useState(1)
  const [pagina, setPagina] = useState(1)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  // Só a resposta da busca mais recente vale: digitar rápido não pode deixar
  // uma resposta antiga (mais lenta) sobrescrever a lista.
  const ultima = useRef(0)

  async function carregar(termo: string, p: number) {
    const minha = ++ultima.current
    setCarregando(true)
    try {
      const r = await buscarHospedes(termo, 50, p)
      if (minha !== ultima.current) return
      setLista(r.hospedes); setTotal(r.total); setPaginas(r.paginas); setPagina(p); setErro(null)
    } catch (e) {
      if (minha === ultima.current) setErro(e instanceof Error ? e.message : "Não foi possível carregar os hóspedes.")
    } finally {
      if (minha === ultima.current) setCarregando(false)
    }
  }

  // Busca enquanto digita, sem disparar a cada tecla.
  useEffect(() => {
    const t = setTimeout(() => { void carregar(busca, 1) }, busca ? 300 : 0)
    return () => clearTimeout(t)
  }, [busca, auth.pousada?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hóspedes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{total} cadastrado{total === 1 ? "" : "s"}</p>
        </div>
        <Input
          className="max-w-xs"
          placeholder="Nome, WhatsApp, CPF ou passaporte"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar hóspede"
        />
      </div>

      {erro && (
        <div className="rounded-lg border border-rose-200/80 bg-rose-50/80 px-4 py-3 flex items-center justify-between gap-4">
          <p className="text-sm text-rose-800">{erro}</p>
          <Button variant="outline" size="sm" onClick={() => void carregar(busca, pagina)}>Tentar novamente</Button>
        </div>
      )}

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Nome</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead className="text-right">Estadias</TableHead>
                <TableHead>Última</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {carregando && lista.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : lista.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    {busca ? "Ninguém encontrado com essa busca." : "Os hóspedes entram aqui ao lançar as reservas."}
                  </TableCell>
                </TableRow>
              ) : lista.map((h) => {
                const zap = linkWhatsApp(h.telefone)
                return (
                  <TableRow key={h.id}>
                    <TableCell>
                      <Link href={`/hospedes/${h.id}`} className="font-medium hover:underline">{h.nome}</Link>
                    </TableCell>
                    <TableCell>
                      {zap ? <a href={zap} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">{formatarTelefone(h.telefone)}</a> : "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{h.documento || "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">{h.estadias ?? 0}</TableCell>
                    <TableCell>{h.ultima_estadia ? formatarData(h.ultima_estadia) : "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatarValor(h.total_gasto ?? 0)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        {paginas > 1 && (
          <div className="p-4 border-t">
            <Pagination page={pagina} totalPages={paginas} onPageChange={(p) => void carregar(busca, p)} />
          </div>
        )}
      </Card>
    </div>
  )
}
