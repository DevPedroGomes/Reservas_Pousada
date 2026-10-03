import { Router, Request, Response, NextFunction } from 'express';
import { relatorio } from '../models/Relatorio.js';
import { authorize } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { validarData } from '../utils/validation.js';
import { hojeLocal } from '../utils/datas.js';

const router = Router();

// Números do negócio: dono/admin e auditoria (contador). Recepção não vê faturamento.
router.get('/', authorize(['admin', 'auditoria']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hoje = hojeLocal();
    const inicio = typeof req.query.inicio === 'string' && validarData(req.query.inicio) ? req.query.inicio : `${hoje.slice(0, 7)}-01`;
    const fim = typeof req.query.fim === 'string' && validarData(req.query.fim) ? req.query.fim : hoje;
    if (fim < inicio) return res.status(400).json({ sucesso: false, codigo: 'VAL_001', mensagem: 'O fim do período vem antes do início' });
    if ((Date.parse(fim) - Date.parse(inicio)) / 864e5 > 731) {
      return res.status(400).json({ sucesso: false, codigo: 'VAL_001', mensagem: 'Período de no máximo 2 anos' });
    }
    res.json({ sucesso: true, relatorio: await relatorio(req.user!.pousadaId!, inicio, fim) });
  } catch (err) {
    next(new AppError('Erro ao gerar relatório', 500, 'REL_001'));
  }
});

export default router;
