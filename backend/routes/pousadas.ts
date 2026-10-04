import { Router, Request, Response, NextFunction } from 'express';
import PousadaModel, { LimiteDoPlano } from '../models/Pousada.js';
import QuartoModel, { QuartoRecusado } from '../models/Quarto.js';
import { excluirPousada, ExclusaoRecusada } from '../models/Conta.js';
import { hojeLocal } from '../utils/datas.js';
import { billingHabilitado } from '../lib/stripe.js';
import StaffInviteModel from '../models/StaffInvite.js';
import { validarPousada, sanitizarPousada, validarEmail } from '../utils/validation.js';
import { authorize, requireOwner, PAPEIS_ATRIBUIVEIS, ehPapelValido } from '../middleware/auth.js';
import { lerConfigMotor } from '../models/Motor.js';
import { lerConfigPix, salvarCredencial, situacaoPix } from '../models/Pix.js';
import { whatsappApiConfigurada } from '../lib/whatsapp.js';
import { sendStaffInviteEmail } from '../lib/email.js';
import AuditoriaModel from '../models/Auditoria.js';
import { urlDoApp } from '../utils/origens.js';
import { excedeLimiteDeQuartos, excedeLimiteDeUsuarios } from '../middleware/assinatura.js';
import { param } from '../utils/http.js';

const router = Router();

// Middleware to check if user has access to the pousada
const requirePousadaAccess = (req: Request, res: Response, next: NextFunction) => {
  const pousadaId = parseInt(param(req, 'id'));
  if (!req.user?.pousadaId || req.user.pousadaId !== pousadaId) {
    return res.status(403).json({
      sucesso: false,
      mensagem: 'Você não tem acesso a esta pousada'
    });
  }
  next();
};

// Middleware to verify owner access for specific pousada
const requirePousadaOwner = (req: Request, res: Response, next: NextFunction) => {
  const pousadaId = parseInt(param(req, 'id'));
  if (!req.user?.pousadaId || req.user.pousadaId !== pousadaId) {
    return res.status(403).json({
      sucesso: false,
      mensagem: 'Você não tem permissão para gerenciar esta pousada'
    });
  }

  if (!req.user.isOwner && req.user.role !== 'admin') {
    return res.status(403).json({
      sucesso: false,
      mensagem: 'Apenas o proprietário pode realizar esta ação'
    });
  }

  next();
};

// ============================================
// PUBLIC ROUTES (after authentication)
// ============================================

/**
 * POST /api/pousadas
 * Create new pousada (can create multiple)
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    // Sanitize data
    const dadosSanitizados = sanitizarPousada(req.body);

    // Validate data
    const validacao = validarPousada(dadosSanitizados as any);
    if (!validacao.valido) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Dados inválidos',
        erros: validacao.erros
      });
    }

    // Limites (número de pousadas e de quartos) são decididos dentro da
    // transação de criação — ver PousadaModel.criarComOwner.
    const pousada = await PousadaModel.criarComOwner({
      nome: dadosSanitizados.nome!,
      numQuartos: dadosSanitizados.num_quartos as number,
      endereco: dadosSanitizados.endereco,
      cidade: dadosSanitizados.cidade,
      estado: dadosSanitizados.estado,
      cep: dadosSanitizados.cep,
      telefone: dadosSanitizados.telefone,
      email: dadosSanitizados.email,
      logoUrl: dadosSanitizados.logo_url,
      descricao: dadosSanitizados.descricao,
      configuracoes: dadosSanitizados.configuracoes,
    }, req.user!.id, { aplicarLimites: billingHabilitado() });

    res.status(201).json({
      sucesso: true,
      mensagem: 'Pousada criada com sucesso',
      pousada
    });
  } catch (error: any) {
    if (error instanceof LimiteDoPlano) {
      return res.status(402).json({ sucesso: false, codigo: error.codigo, mensagem: error.message, precisaUpgrade: true });
    }
    console.error('Erro ao criar pousada:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao criar pousada'
    });
  }
});

/**
 * GET /api/pousadas/minha
 * Get current user's active pousada
 */
router.get('/minha', async (req: Request, res: Response) => {
  try {
    if (!req.user?.pousadaId) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Você ainda não possui uma pousada cadastrada',
        needsOnboarding: true
      });
    }

    const pousada = await PousadaModel.buscarPorId(req.user.pousadaId);

    if (!pousada) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Pousada não encontrada'
      });
    }

    res.json({
      sucesso: true,
      pousada
    });
  } catch (error) {
    console.error('Erro ao buscar pousada:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao buscar dados da pousada'
    });
  }
});

