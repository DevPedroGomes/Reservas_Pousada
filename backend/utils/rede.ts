/**
 * Chave de rate limit resistente a IPv6.
 *
 * PROBLEMA
 * `keyGenerator: (req) => req.ip` trata cada endereço como um cliente distinto.
 * Em IPv4 isso é razoável. Em IPv6, qualquer VPS barata recebe um bloco /64 —
 * 18 quintilhões de endereços — então o limite de "10 tentativas de login por
 * 15 min" virava 10 tentativas *por endereço*, ou seja, nenhum limite.
 *
 * SOLUÇÃO
 * Agrupar IPv6 pelo prefixo /64, que é a menor unidade que um provedor entrega
 * a um assinante. IPv4 continua sendo chaveado pelo endereço inteiro.
 *
 * (A lib expõe um `ipKeyGenerator` a partir da 7.5.1; a versão fixada no
 * lockfile aqui é anterior e não o exporta. Quando a atualização de
 * dependências acontecer, dá para trocar por ele.)
 */

const HEXTETS_DO_PREFIXO = 4; // /64

/**
 * Expande um IPv6 abreviado (com `::`) para os 8 hextets.
 * Retorna null se não parecer IPv6.
 */
function expandirIPv6(ip: string): string[] | null {
  if (!ip.includes(':')) return null;

  const semZona = ip.split('%')[0];
  const partes = semZona.split('::');
  if (partes.length > 2) return null;

  const cabeca = partes[0] ? partes[0].split(':') : [];
  const cauda = partes.length === 2 && partes[1] ? partes[1].split(':') : [];

  if (partes.length === 2) {
    const faltando = 8 - cabeca.length - cauda.length;
    if (faltando < 0) return null;
    return [...cabeca, ...Array(faltando).fill('0'), ...cauda];
  }

  return cabeca.length === 8 ? cabeca : null;
}

/**
 * Chave de agrupamento para rate limit a partir do IP da requisição.
 */
export function chaveDeRateLimit(ip: string | undefined): string {
  if (!ip) return 'desconhecido';

  // IPv4 puro, ou IPv4 mapeado em IPv6 (::ffff:1.2.3.4): usa o endereço inteiro.
  const mapeado = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapeado) return mapeado[1];
  if (!ip.includes(':')) return ip;

  const hextets = expandirIPv6(ip);
  if (!hextets) return ip; // formato inesperado: não afrouxa o limite

  return hextets
    .slice(0, HEXTETS_DO_PREFIXO)
    .map((h) => h.toLowerCase().replace(/^0+(?=.)/, ''))
    .join(':') + '::/64';
}
