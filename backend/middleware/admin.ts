import { Request, Response, NextFunction } from 'express';

/**
 * Acesso administrativo — quem opera o negócio, não quem opera uma pousada.
 *
 * A lista vive em variável de ambiente, não no banco: um papel de super-admin
 * gravado numa tabela é uma coluna que alguém pode escrever. Se um dia um bug
 * de mass assignment permitir gravar `role`, ninguém consegue se promover a
 * administrador do SaaS inteiro — porque a resposta não está no banco.
 *
 * Ausente ou vazia = ninguém entra. Um segredo não configurado nunca deve
 * significar "libera geral".
 */
function emailsDeAdmin(): string[] {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function ehAdmin(email: string | undefined | null): boolean {
  if (!email) return false;
  const lista = emailsDeAdmin();
  if (lista.length === 0) return false;
  return lista.includes(email.trim().toLowerCase());
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (ehAdmin(req.user?.email)) return next();

  // 404, não 403: para quem não é administrador, a área administrativa não
  // deve nem revelar que existe.
  return res.status(404).json({
    sucesso: false,
    codigo: 'NOT_FOUND',
    mensagem: `Rota ${req.method} ${req.path} não encontrada`,
  });
}