/**
 * GET /api/pousadas/minhas
 * List all pousadas the user belongs to (with role info)
 */
router.get('/minhas', async (req: Request, res: Response) => {
  try {
    const pousadasList = await PousadaModel.listarPousadasDoUsuario(req.user!.id);

    res.json({
      sucesso: true,
      pousadas: pousadasList,
      ativaId: req.user!.pousadaId,
    });
  } catch (error) {
    console.error('Erro ao listar pousadas:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao listar pousadas',
    });
  }
});

/**
 * POST /api/pousadas/trocar
 * Switch active pousada
 */
router.post('/trocar', async (req: Request, res: Response) => {
  try {
    const { pousadaId } = req.body;

    if (!pousadaId || isNaN(parseInt(pousadaId))) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID da pousada inválido',
      });
    }

    const result = await PousadaModel.trocarPousadaAtiva(req.user!.id, parseInt(pousadaId));
    const pousada = await PousadaModel.buscarPorId(parseInt(pousadaId));

    res.json({
      sucesso: true,
      mensagem: 'Pousada ativa alterada com sucesso',
      pousada,
      role: result.role,
      isOwner: result.isOwner,
    });
  } catch (error: any) {
    console.error('Erro ao trocar pousada:', error);
    res.status(400).json({
      sucesso: false,
      mensagem: 'Erro ao trocar pousada',
    });
  }
});

/**
 * GET /api/pousadas/:id
 * Get pousada details
 */
router.get('/:id', requirePousadaAccess, async (req: Request, res: Response) => {
  try {
    const id = param(req, 'id');

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID da pousada inválido'
      });
    }

    const pousada = await PousadaModel.buscarPorId(parseInt(id));

    if (!pousada) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Pousada não encontrada'
      });
    }

    res.json({
      sucesso: true,
      pousada
    });
  } catch (error) {
    console.error('Erro ao buscar pousada:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao buscar dados da pousada'
    });
  }
});

/**
 * PUT /api/pousadas/:id
 * Update pousada data (owner/admin only)
 */
router.put('/:id', requirePousadaOwner, async (req: Request, res: Response) => {
  try {
    const id = param(req, 'id');

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID da pousada inválido'
      });
    }

    // Sanitize data
    const dadosSanitizados = sanitizarPousada(req.body);

    // Validate data (partial - only sent fields)
    const validacao = validarPousada(dadosSanitizados as any, true);
    if (!validacao.valido) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Dados inválidos',
        erros: validacao.erros
      });
    }

    if (dadosSanitizados.num_quartos !== undefined) {
      const estouro = await excedeLimiteDeQuartos(parseInt(id), dadosSanitizados.num_quartos as number);
      if (estouro) {
        return res.status(402).json({ sucesso: false, codigo: 'BILLING_002', mensagem: estouro, precisaUpgrade: true });
      }

      // "Número de quartos" é atalho: cria/reativa ou desativa quartos no
      // cadastro (a fonte da verdade é a tabela quartos). Recusa se algum
      // quarto que sairia tiver reserva vigente.
      try {
        await QuartoModel.ajustarQuantidade(parseInt(id), dadosSanitizados.num_quartos as number, hojeLocal());
      } catch (err) {
        if (err instanceof QuartoRecusado) {
          return res.status(409).json({ sucesso: false, codigo: 'POU_001', mensagem: err.message });
        }
        throw err;
      }
    }

    const pousadaAtualizada = await PousadaModel.atualizar(parseInt(id), {
      nome: dadosSanitizados.nome,
      // num_quartos é cache mantido por trigger; o ajuste já foi feito acima.
      endereco: dadosSanitizados.endereco,
      cidade: dadosSanitizados.cidade,
      estado: dadosSanitizados.estado,
      cep: dadosSanitizados.cep,
      telefone: dadosSanitizados.telefone,
      email: dadosSanitizados.email,
      logoUrl: dadosSanitizados.logo_url,
      descricao: dadosSanitizados.descricao,
      configuracoes: dadosSanitizados.configuracoes,
    });

    await AuditoriaModel.log(req.user!.id, 'pousada_update', 'pousada', parseInt(id), dadosSanitizados, req.ip || null);

    res.json({
      sucesso: true,
      mensagem: 'Pousada atualizada com sucesso',
      pousada: pousadaAtualizada
    });
  } catch (error: any) {
    console.error('Erro ao atualizar pousada:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao atualizar pousada'
    });
  }
});

