import { Router, Request, Response } from 'express';
import QuartoModel, { QuartoRecusado, type DadosQuarto } from '../models/Quarto.js';
import AuditoriaModel from '../models/Auditoria.js';
import { authorize } from '../middleware/auth.js';
import { excedeLimiteDeQuartos } from '../middleware/assinatura.js';
import { hojeLocal } from '../utils/datas.js';
import { sanitizarString } from '../utils/validation.js';
import { param } from '../utils/http.js';

const router = Router();

/** Lê e valida o corpo. Devolve os campos presentes ou a lista de erros. */
function lerDados(corpo: Record<string, unknown>, parcial: boolean): { dados: DadosQuarto; erros: string[] } {
  const erros: string[] = [];
  const dados: DadosQuarto = {};
  const int = (v: unknown) => (v === '' || v === null || v === undefined ? undefined : Number(v));

  if (corpo.numero !== undefined) {
    const n = int(corpo.numero);
    if (!Number.isInteger(n) || n! < 1 || n! > 9999) erros.push('Número do quarto deve ser de 1 a 9999');
    else dados.numero = n;
  }
  if (corpo.nome !== undefined) dados.nome = sanitizarString(String(corpo.nome), 80);
  else if (!parcial) dados.nome = '';
  if (corpo.tipo !== undefined) dados.tipo = sanitizarString(String(corpo.tipo ?? ''), 60) || null;
  if (corpo.capacidade !== undefined) {
    const c = int(corpo.capacidade);
    if (!Number.isInteger(c) || c! < 1 || c! > 50) erros.push('Capacidade deve ser de 1 a 50 pessoas');
    else dados.capacidade = c;
  }
  if (corpo.preco_base !== undefined) {
    if (corpo.preco_base === null || corpo.preco_base === '') dados.precoBaseCentavos = null;
    else {
      const reais = Number(corpo.preco_base);
      if (!Number.isFinite(reais) || reais < 0 || reais > 100000) erros.push('Preço base inválido');
      else dados.precoBaseCentavos = Math.round(reais * 100);
    }
  }
  if (corpo.descricao !== undefined) dados.descricao = sanitizarString(String(corpo.descricao ?? ''), 500, true) || null;
  if (corpo.ativo !== undefined) dados.ativo = Boolean(corpo.ativo);
  if (corpo.ordem !== undefined) {
    const o = int(corpo.ordem);
    if (Number.isInteger(o)) dados.ordem = o;
  }
  return { dados, erros };
}

const paraApi = (q: Awaited<ReturnType<typeof QuartoModel.listar>>[number]) => ({
  id: q.id,
  numero: q.numero,
  nome: q.nome,
  tipo: q.tipo,
  capacidade: q.capacidade,
  preco_base: q.precoBaseCentavos === null ? null : q.precoBaseCentavos / 100,
  descricao: q.descricao,
  ativo: q.ativo,
  ordem: q.ordem,
});

function tratar(err: unknown, res: Response) {
  if (err instanceof QuartoRecusado) {
    res.status(409).json({ sucesso: false, mensagem: err.message });
    return true;
  }
  return false;
}

// GET /api/quartos?ativos=1 — qualquer papel
router.get('/', async (req: Request, res: Response) => {
  const lista = await QuartoModel.listar(req.user!.pousadaId!, req.query.ativos !== '1');
  res.json({ sucesso: true, quartos: lista.map(paraApi) });
});

// POST /api/quartos — dono/admin
router.post('/', authorize(['admin']), async (req: Request, res: Response) => {
  const pousadaId = req.user!.pousadaId!;
  const { dados, erros } = lerDados(req.body ?? {}, false);
  if (erros.length) return res.status(400).json({ sucesso: false, mensagem: 'Dados inválidos', erros });

  const estouro = await excedeLimiteDeQuartos(pousadaId, (await QuartoModel.contarAtivos(pousadaId)) + 1);
  if (estouro) return res.status(402).json({ sucesso: false, codigo: 'BILLING_002', mensagem: estouro, precisaUpgrade: true });

  try {
    const q = await QuartoModel.criar(pousadaId, dados);
    AuditoriaModel.log(req.user!.id, 'quarto_criar', 'pousada', pousadaId, { quarto: q.numero }, req.ip || null)
      .catch((e) => console.error('[Auditoria] quarto:', e.message));
    res.status(201).json({ sucesso: true, quarto: paraApi(q) });
  } catch (err) {
    if (!tratar(err, res)) throw err;
  }
});

// PUT /api/quartos/:id — dono/admin
router.put('/:id', authorize(['admin']), async (req: Request, res: Response) => {
  const pousadaId = req.user!.pousadaId!;
  const id = parseInt(param(req, 'id'));
  const { dados, erros } = lerDados(req.body ?? {}, true);
  if (erros.length) return res.status(400).json({ sucesso: false, mensagem: 'Dados inválidos', erros });

  if (dados.ativo === true) {
    const atual = await QuartoModel.buscar(id, pousadaId);
    if (atual && !atual.ativo) {
      const estouro = await excedeLimiteDeQuartos(pousadaId, (await QuartoModel.contarAtivos(pousadaId)) + 1);
      if (estouro) return res.status(402).json({ sucesso: false, codigo: 'BILLING_002', mensagem: estouro, precisaUpgrade: true });
    }
  }

  try {
    const q = await QuartoModel.atualizar(id, pousadaId, dados, hojeLocal());
    if (!q) return res.status(404).json({ sucesso: false, mensagem: 'Quarto não encontrado' });
    AuditoriaModel.log(req.user!.id, 'quarto_atualizar', 'pousada', pousadaId, { quarto: q.numero, campos: Object.keys(dados) }, req.ip || null)
      .catch((e) => console.error('[Auditoria] quarto:', e.message));
    res.json({ sucesso: true, quarto: paraApi(q) });
  } catch (err) {
    if (!tratar(err, res)) throw err;
  }
});

// DELETE /api/quartos/:id — dono/admin (desativa se houver histórico)
router.delete('/:id', authorize(['admin']), async (req: Request, res: Response) => {
  const pousadaId = req.user!.pousadaId!;
  try {
    const r = await QuartoModel.remover(parseInt(param(req, 'id')), pousadaId, hojeLocal());
    if (!r) return res.status(404).json({ sucesso: false, mensagem: 'Quarto não encontrado' });
    res.json({
      sucesso: true,
      resultado: r,
      mensagem: r === 'desativado' ? 'O quarto tem histórico de reservas e foi desativado.' : 'Quarto removido.',
    });
  } catch (err) {
    if (!tratar(err, res)) throw err;
  }
});

export default router;
