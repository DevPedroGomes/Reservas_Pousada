/** Rótulos dos campos da FNRH (espelho de backend/models/Precheckin.ts). */
export const MOTIVOS = [
  ["lazer", "Lazer / férias"], ["negocios", "Negócios"], ["congresso", "Congresso / evento"], ["parentes_amigos", "Visitar parentes ou amigos"],
  ["estudos", "Estudos"], ["religiao", "Religião"], ["saude", "Saúde"], ["compras", "Compras"], ["outro", "Outro"],
] as const
export const TRANSPORTES = [
  ["automovel", "Carro"], ["aviao", "Avião"], ["onibus", "Ônibus"], ["moto", "Moto"], ["navio", "Navio"], ["trem", "Trem"], ["outro", "Outro"],
] as const
export const DOCUMENTOS = [["cpf", "CPF"], ["rg", "RG"], ["passaporte", "Passaporte"], ["cnh", "CNH"], ["outro", "Outro"]] as const
export const GENEROS = [["feminino", "Feminino"], ["masculino", "Masculino"], ["outro", "Outro"], ["nao_informar", "Prefiro não informar"]] as const

export const rotulo = (lista: readonly (readonly [string, string])[], valor: string) => lista.find(([v]) => v === valor)?.[1] ?? valor

export interface Titular {
  nome: string; dataNascimento: string; genero: string; nacionalidade: string; tipoDocumento: string; documento: string; orgaoEmissor: string
  email: string; telefone: string; profissao: string; cidadeResidencia: string; estadoResidencia: string; paisResidencia: string
  motivoViagem: string; meioTransporte: string; procedencia: string; proximoDestino: string
}
export interface Acompanhante { nome: string; dataNascimento: string; tipoDocumento: string; documento: string; parentesco: string }
export interface Ficha { titular: Titular; acompanhantes: Acompanhante[] }
