import { Router, Request, Response } from 'express';
import FinanceiroModel from '../models/Financeiro.js';
import { requireAdmin } from '../middleware/admin.js';
import { ehCompetencia } from '../utils/margem.js';

const router = Router();

// Toda a área é administrativa. O middleware devolve 404 para quem não é
// admin — a área não deve nem revelar que existe.
router.use(requireAdmin);

/**
 * GET /api/admin/margem?competencia=2026-08
 *
 * MRR menos custo, por cliente. Existe para cumprir a regra do portfólio —
 * margem negativa por 2 ciclos consecutivos exige agir — que não dá para
 * cumprir sem medir.
 */
router.get('/margem', async (req: Request, res: Response) => {
  const pedida = req.query.competencia;
  const competencia = ehCompetencia(pedida) ? pedida : FinanceiroModel.competenciaAtual();

  try {
    const relatorio = await FinanceiroModel.relatorio(competencia);
    res.json({
      sucesso: true,
      ...relatorio,
      // Sem custo de infra configurado o painel avisa, em vez de mostrar margem
      // artificialmente alta como se fosse fato.
      avisos: relatorio.infraTotalCentavos === 0
        ? ['CUSTO_INFRA_MENSAL_CENTAVOS não configurado — a margem não inclui rateio de infraestrutura.']
        : [],
    });
  } catch (err) {
    console.error('[Admin] falha ao montar relatório de margem:', err);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao montar o relatório' });
  }
});

/**
 * GET /api/admin/margem/:pousadaId?competencia=2026-08
 * Os lançamentos que formam o número — a resposta para "de onde veio isso".
 */
router.get('/margem/:pousadaId', async (req: Request, res: Response) => {
  const pousadaId = parseInt(req.params.pousadaId, 10);
  if (!Number.isInteger(pousadaId)) {
    return res.status(400).json({ sucesso: false, mensagem: 'ID inválido' });
  }
  const pedida = req.query.competencia;
  const competencia = ehCompetencia(pedida) ? pedida : FinanceiroModel.competenciaAtual();

  try {
    res.json({
      sucesso: true,
      competencia,
      lancamentos: await FinanceiroModel.lancamentosDoTenant(pousadaId, competencia),
    });
  } catch (err) {
    console.error('[Admin] falha ao listar lançamentos:', err);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao listar lançamentos' });
  }
});

export default router;
