/**
 * Regra de quem mexe no papel de administrador, sem banco nem Express, para
 * valer igual na troca de papel (PATCH) e no convite (POST): um admin
 * convidando outro admin era o atalho que a troca de papel já fechava.
 */
export const MENSAGEM_SO_DONO_ADMIN = 'Só o proprietário concede ou retira o papel de administrador.';

/**
 * Conceder ou retirar o papel de admin é só do dono. `papelAtual` é o papel
 * que o alvo já tem (na troca de papel); no convite ainda não existe.
 */
export function podeAtribuirPapel(
  quemAtribui: { isOwner: boolean },
  papelNovo: string,
  papelAtual?: string | null,
): boolean {
  if (quemAtribui.isOwner) return true;
  return papelNovo !== 'admin' && papelAtual !== 'admin';
}
