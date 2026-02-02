/**
 * Middleware de tratamento global de erros
 *
 * Este middleware deve ser registrado DEPOIS de todas as rotas.
 * Captura erros nao tratados e formata a resposta de forma consistente.
 */

const { AppError, isAppError } = require('../utils/errors');

/**
 * Formata timestamp para logging
 * @returns {string} Timestamp formatado
 */
function getTimestamp() {
  return new Date().toISOString();
}

/**
 * Middleware de tratamento de erros
 * @param {Error} err - Erro capturado
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 * @param {Function} next - Express next (nao usado, mas necessario na assinatura)
 */
function errorHandler(err, req, res, next) {
  // Log detalhado do erro (sempre, independente do ambiente)
  const logData = {
    timestamp: getTimestamp(),
    method: req.method,
    path: req.path,
    userId: req.user?.id || null,
    pousadaId: req.user?.pousada_id || null,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    error: {
      name: err.name,
      message: err.message,
      code: err.code || 'UNKNOWN'
    }
  };

  // Em desenvolvimento, incluir stack trace
  if (process.env.NODE_ENV !== 'production') {
    logData.error.stack = err.stack;
  }

  console.error('[ERROR]', JSON.stringify(logData, null, 2));

  // Se ja enviou resposta, nao fazer nada
  if (res.headersSent) {
    return next(err);
  }

  // Se e um AppError, usar o formato padronizado
  if (isAppError(err)) {
    return err.send(res);
  }

  // Erros de validacao do Express
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      sucesso: false,
      codigo: 'VAL_001',
      mensagem: 'Dados invalidos',
      detalhes: process.env.NODE_ENV !== 'production' ? err.message : undefined
    });
  }

  // Erros de JSON malformado
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      sucesso: false,
      codigo: 'VAL_001',
      mensagem: 'JSON invalido'
    });
  }

  // Erros de payload muito grande
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      sucesso: false,
      codigo: 'VAL_001',
      mensagem: 'Payload muito grande'
    });
  }

  // Erro generico - nao expor detalhes em producao
  const response = {
    sucesso: false,
    codigo: 'SRV_001',
    mensagem: 'Erro interno do servidor'
  };

  // Em desenvolvimento, incluir mais informacoes
  if (process.env.NODE_ENV !== 'production') {
    response.detalhes = err.message;
    response.stack = err.stack?.split('\n').slice(0, 5);
  }

  res.status(500).json(response);
}

/**
 * Middleware para rotas nao encontradas (404)
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    sucesso: false,
    codigo: 'SRV_001',
    mensagem: `Rota nao encontrada: ${req.method} ${req.path}`
  });
}

/**
 * Wrapper para handlers async que propaga erros para o middleware de erro
 * Uso: router.get('/rota', asyncHandler(async (req, res) => { ... }))
 *
 * @param {Function} fn - Handler async
 * @returns {Function} Handler wrapped
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler
};
