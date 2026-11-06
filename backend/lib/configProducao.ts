/**
 * Configuração sem a qual a produção não pode subir.
 *
 * Fora daqui ficam as integrações opcionais. Aqui só o que quebra em silêncio:
 * - sem BETTER_AUTH_URL, OAuth e links de e-mail apontam para localhost;
 * - sem RESEND_API_KEY, o e-mail só vira uma linha de log: quem se cadastra
 *   nunca recebe a confirmação e não consegue entrar, e ninguém recupera senha;
 * - com a cobrança ligada e sem STRIPE_WEBHOOK_SECRET, todo webhook é recusado:
 *   a pessoa paga e a assinatura não ativa.
 *
 * Melhor um deploy que falha na hora, com a mensagem no log, do que um servidor
 * de pé que perde cadastro e pagamento sem ninguém ver.
 */
const preenchida = (valor: string | undefined) => Boolean(valor?.trim());

export function problemasDeProducao(env: NodeJS.ProcessEnv = process.env): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const problemas: string[] = [];
  if (!preenchida(env.BETTER_AUTH_URL)) {
    problemas.push('BETTER_AUTH_URL não definida: OAuth e links de e-mail apontariam para localhost');
  }
  if (!preenchida(env.RESEND_API_KEY)) {
    problemas.push('RESEND_API_KEY não definida: confirmação de cadastro, redefinição de senha e convites não seriam enviados');
  }
  if (env.BILLING_ENABLED === 'true' && !preenchida(env.STRIPE_WEBHOOK_SECRET)) {
    problemas.push('BILLING_ENABLED=true sem STRIPE_WEBHOOK_SECRET: os webhooks do Stripe seriam recusados e pagamentos não ativariam assinaturas');
  }
  return problemas;
}
