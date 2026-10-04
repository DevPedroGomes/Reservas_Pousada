import { Router, Request, Response, NextFunction } from 'express';
import HospedeModel, { HospedeRecusado, lerDadosHospede, validarDadosHospede } from '../models/Hospede.js';
import AuditoriaModel from '../models/Auditoria.js';
import { authorize } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { param } from '../utils/http.js';

const router = Router();

/** Quem opera a pousada vê o documento completo; auditoria vê mascarado. */
function podeVerDocumento(user: NonNullable<Request['user']>): boolean {
  return user.isOwner || user.role === 'admin' || user.role === 'recepcao';
}

function idValido(req: Request): number | null {
  const n = Number(param(req, 'id'));
  return Number.isInteger(n) && n > 0 ? n : null;
}

function recusa(res: Response, err: unknown): boolean {
  if (err instanceof HospedeRecusado) {
    res.status(err.status).json({ sucesso: false, codigo: 'HSP_001', mensagem: err.message });
    return true;
  }
  return false;
}

// Lista e busca (nome, telefone ou documento exato). Também alimenta o
// autocompletar do formulário de reserva.
router.get('/', authorize(['admin', 'recepcao', 'auditoria']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const r = await HospedeModel.listar(req.user!.pousadaId!, {
      busca: typeof req.query.busca === 'string' ? req.query.busca.slice(0, 100) : undefined,
      pagina: Number(req.query.pagina) || 1,
      limite: Number(req.query.limite) || 50,
    });
    res.json({ sucesso: true, ...r, paginas: Math.max(Math.ceil(r.total / r.limite), 1) });
  } catch (err) {
    next(new AppError('Erro ao listar hóspedes', 500, 'HSP_002'));
  }
});

router.post('/', authorize(['admin', 'recepcao']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dados = lerDadosHospede(req.body);
    const erros = validarDadosHospede(dados, true);
    if (erros.length) return res.status(400).json({ sucesso: false, codigo: 'VAL_001', mensagem: 'Dados inválidos', erros });
    // Cadastro explícito não junta com outro: documento repetido é recusado.
    if (dados.documento) {
      const existente = await HospedeModel.porDocumento(req.user!.pousadaId!, dados.tipoDocumento ?? 'cpf', dados.documento);
      if (existente) {
        return res.status(409).json({ sucesso: false, codigo: 'HSP_003', mensagem: `Já existe um hóspede com este documento (${existente.nome}).`, id: existente.id });
      }
    }
    const h = await HospedeModel.resolver(req.user!.pousadaId!, dados);
    AuditoriaModel.log(req.user!.id, 'criar', 'hospede', h.id, { depois: { nome: h.nome } }, req.ip || null)
      .catch((e) => console.error('[Auditoria] hóspede:', e.message));
    res.status(201).json({ sucesso: true, hospede: HospedeModel.paraApi(h, false) });
  } catch (err) {
    if (!recusa(res, err)) next(new AppError('Erro ao cadastrar hóspede', 500, 'HSP_004'));
  }
});

// Ficha do hóspede com o histórico de estadias.
router.get('/:id', authorize(['admin', 'recepcao', 'auditoria']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = idValido(req);
    if (!id) return res.status(400).json({ sucesso: false, codigo: 'VAL_005', mensagem: 'ID inválido' });
    const h = await HospedeModel.buscar(id, req.user!.pousadaId!);
    if (!h) return res.status(404).json({ sucesso: false, codigo: 'HSP_005', mensagem: 'Hóspede não encontrado' });
    const completo = podeVerDocumento(req.user!);
    if (completo && h.documento) {
      AuditoriaModel.log(req.user!.id, 'visualizar_documento', 'hospede', id, null, req.ip || null)
        .catch((e) => console.error('[Auditoria] hóspede:', e.message));
    }
    const historico = await HospedeModel.historico(id, req.user!.pousadaId!);
    res.json({ sucesso: true, hospede: HospedeModel.paraApi(h, !completo), historico });
  } catch (err) {
    next(new AppError('Erro ao buscar hóspede', 500, 'HSP_006'));
  }
});

router.put('/:id', authorize(['admin', 'recepcao']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = idValido(req);
    if (!id) return res.status(400).json({ sucesso: false, codigo: 'VAL_005', mensagem: 'ID inválido' });
    const dados = lerDadosHospede(req.body);
    const erros = validarDadosHospede(dados, false);
    if (erros.length) return res.status(400).json({ sucesso: false, codigo: 'VAL_001', mensagem: 'Dados inválidos', erros });
    const antes = await HospedeModel.buscar(id, req.user!.pousadaId!);
    if (!antes) return res.status(404).json({ sucesso: false, codigo: 'HSP_005', mensagem: 'Hóspede não encontrado' });
    if (antes.anonimizadoEm) return res.status(409).json({ sucesso: false, codigo: 'HSP_007', mensagem: 'Hóspede anonimizado pela política de retenção não pode ser editado.' });
    const h = await HospedeModel.atualizar(id, req.user!.pousadaId!, dados);
    AuditoriaModel.log(req.user!.id, 'atualizar', 'hospede', id, { antes: { nome: antes.nome }, depois: { nome: h!.nome } }, req.ip || null)
      .catch((e) => console.error('[Auditoria] hóspede:', e.message));
    res.json({ sucesso: true, hospede: HospedeModel.paraApi(h!, false) });
  } catch (err) {
    if (!recusa(res, err)) next(new AppError('Erro ao atualizar hóspede', 500, 'HSP_008'));
  }
});

export default router;
