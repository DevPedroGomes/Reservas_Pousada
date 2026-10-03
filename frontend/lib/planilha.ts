/**
 * Leitura de CSV no navegador para a importação de reservas.
 *
 * O Excel em português salva CSV com ";" e em Windows-1252 (acentos viram
 * lixo se lidos como UTF-8); planilha do Google sai com "," e UTF-8. Aqui
 * se detecta os dois.
 */

/** Texto do arquivo: UTF-8 se for válido, senão Windows-1252. */
export async function lerArquivo(arquivo: File): Promise<string> {
  const bytes = await arquivo.arrayBuffer()
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "")
  } catch {
    return new TextDecoder("windows-1252").decode(bytes)
  }
}

/** CSV → linhas de células (aspas, aspas escapadas e quebra dentro de aspas). */
export function lerCsv(texto: string): string[][] {
  const primeira = texto.split(/\r?\n/, 1)[0] ?? ""
  const contar = (c: string) => primeira.split(c).length - 1
  const sep = [";", ",", "\t"].sort((a, b) => contar(b) - contar(a))[0]
  const linhas: string[][] = []
  let linha: string[] = []
  let celula = ""
  let aspas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { celula += '"'; i++ }
      else if (c === '"') aspas = false
      else celula += c
    } else if (c === '"') aspas = true
    else if (c === sep) { linha.push(celula.trim()); celula = "" }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++
      linha.push(celula.trim()); celula = ""
      if (linha.some((x) => x !== "")) linhas.push(linha)
      linha = []
    } else celula += c
  }
  linha.push(celula.trim())
  if (linha.some((x) => x !== "")) linhas.push(linha)
  return linhas
}

export const CAMPOS = [
  { campo: "nome", rotulo: "Nome do hóspede", obrigatorio: true, apelidos: ["nome", "hospede", "cliente", "nome do hospede", "nome completo", "titular"] },
  { campo: "quarto", rotulo: "Quarto", obrigatorio: true, apelidos: ["quarto", "apto", "apartamento", "uh", "acomodacao", "chale", "suite", "n quarto"] },
  { campo: "data_entrada", rotulo: "Entrada", obrigatorio: true, apelidos: ["entrada", "check-in", "checkin", "data entrada", "data de entrada", "chegada", "inicio", "data inicio"] },
  { campo: "data_saida", rotulo: "Saída", obrigatorio: true, apelidos: ["saida", "check-out", "checkout", "data saida", "data de saida", "partida", "fim", "data fim"] },
  { campo: "documento", rotulo: "CPF ou passaporte", obrigatorio: false, apelidos: ["cpf", "documento", "doc", "passaporte", "rg", "cpf/passaporte"] },
  { campo: "telefone", rotulo: "WhatsApp / telefone", obrigatorio: false, apelidos: ["telefone", "whatsapp", "celular", "fone", "contato", "tel", "whats"] },
  { campo: "email", rotulo: "E-mail", obrigatorio: false, apelidos: ["email", "e-mail", "mail"] },
  { campo: "valor", rotulo: "Valor", obrigatorio: false, apelidos: ["valor", "total", "preco", "valor total", "diarias", "valor (r$)"] },
  { campo: "pago", rotulo: "Pago (sim/não)", obrigatorio: false, apelidos: ["pago", "pagamento", "quitado", "pago?"] },
  { campo: "status", rotulo: "Status", obrigatorio: false, apelidos: ["status", "situacao"] },
  { campo: "canal", rotulo: "Canal / origem", obrigatorio: false, apelidos: ["canal", "origem", "fonte", "como chegou"] },
  { campo: "adultos", rotulo: "Adultos", obrigatorio: false, apelidos: ["adultos", "pessoas", "hospedes", "qtd pessoas"] },
  { campo: "criancas", rotulo: "Crianças", obrigatorio: false, apelidos: ["criancas", "crianca"] },
  { campo: "observacoes", rotulo: "Observações", obrigatorio: false, apelidos: ["observacoes", "observacao", "obs", "notas", "anotacoes"] },
] as const

export type CampoPlanilha = (typeof CAMPOS)[number]["campo"]

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[º°#.]/g, "").replace(/\s+/g, " ").trim()

/** Sugere, para cada campo, a coluna da planilha com o mesmo sentido. */
export function mapearColunas(cabecalho: string[]): Partial<Record<CampoPlanilha, number>> {
  const mapa: Partial<Record<CampoPlanilha, number>> = {}
  const usadas = new Set<number>()
  for (const c of CAMPOS) {
    const i = cabecalho.findIndex((h, idx) => !usadas.has(idx) && (c.apelidos as readonly string[]).includes(normalizar(h)))
    if (i >= 0) { mapa[c.campo] = i; usadas.add(i) }
  }
  return mapa
}

/** Modelo para baixar, já no formato que o Excel em português abre certo. */
export function csvModelo(): string {
  return "﻿" + [
    "Nome;CPF;WhatsApp;Quarto;Entrada;Saída;Valor;Pago;Canal;Observações",
    "Maria Silva;529.982.247-25;(48) 99999-0000;1;20/12/2026;23/12/2026;R$ 750,00;não;WhatsApp;Chega à noite",
    "John Smith;AB123456;+1 555 123 4567;Suíte Mar;27/12/2026;02/01/2027;3.200,00;sim;Booking;",
  ].join("\r\n")
}
