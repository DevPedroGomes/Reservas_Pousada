import { Router, Request, Response } from 'express';
import { criarLimitador } from '../utils/limitadores.js';
import { chaveDeRateLimit } from '../utils/rede.js';
import { reportarErro } from '../lib/observabilidade.js';

const router = Router();

/**
 * POST /api/telemetria/erro
 *
 * Erros do navegador (ErrorBoundary do frontend). Sem isto, uma tela quebrando
 * para o cliente era invisível: ele via "algo deu errado" e ninguém ficava
 * sabendo. Público porque a tela pode quebrar antes do login; por isso o
 * limite por IP estreito e o corpo truncado.
 */
const limite = criarLimitador('telemetria', {
  windowMs: 10 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => chaveDeRateLimit(req.ip),
});

const cortar = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);

router.post('/erro', limite, (req: Request, res: Response) => {
  const corpo = req.body ?? {};
  const mensagem = cortar(corpo.mensagem, 500) || 'erro sem mensagem';
  const registro = {
    mensagem,
    stack: cortar(corpo.stack, 4000),
    // Só o caminho: query string pode carregar token (convite, reset de senha).
    pagina: cortar(corpo.pagina, 300)?.split('?')[0],
    navegador: cortar(req.get('user-agent'), 300),
    requestId: req.id,
  };
  console.error('[ErroCliente]', JSON.stringify(registro));
  const erro = new Error(`[cliente] ${mensagem}`);
  if (registro.stack) erro.stack = registro.stack;
  reportarErro(erro, { pagina: registro.pagina, origem: 'navegador' });
  res.status(204).end();
});

export default router;
