/**
 * Mensagens prontas de WhatsApp (wa.me): abrem o WhatsApp da própria pousada
 * com o texto preenchido — sem API, sem custo, sem aprovação da Meta.
 * A pousada edita os textos em Configurações; {variáveis} são trocadas pelos
 * dados da reserva.
 */
import { reais, saldoDaReserva } from "./conta"
import { linkWhatsApp } from "./hospedes"

export type Modelo = "confirmacao" | "sinal" | "chegada" | "agradecimento"

export const MODELOS: { modelo: Modelo; rotulo: string; padrao: string }[] = [
  {
    modelo: "confirmacao",
    rotulo: "Confirmação da reserva",
    padrao: "Olá, {nome}! Sua reserva na {pousada} está confirmada: {quarto}, de {entrada} a {saida} ({noites} noite(s)). Total: {total}. Qualquer dúvida, é só chamar por aqui. Até breve!",
  },
  {
    modelo: "sinal",
    rotulo: "Pedir o sinal",
    padrao: "Olá, {nome}! Para garantir sua reserva na {pousada} ({entrada} a {saida}), o sinal é de {sinal}. Posso te enviar o Pix?",
  },
  {
    modelo: "chegada",
    rotulo: "Instruções de chegada",
    padrao: "Olá, {nome}! Está tudo pronto para receber você na {pousada} em {entrada}. Endereço: {endereco}. Saldo a acertar no check-in: {saldo}. Boa viagem!",
  },
  {
    modelo: "agradecimento",
    rotulo: "Agradecer a estadia",
    padrao: "Olá, {nome}! Obrigado por se hospedar na {pousada}. Foi um prazer receber você — volte sempre!",
  },
]

export const VARIAVEIS = ["{nome}", "{pousada}", "{quarto}", "{entrada}", "{saida}", "{noites}", "{total}", "{sinal}", "{saldo}", "{endereco}"]

export interface DadosMensagem {
  nome: string
  telefone?: string | null
  quarto: string
  data_entrada: string
  data_saida: string
  valor?: number | string | null
  pago_centavos?: number
  consumos_centavos?: number
}

export interface PousadaMensagem {
  nome: string
  endereco?: string | null
  cidade?: string | null
  estado?: string | null
  configuracoes?: { mensagens?: Partial<Record<Modelo, string>>; motor?: { sinal_percentual?: number } }
}

const br = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "")

export function preencher(texto: string, d: DadosMensagem, p: PousadaMensagem): string {
  const total = d.valor === null || d.valor === undefined || d.valor === "" ? 0 : Math.round(Number(d.valor) * 100) + (d.consumos_centavos ?? 0)
  const noites = Math.max(Math.round((Date.parse(d.data_saida) - Date.parse(d.data_entrada)) / 864e5), 1)
  const sinalPct = p.configuracoes?.motor?.sinal_percentual ?? 30
  const endereco = [p.endereco, p.cidade && p.estado ? `${p.cidade} - ${p.estado}` : p.cidade].filter(Boolean).join(", ")
  const valores: Record<string, string> = {
    nome: d.nome.split(" ")[0] || d.nome,
    pousada: p.nome,
    quarto: d.quarto,
    entrada: br(d.data_entrada),
    saida: br(d.data_saida),
    noites: String(noites),
    total: reais(total),
    sinal: reais(Math.round((total * sinalPct) / 100)),
    saldo: reais(Math.max(saldoDaReserva(d), 0)),
    endereco: endereco || "(endereço da pousada)",
  }
  return texto.replace(/\{(\w+)\}/g, (inteiro, chave: string) => valores[chave] ?? inteiro)
}

export function textoDoModelo(modelo: Modelo, p: PousadaMensagem): string {
  return p.configuracoes?.mensagens?.[modelo]?.trim() || MODELOS.find((m) => m.modelo === modelo)!.padrao
}

export function linkDaMensagem(modelo: Modelo, d: DadosMensagem, p: PousadaMensagem): string | null {
  return linkWhatsApp(d.telefone, preencher(textoDoModelo(modelo, p), d, p))
}
