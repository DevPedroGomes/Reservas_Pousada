import type { Request } from 'express';

/**
 * Caminho que pode ir para log e Sentry: o template da rota, nunca a URL real.
 *
 * O caminho de várias rotas é a própria credencial: /ical/<token>.ics,
 * /api/webhooks/pix/asaas/<token>, /api/convites/<token>,
 * /api/publico/checkin/<token>. Quem lê o log (ou um terceiro que recebe o erro)
 * não pode sair dali com o calendário, a ficha ou o convite de alguém.
 *
 * Sem rota casada (404) não há template, e o caminho pedido pode carregar um
 * token do mesmo jeito: fica só o começo, que basta para ver de onde vem o ruído.
 */
export function rotaSegura(req: Pick<Request, 'route' | 'baseUrl' | 'path'>): string {
  const modelo = req.route?.path;
  if (typeof modelo === 'string') {
    const completo = `${req.baseUrl ?? ''}${modelo}`;
    return completo.length > 1 ? completo.replace(/\/$/, '') : completo;
  }
  const partes = String(req.path ?? '').split('/').filter(Boolean);
  const fixos = partes[0] === 'api' ? 2 : 1;
  const inicio = `/${partes.slice(0, fixos).join('/')}`;
  return partes.length > fixos ? `${inicio}/*` : inicio;
}
