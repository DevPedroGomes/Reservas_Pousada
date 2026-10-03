/**
 * Saneamento da origem de marketing enviada no cadastro.
 *
 * Vem do navegador, então nada é confiável: só chaves conhecidas, só texto
 * curto. O resultado é gravado em "user".origem (jsonb).
 */
const CHAVES_TEXTO = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'fbclid', 'referrer', 'landing', 'ga_client_id', 'fbp', 'primeira_visita',
] as const;

export type Origem = Partial<Record<(typeof CHAVES_TEXTO)[number], string>> & { consentimento_anuncios?: boolean };

export function sanearOrigem(bruto: unknown): Origem | null {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return null;
  const entrada = bruto as Record<string, unknown>;
  const saida: Origem = {};
  for (const chave of CHAVES_TEXTO) {
    const v = entrada[chave];
    if (typeof v === 'string' && v.trim()) saida[chave] = v.trim().slice(0, 300);
  }
  if (typeof entrada.consentimento_anuncios === 'boolean') saida.consentimento_anuncios = entrada.consentimento_anuncios;
  return Object.keys(saida).length > 0 ? saida : null;
}
