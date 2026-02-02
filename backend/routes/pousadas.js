const express = require('express');
const Pousada = require('../models/Pousada');
const { validarPousada, sanitizarPousada } = require('../utils/validation');

const router = express.Router();

// Middleware de autorização
const authorize = (roles = []) => {
  const allowed = roles.length ? roles : ['admin', 'recepcao', 'auditoria', 'operacao'];
  return (req, res, next) => {
    if (!req.user || !allowed.includes(req.user.role)) {
      return res.status(403).json({
        sucesso: false,
        mensagem: 'Acesso negado para este perfil'
      });
    }
    next();
  };
};

// Middleware para verificar se usuário é owner da pousada
const requireOwner = async (req, res, next) => {
  try {
    const pousadaId = parseInt(req.params.id);
    if (!req.user.pousada_id || req.user.pousada_id !== pousadaId) {
      return res.status(403).json({
        sucesso: false,
        mensagem: 'Você não tem permissão para gerenciar esta pousada'
      });
    }

    if (!req.user.is_owner && req.user.role !== 'admin') {
      return res.status(403).json({
        sucesso: false,
        mensagem: 'Apenas o proprietário pode realizar esta ação'
      });
    }

    next();
  } catch (error) {
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao verificar permissões'
    });
  }
};

// Middleware para verificar acesso à pousada
const requirePousadaAccess = async (req, res, next) => {
  try {
    const pousadaId = parseInt(req.params.id);
    if (!req.user.pousada_id || req.user.pousada_id !== pousadaId) {
      return res.status(403).json({
        sucesso: false,
        mensagem: 'Você não tem acesso a esta pousada'
      });
    }
    next();
  } catch (error) {
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao verificar acesso'
    });
  }
};

// ============================================
// ROTAS PÚBLICAS (após autenticação)
// ============================================

/**
 * POST /api/pousadas
 * Criar nova pousada (onboarding)
 */
router.post('/', async (req, res) => {
  try {
    // Verificar se usuário já tem uma pousada
    if (req.user.pousada_id) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Você já possui uma pousada cadastrada'
      });
    }

    // Sanitizar dados
    const dadosSanitizados = sanitizarPousada(req.body);

    // Validar dados
    const validacao = validarPousada(dadosSanitizados);
    if (!validacao.valido) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Dados inválidos',
        erros: validacao.erros
      });
    }

    // Criar pousada com owner
    const pousada = await Pousada.criarComOwner(dadosSanitizados, req.user.id);

    res.status(201).json({
      sucesso: true,
      mensagem: 'Pousada criada com sucesso',
      pousada
    });
  } catch (error) {
    console.error('Erro ao criar pousada:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: error.message || 'Erro ao criar pousada'
    });
  }
});

/**
 * GET /api/pousadas/minha
 * Obtém dados da pousada do usuário atual
 */
router.get('/minha', async (req, res) => {
  try {
    if (!req.user.pousada_id) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Você ainda não possui uma pousada cadastrada',
        needsOnboarding: true
      });
    }

    const pousada = await Pousada.buscarPorId(req.user.pousada_id);

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
 * Obtém detalhes de uma pousada específica
 */
router.get('/:id', requirePousadaAccess, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID da pousada inválido'
      });
    }

    const pousada = await Pousada.buscarPorId(parseInt(id));

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
 * Atualiza dados da pousada (apenas owner/admin)
 */
router.put('/:id', requireOwner, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID da pousada inválido'
      });
    }

    // Sanitizar dados
    const dadosSanitizados = sanitizarPousada(req.body);

    // Validar dados (parcial - apenas campos enviados)
    const validacao = validarPousada(dadosSanitizados, true);
    if (!validacao.valido) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Dados inválidos',
        erros: validacao.erros
      });
    }

    const pousadaAtualizada = await Pousada.atualizar(parseInt(id), dadosSanitizados);

    res.json({
      sucesso: true,
      mensagem: 'Pousada atualizada com sucesso',
      pousada: pousadaAtualizada
    });
  } catch (error) {
    console.error('Erro ao atualizar pousada:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: error.message || 'Erro ao atualizar pousada'
    });
  }
});