/**
 * GET /api/pousadas/:id/dashboard
 * Get dashboard statistics
 */
/**
 * PUT /api/pousadas/:id/motor
 * Motor de reservas pelo site: liga/desliga, prazo, sinal, políticas e endereço.
 */
router.put('/:id/motor', requirePousadaOwner, async (req: Request, res: Response) => {
  try {
    const id = parseInt(param(req, 'id'));
    const { config, erros } = lerConfigMotor(req.body ?? {});
    if (req.body?.slug !== undefined) {
      const erroSlug = await PousadaModel.definirSlug(id, String(req.body.slug).trim().toLowerCase());
      if (erroSlug) erros.push(erroSlug);
    }
    if (erros.length) return res.status(400).json({ sucesso: false, mensagem: erros[0], erros });
    const pousada = await PousadaModel.atualizar(id, { configuracoes: { motor: config } });
    await AuditoriaModel.log(req.user!.id, 'motor_reservas', 'pousada', id, { depois: config }, req.ip || null);
    res.json({ sucesso: true, pousada });
  } catch (error) {
    console.error('Erro ao salvar o motor de reservas:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao salvar' });
  }
});

/**
 * GET/PUT /api/pousadas/:id/pix
 * Chave Pix (copia e cola com confirmação manual) e, opcionalmente, o token
 * do Mercado Pago (confirmação automática). O token nunca volta na resposta.
 */
router.get('/:id/pix', requirePousadaOwner, async (req: Request, res: Response) => {
  res.json({ sucesso: true, pix: await situacaoPix(parseInt(param(req, 'id'))) });
});

router.put('/:id/pix', requirePousadaOwner, async (req: Request, res: Response) => {
  try {
    const id = parseInt(param(req, 'id'));
    const { config, erros } = lerConfigPix(req.body ?? {});
    const chaveApi = typeof req.body?.asaas_chave === 'string' ? req.body.asaas_chave.trim() : '';
    if (chaveApi && !/^\$aact_[A-Za-z0-9_=+/.-]{20,400}$/.test(chaveApi)) {
      erros.push('Chave de API do Asaas inválida (Asaas > Integrações > Chave de API; começa com $aact_).');
    }
    if (erros.length) return res.status(400).json({ sucesso: false, mensagem: erros[0], erros });
    await PousadaModel.atualizar(id, { configuracoes: { pix: config } });
    let aviso: string | undefined;
    if (chaveApi) {
      const r = await salvarCredencial(id, chaveApi, req.user!.email ?? '');
      if (!r.webhookRegistrado) aviso = `Chave salva, mas o aviso de pagamento não pôde ser registrado no Asaas (${r.erro ?? 'sem detalhe'}). Cadastre o webhook manualmente com o endereço e o token abaixo.`;
    }
    if (req.body?.remover_asaas === true) await salvarCredencial(id, null);
    await AuditoriaModel.log(req.user!.id, 'config_pix', 'pousada', id, { chave: Boolean(config), asaas: Boolean(chaveApi) }, req.ip || null);
    res.json({ sucesso: true, aviso, pix: await situacaoPix(id) });
  } catch (error) {
    console.error('Erro ao salvar Pix:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao salvar' });
  }
});

/** GET /api/pousadas/:id/whatsapp — a plataforma tem a API oficial ligada? */
router.get('/:id/whatsapp', requirePousadaAccess, (req: Request, res: Response) => {
  res.json({ sucesso: true, apiOficial: whatsappApiConfigurada() });
});

router.get('/:id/dashboard', requirePousadaAccess, async (req: Request, res: Response) => {
  try {
    const id = param(req, 'id');

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID da pousada inválido'
      });
    }

    const estatisticas = await PousadaModel.obterEstatisticas(parseInt(id));

    res.json({
      sucesso: true,
      ...estatisticas
    });
  } catch (error) {
    console.error('Erro ao obter estatísticas:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao obter estatísticas do dashboard'
    });
  }
});

/**
 * GET /api/pousadas/:id/quartos
 * List pousada rooms
 */
