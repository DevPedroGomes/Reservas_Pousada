import { Router, Request, Response, NextFunction } from 'express';
import PousadaModel from '../models/Pousada';
import { validarPousada, sanitizarPousada } from '../utils/validation';
import { authorize, requireOwner } from '../middleware/auth';

const router = Router();

// Middleware to check if user has access to the pousada
const requirePousadaAccess = (req: Request, res: Response, next: NextFunction) => {
  const pousadaId = parseInt(req.params.id);
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
  const pousadaId = parseInt(req.params.id);
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
 * Create new pousada (onboarding)
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    // Check if user already has a pousada
    if (req.user?.pousadaId) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Você já possui uma pousada cadastrada'
      });
    }

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

    // Create pousada with owner
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
    }, req.user!.id);

    res.status(201).json({
      sucesso: true,
      mensagem: 'Pousada criada com sucesso',
      pousada
    });
  } catch (error: any) {
    console.error('Erro ao criar pousada:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: error.message || 'Erro ao criar pousada'
    });
  }
});

/**
 * GET /api/pousadas/minha
 * Get current user's pousada
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
 * GET /api/pousadas/:id
 * Get pousada details
 */
router.get('/:id', requirePousadaAccess, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

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
    const { id } = req.params;

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

    const pousadaAtualizada = await PousadaModel.atualizar(parseInt(id), {
      nome: dadosSanitizados.nome,
      numQuartos: dadosSanitizados.num_quartos as number | undefined,
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

    res.json({
      sucesso: true,
      mensagem: 'Pousada atualizada com sucesso',
      pousada: pousadaAtualizada
    });
  } catch (error: any) {
    console.error('Erro ao atualizar pousada:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: error.message || 'Erro ao atualizar pousada'
    });
  }
});

/**
 * GET /api/pousadas/:id/dashboard
 * Get dashboard statistics
 */
router.get('/:id/dashboard', requirePousadaAccess, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

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
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID da pousada inválido'
      });
    }

    const quartos = await PousadaModel.listarQuartos(parseInt(id));

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
    const { id } = req.params;

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

/**
 * POST /api/pousadas/:id/usuarios
 * Add user to pousada (admin/owner only)
 */
router.post('/:id/usuarios', requirePousadaOwner, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { user_id, role } = req.body;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID da pousada inválido'
      });
    }

    if (!user_id) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID do usuário é obrigatório'
      });
    }

    const rolesValidos = ['admin', 'recepcao', 'auditoria', 'operacao'];
    if (role && !rolesValidos.includes(role)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: `Role inválido. Use: ${rolesValidos.join(', ')}`
      });
    }

    await PousadaModel.adicionarUsuario(parseInt(id), user_id, role || 'recepcao');

    res.json({
      sucesso: true,
      mensagem: 'Usuário adicionado à pousada'
    });
  } catch (error: any) {
    console.error('Erro ao adicionar usuário:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: error.message || 'Erro ao adicionar usuário'
    });
  }
});

/**
 * DELETE /api/pousadas/:id/usuarios/:userId
 * Remove user from pousada (admin/owner only)
 */
router.delete('/:id/usuarios/:userId', requirePousadaOwner, async (req: Request, res: Response) => {
  try {
    const { id, userId } = req.params;

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

    await PousadaModel.removerUsuario(parseInt(id), userId);

    res.json({
      sucesso: true,
      mensagem: 'Usuário removido da pousada'
    });
  } catch (error: any) {
    console.error('Erro ao remover usuário:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: error.message || 'Erro ao remover usuário'
    });
  }
});

// ============================================
// ADMINISTRATION ROUTES
// ============================================

/**
 * POST /api/pousadas/:id/desativar
 * Deactivate pousada (owner only)
 */
router.post('/:id/desativar', requirePousadaOwner, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

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
    const { id } = req.params;

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

export default router;
