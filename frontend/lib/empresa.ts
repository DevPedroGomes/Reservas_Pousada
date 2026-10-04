/**
 * Dados da empresa para as páginas legais e o rodapé. Vêm do ambiente porque
 * são fatos jurídicos que o código não pode inventar. Enquanto não forem
 * preenchidos, as páginas mostram o aviso "[a definir]" — visível de propósito,
 * para não ir ao ar uma política com dados falsos.
 */
const v = (nome: string | undefined) => (nome && nome.trim()) || "[a definir]"

export const EMPRESA = {
  razaoSocial: v(process.env.NEXT_PUBLIC_EMPRESA_RAZAO_SOCIAL),
  cnpj: v(process.env.NEXT_PUBLIC_EMPRESA_CNPJ),
  endereco: v(process.env.NEXT_PUBLIC_EMPRESA_ENDERECO),
  foro: v(process.env.NEXT_PUBLIC_EMPRESA_FORO),
  emailContato: v(process.env.NEXT_PUBLIC_CONTATO_EMAIL),
  emailPrivacidade: v(process.env.NEXT_PUBLIC_PRIVACIDADE_EMAIL || process.env.NEXT_PUBLIC_CONTATO_EMAIL),
  encarregado: v(process.env.NEXT_PUBLIC_ENCARREGADO_NOME),
}

export const VIGENCIA_DOCUMENTOS = "3 de outubro de 2026"
