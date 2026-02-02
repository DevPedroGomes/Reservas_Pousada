/**
 * Middleware para definir contexto RLS (Row Level Security)
 *
 * Este middleware deve ser aplicado DEPOIS do authenticateJWT.
 * Ele define as variáveis de sessão no PostgreSQL que são usadas
 * pelas políticas RLS para isolar dados por pousada.
 *
 * Variáveis definidas:
 * - app.current_user_id: ID do usuário autenticado
 * - app.current_pousada_id: ID da pousada do usuário
 */

const { supabase } = require('../database/db');

/**
 * Define o contexto RLS para a requisição atual
 * @param {Request} req - Express request (deve ter req.user do JWT)
 * @param {Response} res - Express response
 * @param {Function} next - Express next function
 */
async function setRlsContext(req, res, next) {
  // Se não há usuário autenticado, pular (middleware JWT não executou ou falhou)
  if (!req.user || !req.user.id) {
    return next();
  }

  try {
    const userId = req.user.id;
    const pousadaId = req.user.pousada_id || null;

    // Chamar função PostgreSQL para definir contexto de sessão
    // Esta função usa SECURITY DEFINER e set_config com is_local=true
    // para que o contexto seja válido apenas para esta transação
    const { error } = await supabase.rpc('set_current_user_context', {
      p_user_id: userId,
      p_pousada_id: pousadaId
    });

    if (error) {
      // Log do erro mas não bloqueia a requisição
      // O backend ainda tem filtros de aplicação como fallback
      console.error('[RLS Context] Erro ao definir contexto:', error.message);
    }

    next();
  } catch (error) {
    // Em caso de erro, logar mas não bloquear
    // O isolamento de dados também é feito no nível da aplicação
    console.error('[RLS Context] Exceção ao definir contexto:', error.message);
    next();
  }
}

/**
 * Middleware que requer pousada configurada
 * Retorna erro se o usuário não pertence a nenhuma pousada
 */
function requirePousada(req, res, next) {
  if (!req.user || !req.user.pousada_id) {
    return res.status(403).json({
      sucesso: false,
      codigo: 'AUTHZ_002',
      mensagem: 'Pousada não configurada. Complete o onboarding primeiro.',
      needsOnboarding: true
    });
  }
  next();
}

/**
 * Middleware que requer ser owner da pousada
 */
function requireOwner(req, res, next) {
  if (!req.user || !req.user.is_owner) {
    return res.status(403).json({
      sucesso: false,
      codigo: 'AUTHZ_001',
      mensagem: 'Apenas o proprietário pode realizar esta ação'
    });
  }
  next();
}

/**
 * Factory para middleware de autorização por roles
 * @param {string[]} allowedRoles - Roles permitidas (ex: ['admin', 'recepcao'])
 */
function authorize(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        sucesso: false,
        codigo: 'AUTH_001',
        mensagem: 'Token de acesso requerido'
      });
    }

    const userRole = req.user.role;
    const isOwner = req.user.is_owner;

    // Owners têm acesso total
    if (isOwner) {
      return next();
    }

    // Verificar se a role do usuário está na lista permitida
    if (allowedRoles.length === 0 || allowedRoles.includes(userRole)) {
      return next();
    }

    return res.status(403).json({
      sucesso: false,
      codigo: 'AUTHZ_001',
      mensagem: 'Acesso negado para este perfil'
    });
  };
}

module.exports = {
  setRlsContext,
  requirePousada,
  requireOwner,
  authorize
};
