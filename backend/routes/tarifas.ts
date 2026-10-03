import { Router, Request, Response, NextFunction } from 'express';
import TarifaModel, { lerTarifa } from '../models/Tarifa.js';
import QuartoModel from '../models/Quarto.js';
import AuditoriaModel from '../models/Auditoria.js';
import { authorize } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { validarData, validarPeriodo } from '../utils/validation.js';
import { param } from '../utils/http.js';

const router = Router();

const paraApi = (t: Awaited<ReturnType<typeof TarifaModel.listar>>[number]) => ({
  id: t.id,
  nome: t.nome,
  quarto: t.quartoNumero,
  dataInicio: t.dataInicio,
  dataFim: t.dataFim,
  diasSemana: t.diasSemana,
  preco: t.precoCentavos === null ? null : t.precoCentavos / 100,
  ajustePercentual: t.ajustePercentual,
  minimoNoites: t.minimoNoites,
  ativa: t.ativa,
});

/** Valor sugerido para uma estadia (formulário de reserva). */
router.get('/cotacao', authorize(['admin', 'recepcao', 'auditoria']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const quarto = Number(req.query.quarto);
    const entrada = String(req.query.entrada ?? '');
    const saida = String(req.query.saida ?? '');
    if (!Number.isInteger(quarto) || !validarData(entrada) || !validarData(saida) || !validarPeriodo(entrada, saida)) {
      return res.status(400).json({ sucesso: false, codigo: 'VAL_001', mensagem: 'Informe quarto, entrada e saída válidos' });
    }
    if ((Date.parse(saida) - Date.parse(entrada)) / 864e5 > 365) {
      return res.status(400).json({ sucesso: false, codigo: 'VAL_001', mensagem: 'Estadia de no máximo 365 noites' });
    }
    const cotacao = await TarifaModel.cotacao(req.user!.pousadaId!, quarto, entrada, saida);
    if (!cotacao) return res.status(404).json({ sucesso: false, codigo: 'TAR_404', mensagem: 'Quarto não encontrado' });
    res.json({ sucesso: true, cotacao });
  } catch (err) {
    next(new AppError('Erro ao calcular o valor', 500, 'TAR_001'));
  }
});

router.get('/', authorize(['admin', 'recepcao', 'auditoria']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ sucesso: true, tarifas: (await TarifaModel.listar(req.user!.pousadaId!)).map(paraApi) });
  } catch (err) {
    next(new AppError('Erro ao listar tarifas', 500, 'TAR_002'));
  }
});

async function validarQuarto(pousadaId: number, numero: number | null): Promise<string | null> {
  if (numero === null) return null;
  const lista = await QuartoModel.listar(pousadaId);
  return lista.some((q) => q.numero === numero) ? null : `O quarto ${numero} não existe nesta pousada.`;
}

router.post('/', authorize(['admin']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dados, erros } = lerTarifa(req.body);
    const semQuarto = await validarQuarto(req.user!.pousadaId!, dados.quartoNumero);
    if (semQuarto) erros.push(semQuarto);
    if (erros.length) return res.status(400).json({ sucesso: false, codigo: 'VAL_001', mensagem: 'Dados inválidos', erros });
    const t = await TarifaModel.criar(req.user!.pousadaId!, dados);
    AuditoriaModel.log(req.user!.id, 'criar', 'tarifa', t.id, { depois: dados }, req.ip || null).catch(() => {});
    res.status(201).json({ sucesso: true, tarifa: paraApi(t) });
  } catch (err) {
    next(new AppError('Erro ao criar tarifa', 500, 'TAR_003'));
  }
});

router.put('/:id', authorize(['admin']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(param(req, 'id'));
    const { dados, erros } = lerTarifa(req.body);
    const semQuarto = await validarQuarto(req.user!.pousadaId!, dados.quartoNumero);
    if (semQuarto) erros.push(semQuarto);
    if (erros.length) return res.status(400).json({ sucesso: false, codigo: 'VAL_001', mensagem: 'Dados inválidos', erros });
    const t = await TarifaModel.atualizar(id, req.user!.pousadaId!, dados);
    if (!t) return res.status(404).json({ sucesso: false, codigo: 'TAR_404', mensagem: 'Regra não encontrada' });
    AuditoriaModel.log(req.user!.id, 'atualizar', 'tarifa', id, { depois: dados }, req.ip || null).catch(() => {});
    res.json({ sucesso: true, tarifa: paraApi(t) });
  } catch (err) {
    next(new AppError('Erro ao atualizar tarifa', 500, 'TAR_004'));
  }
});

router.delete('/:id', authorize(['admin']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(param(req, 'id'));
    if (!(await TarifaModel.remover(id, req.user!.pousadaId!))) {
      return res.status(404).json({ sucesso: false, codigo: 'TAR_404', mensagem: 'Regra não encontrada' });
    }
    AuditoriaModel.log(req.user!.id, 'excluir', 'tarifa', id, null, req.ip || null).catch(() => {});
    res.json({ sucesso: true });
  } catch (err) {
    next(new AppError('Erro ao remover tarifa', 500, 'TAR_005'));
  }
});

export default router;