router.get('/:id/quartos', requirePousadaAccess, async (req: Request, res: Response) => {
  try {
    const id = param(req, 'id');

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID da pousada inválido'
      });
    }

    const quartos = (await QuartoModel.listar(parseInt(id), false)).map((q) => q.numero);

    res.json({
      sucesso: true,
      quartos
    });
  } catch (error) {
    console.error('Erro ao listar quartos:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao listar quartos'
    });
  }
});

// ============================================
// USER MANAGEMENT ROUTES
// ============================================

/**
 * GET /api/pousadas/:id/usuarios
 * List pousada users (admin/owner only)
 */
router.get('/:id/usuarios', requirePousadaOwner, async (req: Request, res: Response) => {
  try {
    const id = param(req, 'id');

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID da pousada inválido'
      });
    }

    const usuarios = await PousadaModel.listarUsuarios(parseInt(id));

    res.json({
      sucesso: true,
      usuarios
    });
  } catch (error) {
    console.error('Erro ao listar usuários:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao listar usuários da pousada'
    });
  }
});

// POST /api/pousadas/:id/usuarios (vincular um usuário pelo id) foi REMOVIDO.
// Ele puxava qualquer conta para dentro da pousada sem consentimento e sem
// passar pelo limite de usuários do plano. Entrar numa equipe agora é só por
// convite, que exige o e-mail do convidado e o aceite dele.

/**
 * PATCH /api/pousadas/:id/usuarios/:userId
 * Troca o papel de um membro. Regras:
 * - ninguém muda o próprio papel nem o do dono;
 * - conceder ou retirar o papel de admin é só do dono (um admin não cria
 *   outros admins nem rebaixa um colega).
 * Vale na hora: o papel é lido do vínculo a cada requisição.
 */
router.patch('/:id/usuarios/:userId', requirePousadaOwner, async (req: Request, res: Response) => {
  const pousadaId = parseInt(param(req, 'id'));
  const alvoId = param(req, 'userId');
  const { role } = req.body ?? {};

  if (!ehPapelValido(role)) {
    return res.status(400).json({ sucesso: false, mensagem: `Papel inválido. Use: ${PAPEIS_ATRIBUIVEIS.join(', ')}` });
  }
  if (alvoId === req.user!.id) {
    return res.status(400).json({ sucesso: false, mensagem: 'Você não pode alterar o próprio papel.' });
  }

  const vinculo = await PousadaModel.verificarAcesso(pousadaId, alvoId);
  if (!vinculo) {
    return res.status(404).json({ sucesso: false, mensagem: 'Usuário não é membro desta pousada.' });
  }
  if (vinculo.isOwner) {
    return res.status(403).json({ sucesso: false, mensagem: 'O papel do proprietário não pode ser alterado.' });
  }
  if (!req.user!.isOwner && (role === 'admin' || vinculo.role === 'admin')) {
    return res.status(403).json({ sucesso: false, mensagem: 'Só o proprietário concede ou retira o papel de administrador.' });
  }

  await PousadaModel.alterarPapel(pousadaId, alvoId, role);
  await AuditoriaModel.log(req.user!.id, 'user_role_change', 'user_pousada', pousadaId,
    { userId: alvoId, de: vinculo.role, para: role }, req.ip || null);

  res.json({ sucesso: true, mensagem: 'Papel atualizado.' });
});

/**
 * DELETE /api/pousadas/:id/usuarios/:userId
 * Remove user from pousada (admin/owner only)
 */
router.delete('/:id/usuarios/:userId', requirePousadaOwner, async (req: Request, res: Response) => {
  try {
    const id = param(req, 'id');
    const userId = param(req, 'userId');

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID da pousada inválido'
      });
    }

    if (!userId) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID do usuário inválido'
      });
    }

    // Don't allow removing yourself
    if (userId === req.user!.id) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Você não pode remover a si mesmo da pousada'
      });
    }

    // Admin não remove outro admin (só o dono decide sobre administradores).
    const vinculoAlvo = await PousadaModel.verificarAcesso(parseInt(id), userId);
    if (vinculoAlvo?.role === 'admin' && !req.user!.isOwner) {
      return res.status(403).json({ sucesso: false, mensagem: 'Só o proprietário remove um administrador.' });
    }

    await PousadaModel.removerUsuario(parseInt(id), userId);

    await AuditoriaModel.log(req.user!.id, 'user_remove', 'user_pousada', parseInt(id), { removedUserId: userId }, req.ip || null);

    res.json({
      sucesso: true,
      mensagem: 'Usuário removido da pousada'
    });
  } catch (error: any) {
    console.error('Erro ao remover usuário:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao remover usuário'
    });
  }
});

