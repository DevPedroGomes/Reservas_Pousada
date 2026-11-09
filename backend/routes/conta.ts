import { Router, Request, Response } from 'express';
import { exportarDadosDoUsuario, excluirConta, ExclusaoRecusada } from '../models/Conta.js';
import { criarLimitador } from '../utils/limitadores.js';
import { pool } from '../db/index.js';

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

/**
 * PUT /api/conta/consentimento — o que a pessoa decidiu no aviso de cookies.
 *
 * O servidor só manda conversão para a Meta de quem aceitou cookies de anúncio.
 * A decisão fica no navegador; esta rota leva ao servidor a de quem já tem
 * conta, para que aceitar depois do cadastro passe a valer e, principalmente,
 * revogar pare o envio (LGPD, art. 8º, § 5º).
 */
router.put('/consentimento', async (req: Request, res: Response) => {
  const anuncios = req.body?.anuncios;
  if (typeof anuncios !== 'boolean') {
    return res.status(400).json({ sucesso: false, mensagem: 'Informe anuncios: true ou false.' });
  }
  await pool.query(
    `UPDATE "user" SET origem = jsonb_set(COALESCE(origem, '{}'::jsonb), '{consentimento_anuncios}', to_jsonb($2::boolean))
      WHERE id = $1`,
    [req.user!.id, anuncios],
  );
  res.json({ sucesso: true });
});

export default router;
