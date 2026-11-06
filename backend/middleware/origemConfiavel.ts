import type { NextFunction, Request, Response } from 'express';
import { origensPermitidas } from '../utils/origens.js';

const METODOS_DE_LEITURA = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Escrita com cookie só vale vinda de uma origem do próprio app.
 *
 * O cookie de sessão é SameSite=Lax, e isso não protege contra um subdomínio
 * irmão: para o navegador, qualquer outro host de pgdev.com.br é o mesmo site,
 * então um formulário publicado lá faz POST na API levando o cookie. O CORS
 * também não ajuda aqui: ele esconde a resposta, mas a escrita já aconteceu.
 *
 * Sem Origin (ou com `null`) a escrita com cookie é recusada: todo navegador
 * atual manda o cabeçalho nos pedidos que o app faz à API, que é outro host.
 *
 * Webhooks ficam de fora: quem chama é um servidor, autenticado pela assinatura
 * ou pelo token próprio de cada um.
 */
export function exigirOrigemConfiavel(req: Request, res: Response, next: NextFunction): void {
  if (METODOS_DE_LEITURA.has(req.method) || !req.headers.cookie || req.path.startsWith('/api/webhooks/')) {
    next();
    return;
  }
  const origem = req.get('origin');
  if (origem && origensPermitidas().includes(origem)) {
    next();
    return;
  }
  res.status(403).json({
    sucesso: false,
    codigo: 'ORIGEM_RECUSADA',
    requestId: req.id,
    mensagem: 'Origem da requisição não autorizada.',
  });
}
