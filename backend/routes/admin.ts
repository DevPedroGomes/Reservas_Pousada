import { Router, Request, Response } from 'express';
import FinanceiroModel from '../models/Financeiro.js';
import { requireAdmin } from '../middleware/admin.js';
import { ehCompetencia } from '../utils/margem.js';
import { pool } from '../db/index.js';
import { param } from '../utils/http.js';

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
  const pousadaId = parseInt(param(req, 'pousadaId'), 10);
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

/**
 * GET /api/admin/aquisicao?dias=90
 *
 * Funil por canal de aquisição: cadastros, quem criou pousada e quem paga,
 * agrupados pela PRIMEIRA origem do cadastro. Junto com o gasto de cada
 * campanha (fora daqui), dá o custo por cliente pagante de cada canal.
 */
router.get('/aquisicao', async (req: Request, res: Response) => {
  const dias = Math.min(Math.max(parseInt(String(req.query.dias ?? '90')) || 90, 1), 730);
  try {
    const { rows } = await pool.query(
      `SELECT COALESCE(NULLIF(u.origem->>'utm_source', ''),
                       CASE WHEN u.origem->>'gclid' IS NOT NULL THEN 'google (gclid)'
                            WHEN u.origem->>'fbclid' IS NOT NULL THEN 'meta (fbclid)'
                            WHEN u.origem->>'referrer' IS NOT NULL THEN 'referência'
                            ELSE '(direto)' END) AS fonte,
              COALESCE(u.origem->>'utm_campaign', '') AS campanha,
              count(DISTINCT u.id)::int AS cadastros,
              count(DISTINCT u.id) FILTER (WHERE up.user_id IS NOT NULL)::int AS criaram_pousada,
              count(DISTINCT u.id) FILTER (WHERE a.status = 'ativa' AND a.stripe_subscription_id IS NOT NULL)::int AS pagantes
         FROM "user" u
         LEFT JOIN user_pousadas up ON up.user_id = u.id AND up.is_owner = true
         LEFT JOIN assinaturas a ON a.pousada_id = up.pousada_id
        WHERE u.created_at >= now() - make_interval(days => $1)
          AND u.email NOT LIKE 'removido+%'
        GROUP BY 1, 2
        ORDER BY cadastros DESC`,
      [dias],
    );
    res.json({ sucesso: true, dias, canais: rows });
  } catch (err) {
    console.error('[Admin] falha ao montar aquisição:', err);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao montar o relatório' });
  }
});

export default router;