/**
 * GET /api/pousadas/:id/dashboard
 * Obtém estatísticas do dashboard
 */
router.get('/:id/dashboard', requirePousadaAccess, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID da pousada inválido'
      });
    }

    const estatisticas = await Pousada.obterEstatisticas(parseInt(id));

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
 * Lista quartos disponíveis da pousada
 */
router.get('/:id/quartos', requirePousadaAccess, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID da pousada inválido'
      });
    }

    const quartos = await Pousada.listarQuartos(parseInt(id));

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
// ROTAS DE GERENCIAMENTO DE USUÁRIOS
// ============================================

/**
 * GET /api/pousadas/:id/usuarios
 * Lista usuários da pousada (apenas admin/owner)
 */
router.get('/:id/usuarios', requireOwner, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID da pousada inválido'
      });
    }

    const usuarios = await Pousada.listarUsuarios(parseInt(id));

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
 * Adiciona usuário à pousada (apenas admin/owner)
 */
router.post('/:id/usuarios', requireOwner, async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, role } = req.body;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID da pousada inválido'
      });
    }

    if (!user_id || isNaN(parseInt(user_id))) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID do usuário inválido'
      });
    }

    const rolesValidos = ['admin', 'recepcao', 'auditoria', 'operacao'];
    if (role && !rolesValidos.includes(role)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: `Role inválido. Use: ${rolesValidos.join(', ')}`
      });
    }

    await Pousada.adicionarUsuario(parseInt(id), parseInt(user_id), role || 'recepcao');

    res.json({
      sucesso: true,
      mensagem: 'Usuário adicionado à pousada'
    });
  } catch (error) {
    console.error('Erro ao adicionar usuário:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: error.message || 'Erro ao adicionar usuário'
    });
  }
});

/**
 * DELETE /api/pousadas/:id/usuarios/:userId
 * Remove usuário da pousada (apenas admin/owner)
 */
router.delete('/:id/usuarios/:userId', requireOwner, async (req, res) => {
  try {
    const { id, userId } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID da pousada inválido'
      });
    }

    if (!userId || isNaN(parseInt(userId))) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID do usuário inválido'
      });
    }

    // Não permitir remover a si mesmo
    if (parseInt(userId) === req.user.id) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Você não pode remover a si mesmo da pousada'
      });
    }

    await Pousada.removerUsuario(parseInt(id), parseInt(userId));

    res.json({
      sucesso: true,
      mensagem: 'Usuário removido da pousada'
    });
  } catch (error) {
    console.error('Erro ao remover usuário:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: error.message || 'Erro ao remover usuário'
    });
  }
});

// ============================================
// ROTAS DE ADMINISTRAÇÃO
// ============================================

/**
 * POST /api/pousadas/:id/desativar
 * Desativa uma pousada (apenas owner)
 */
router.post('/:id/desativar', requireOwner, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID da pousada inválido'
      });
    }

    // Verificar se é o owner (não apenas admin)
    if (!req.user.is_owner) {
      return res.status(403).json({
        sucesso: false,
        mensagem: 'Apenas o proprietário pode desativar a pousada'
      });
    }

    await Pousada.desativar(parseInt(id));

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
 * Reativa uma pousada (apenas owner)
 */
router.post('/:id/reativar', requireOwner, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID da pousada inválido'
      });
    }

    // Verificar se é o owner (não apenas admin)
    if (!req.user.is_owner) {
      return res.status(403).json({
        sucesso: false,
        mensagem: 'Apenas o proprietário pode reativar a pousada'
      });
    }

    await Pousada.reativar(parseInt(id));

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

module.exports = router;
