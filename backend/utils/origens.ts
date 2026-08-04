/**
 * Origens do frontend — separando "quem pode chamar a API" de "para onde
 * apontam os links".
 *
 * Durante uma migração de domínio os dois hosts precisam responder ao mesmo
 * tempo: o antigo, porque ainda há links e abas abertas apontando para ele; o
 * novo, porque é o destino. Por isso CORS_ORIGIN passou a aceitar uma LISTA
 * separada por vírgula.
 *
 * Mas link de convite e de email precisa de UM endereço, não de uma lista —
 * `${CORS_ORIGIN}/convite/${token}` com dois valores geraria
 * "https://a,https://b/convite/xyz", que não abre em lugar nenhum. Daí o
 * APP_URL separado: é o endereço canônico, o que o usuário deve ver.
 */

const PADRAO_DEV = 'http://localhost:3000';

/**
 * Origens autorizadas a chamar a API (CORS + trustedOrigins do better-auth).
 */
export function origensPermitidas(): string[] {
  const bruto = process.env.CORS_ORIGIN || PADRAO_DEV;
  const lista = bruto
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  return lista.length > 0 ? lista : [PADRAO_DEV];
}

/**
 * Endereço canônico do app — usado para montar links que vão para fora
 * (convite por email, reset de senha). Cai na primeira origem permitida
 * quando APP_URL não está definida.
 */
export function urlDoApp(): string {
  const explicita = process.env.APP_URL?.trim().replace(/\/+$/, '');
  return explicita || origensPermitidas()[0];
}