// ============================================
// ADMINISTRATION ROUTES
// ============================================

/**
 * DELETE /api/pousadas/:id — exclusão definitiva a pedido do dono (LGPD).
 * Corpo: { confirmacao: "<nome exato da pousada>" }.
 */
router.delete('/:id', requirePousadaOwner, async (req: Request, res: Response) => {
  if (!req.user!.isOwner) {
    return res.status(403).json({ sucesso: false, mensagem: 'Só o proprietário pode excluir a pousada.' });
  }
  const pousadaId = parseInt(param(req, 'id'));
  try {
    await excluirPousada(pousadaId, String(req.body?.confirmacao ?? ''));
  } catch (err) {
    if (err instanceof ExclusaoRecusada) {
      return res.status(409).json({ sucesso: false, mensagem: err.message });
    }
    throw err;
  }
  // Registro sem dado pessoal: a auditoria da pousada acabou de ser apagada.
  await AuditoriaModel.log(req.user!.id, 'pousada_excluida', 'usuario', null, { pousadaId }, req.ip || null);
  res.json({ sucesso: true, mensagem: 'Pousada excluída definitivamente.' });
});

/**
 * POST /api/pousadas/:id/desativar
 * Deactivate pousada (owner only)
 */
router.post('/:id/desativar', requirePousadaOwner, async (req: Request, res: Response) => {
  try {
    const id = param(req, 'id');

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID da pousada inválido'
      });
    }

    // Only owner can deactivate
    if (!req.user?.isOwner) {
      return res.status(403).json({
        sucesso: false,
        mensagem: 'Apenas o proprietário pode desativar a pousada'
      });
    }

    await PousadaModel.desativar(parseInt(id));

    res.json({
      sucesso: true,
      mensagem: 'Pousada desativada com sucesso'
    });
  } catch (error) {
    console.error('Erro ao desativar pousada:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao desativar pousada'
    });
  }
});

/**
 * POST /api/pousadas/:id/reativar
 * Reactivate pousada (owner only)
 */
router.post('/:id/reativar', requirePousadaOwner, async (req: Request, res: Response) => {
  try {
    const id = param(req, 'id');

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID da pousada inválido'
      });
    }

    // Only owner can reactivate
    if (!req.user?.isOwner) {
      return res.status(403).json({
        sucesso: false,
        mensagem: 'Apenas o proprietário pode reativar a pousada'
      });
    }

    await PousadaModel.reativar(parseInt(id));

    res.json({
      sucesso: true,
      mensagem: 'Pousada reativada com sucesso'
    });
  } catch (error) {
    console.error('Erro ao reativar pousada:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao reativar pousada'
    });
  }
});

// ============================================
// STAFF INVITE ROUTES
// ============================================

// Endereco canonico, nao a lista de CORS: um link so pode apontar para um lugar.
const FRONTEND_URL = urlDoApp();

/**
 * POST /api/pousadas/:id/convites
 * Create invite and send email (owner/admin only)
 */
