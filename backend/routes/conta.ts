import { Router, Request, Response } from 'express';
import { exportarDadosDoUsuario, excluirConta, ExclusaoRecusada } from '../models/Conta.js';
import { criarLimitador } from '../utils/limitadores.js';

const router = Router();

// Exportar monta um JSON grande; poucas vezes por hora bastam para qualquer uso legítimo.
const limiteExportacao = criarLimitador('conta-exportar', {
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.user?.id ?? 'anonimo',
});

/** GET /api/conta/exportar — dados pessoais do próprio usuário (LGPD, art. 18). */
router.get('/exportar', limiteExportacao, async (req: Request, res: Response) => {
  const dados = await exportarDadosDoUsuario(req.user!.id);
  res.setHeader('Content-Disposition', 'attachment; filename="meus-dados-diaria.json"');
  res.json(dados);
});

/**
 * DELETE /api/conta — exclui (anonimiza) a própria conta. Exige digitar
 * EXCLUIR: é irreversível e a pessoa perde o acesso a todas as pousadas.
 */
router.delete('/', async (req: Request, res: Response) => {
  if ((req.body?.confirmacao ?? '') !== 'EXCLUIR') {
    return res.status(400).json({ sucesso: false, mensagem: 'Para confirmar, digite EXCLUIR.' });
  }
  try {
    await excluirConta(req.user!.id);
    res.json({ sucesso: true, mensagem: 'Conta excluída.' });
  } catch (err) {
    if (err instanceof ExclusaoRecusada) {
      return res.status(409).json({ sucesso: false, mensagem: err.message, ...err.detalhes });
    }
    throw err;
  }
});

export default router;
