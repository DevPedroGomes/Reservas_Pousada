/**
 * Planos para a página pública. ESPELHO de backend/config/planos.ts (que é a
 * fonte da verdade dos limites) — preço e limites aqui só exibem. Quem cobra
 * é o Price do Stripe. Mudou lá, muda aqui.
 */
export const DIAS_DE_TRIAL = 14

export const PLANOS_PUBLICOS = [
  {
    codigo: "essencial",
    nome: "Essencial",
    mensal: 89,
    resumo: "Para pousadas pequenas que querem sair da planilha.",
    itens: ["Até 10 quartos", "3 usuários", "Reservas sem overbooking", "Painel do dia", "Trilha de auditoria"],
  },
  {
    codigo: "pousada",
    nome: "Pousada",
    mensal: 149,
    resumo: "Para a pousada com equipe na recepção.",
    itens: ["Até 25 quartos", "Usuários ilimitados", "Tudo do Essencial", "Exportação para o contador", "Papéis por função"],
    destaque: true,
  },
  {
    codigo: "rede",
    nome: "Rede",
    mensal: 299,
    resumo: "Para quem administra mais de uma propriedade.",
    itens: ["Até 3 propriedades", "Até 100 quartos", "Usuários ilimitados", "Troca de pousada em um clique", "Tudo do Pousada"],
  },
] as const