router.post('/:id/convites', requirePousadaOwner, async (req: Request, res: Response) => {
  try {
    const pousadaId = parseInt(param(req, 'id'));
    const { email, role } = req.body;

    if (!validarEmail(email)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Email inválido',
      });
    }

    if (role && !ehPapelValido(role)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: `Papel inválido. Use: ${PAPEIS_ATRIBUIVEIS.join(', ')}`,
      });
    }

    const estouro = await excedeLimiteDeUsuarios(pousadaId);
    if (estouro) {
      return res.status(402).json({ sucesso: false, codigo: 'BILLING_003', mensagem: estouro, precisaUpgrade: true });
    }

    // Check for existing pending invite
    const exists = await StaffInviteModel.existeConvitePendente(email, pousadaId);
    if (exists) {
      return res.status(409).json({
        sucesso: false,
        mensagem: 'Já existe um convite pendente para este email',
      });
    }

    // Get pousada name for email
    const pousada = await PousadaModel.buscarPorId(pousadaId);
    if (!pousada) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Pousada não encontrada',
      });
    }

    const invite = await StaffInviteModel.criar({
      pousadaId,
      email,
      role: role || 'recepcao',
      invitedBy: req.user!.id,
    });

    await AuditoriaModel.log(req.user!.id, 'invite_create', 'staff_invite', invite.id, { email, role: role || 'recepcao', pousadaId }, req.ip || null);

    // O e-mail vai para a fila (com retentativa). Se nem enfileirar der certo,
    // o convite existe mas a tela precisa dizer que o e-mail não saiu — antes
    // dizia "enviado" mesmo quando o envio falhava.
    const inviteUrl = `${FRONTEND_URL}/convite/${invite.token}`;
    let emailEnfileirado = true;
    try {
      await sendStaffInviteEmail(email, pousada.nome, role || 'recepcao', req.user!.name || 'Administrador', inviteUrl);
    } catch (err) {
      emailEnfileirado = false;
      console.error('[Convite] falha ao enfileirar e-mail:', err);
    }

    res.status(201).json({
      sucesso: true,
      mensagem: emailEnfileirado
        ? 'Convite criado — o e-mail chega em instantes.'
        : 'Convite criado, mas o e-mail não pôde ser enviado agora. Use "Reenviar" em alguns minutos.',
      emailEnviado: emailEnfileirado,
      convite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        expiresAt: invite.expiresAt,
      },
    });
  } catch (error: any) {
    console.error('Erro ao criar convite:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao criar convite',
    });
  }
});

/**
 * GET /api/pousadas/:id/convites
 * List invites (owner/admin only)
 */
router.get('/:id/convites', requirePousadaOwner, async (req: Request, res: Response) => {
  try {
    const pousadaId = parseInt(param(req, 'id'));
    const convites = await StaffInviteModel.listarPorPousada(pousadaId);

    res.json({
      sucesso: true,
      convites,
    });
  } catch (error) {
    console.error('Erro ao listar convites:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao listar convites',
    });
  }
});

/**
 * POST /api/pousadas/:id/convites/:inviteId/reenviar
 * Reenvia o e-mail de um convite pendente (o convidado perdeu, foi pro spam).
 * Renova a validade por mais 7 dias.
 */
router.post('/:id/convites/:inviteId/reenviar', requirePousadaOwner, async (req: Request, res: Response) => {
  const pousadaId = parseInt(param(req, 'id'));
  const inviteId = parseInt(param(req, 'inviteId'));
  if (isNaN(inviteId)) {
    return res.status(400).json({ sucesso: false, mensagem: 'ID do convite inválido' });
  }

  const convite = await StaffInviteModel.renovar(inviteId, pousadaId);
  if (!convite) {
    return res.status(404).json({ sucesso: false, mensagem: 'Convite pendente não encontrado' });
  }
  const pousada = await PousadaModel.buscarPorId(pousadaId);
  await sendStaffInviteEmail(
    convite.email,
    pousada?.nome ?? 'sua pousada',
    convite.role,
    req.user!.name || 'Administrador',
    `${FRONTEND_URL}/convite/${convite.token}`,
  );
  AuditoriaModel.log(req.user!.id, 'invite_resend', 'staff_invite', inviteId, { pousadaId }, req.ip || null)
    .catch((e) => console.error('[Auditoria] reenvio de convite:', e.message));

  res.json({ sucesso: true, mensagem: 'Convite reenviado.' });
});

/**
 * DELETE /api/pousadas/:id/convites/:inviteId
 * Revoke invite (owner/admin only)
 */
router.delete('/:id/convites/:inviteId', requirePousadaOwner, async (req: Request, res: Response) => {
  try {
    const pousadaId = parseInt(param(req, 'id'));
    const inviteId = parseInt(param(req, 'inviteId'));

    if (isNaN(inviteId)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID do convite inválido',
      });
    }

    await StaffInviteModel.revogar(inviteId, pousadaId);

    await AuditoriaModel.log(req.user!.id, 'invite_revoke', 'staff_invite', inviteId, { pousadaId }, req.ip || null);

    res.json({
      sucesso: true,
      mensagem: 'Convite revogado com sucesso',
    });
  } catch (error: any) {
    console.error('Erro ao revogar convite:', error);
    res.status(400).json({
      sucesso: false,
      mensagem: 'Erro ao revogar convite',
    });
  }
});

export default router;
