/**
 * Modulo de Erros Estruturados
 *
 * Fornece codigos de erro padronizados para toda a API.
 * Em producao, apenas mensagens genericas sao retornadas ao cliente.
 * Em desenvolvimento, detalhes adicionais sao incluidos.
 */

/**
 * Codigos de erro da aplicacao
 * Formato: CATEGORIA_XXX onde XXX e um numero sequencial
 */
const ERROR_CODES = {
  // ========================================
  // Authentication Errors (AUTH_XXX)
  // ========================================
  AUTH_001: {
    code: 'AUTH_001',
    message: 'Token de acesso requerido',
    status: 401
  },
  AUTH_002: {
    code: 'AUTH_002',
    message: 'Token invalido ou expirado',
    status: 401
  },
  AUTH_003: {
    code: 'AUTH_003',
    message: 'Token malformado',
    status: 403
  },
  AUTH_004: {
    code: 'AUTH_004',
    message: 'Usuario ou senha invalidos',
    status: 401
  },
  AUTH_005: {
    code: 'AUTH_005',
    message: 'Refresh token invalido',
    status: 401
  },
  AUTH_006: {
    code: 'AUTH_006',
    message: 'Refresh token expirado',
    status: 401
  },
  AUTH_007: {
    code: 'AUTH_007',
    message: 'Usuario nao encontrado',
    status: 401
  },
  AUTH_008: {
    code: 'AUTH_008',
    message: 'Email ja cadastrado',
    status: 409
  },
  AUTH_009: {
    code: 'AUTH_009',
    message: 'Username ja cadastrado',
    status: 409
  },

  // ========================================
  // Authorization Errors (AUTHZ_XXX)
  // ========================================
  AUTHZ_001: {
    code: 'AUTHZ_001',
    message: 'Acesso negado para este perfil',
    status: 403
  },
  AUTHZ_002: {
    code: 'AUTHZ_002',
    message: 'Pousada nao configurada',
    status: 403
  },
  AUTHZ_003: {
    code: 'AUTHZ_003',
    message: 'Apenas o proprietario pode realizar esta acao',
    status: 403
  },

  // ========================================
  // Validation Errors (VAL_XXX)
  // ========================================
  VAL_001: {
    code: 'VAL_001',
    message: 'Dados invalidos',
    status: 400
  },
  VAL_002: {
    code: 'VAL_002',
    message: 'CPF invalido',
    status: 400
  },
  VAL_003: {
    code: 'VAL_003',
    message: 'Data invalida',
    status: 400
  },
  VAL_004: {
    code: 'VAL_004',
    message: 'Periodo invalido',
    status: 400
  },
  VAL_005: {
    code: 'VAL_005',
    message: 'ID invalido',
    status: 400
  },
  VAL_006: {
    code: 'VAL_006',
    message: 'Email invalido',
    status: 400
  },
  VAL_007: {
    code: 'VAL_007',
    message: 'Telefone invalido',
    status: 400
  },
  VAL_008: {
    code: 'VAL_008',
    message: 'Campo obrigatorio ausente',
    status: 400
  },

  // ========================================
  // Reservation Errors (RES_XXX)
  // ========================================
  RES_001: {
    code: 'RES_001',
    message: 'Reserva nao encontrada',
    status: 404
  },
  RES_002: {
    code: 'RES_002',
    message: 'Quarto indisponivel no periodo selecionado',
    status: 409
  },
  RES_003: {
    code: 'RES_003',
    message: 'Erro ao criar reserva',
    status: 500
  },
  RES_004: {
    code: 'RES_004',
    message: 'Erro ao atualizar reserva',
    status: 500
  },
  RES_005: {
    code: 'RES_005',
    message: 'Erro ao excluir reserva',
    status: 500
  },
  RES_006: {
    code: 'RES_006',
    message: 'Erro ao listar reservas',
    status: 500
  },
  RES_007: {
    code: 'RES_007',
    message: 'Erro ao verificar disponibilidade',
    status: 500
  },

  // ========================================
  // Pousada Errors (POU_XXX)
  // ========================================
  POU_001: {
    code: 'POU_001',
    message: 'Pousada nao encontrada',
    status: 404
  },
  POU_002: {
    code: 'POU_002',
    message: 'Erro ao criar pousada',
    status: 500
  },
  POU_003: {
    code: 'POU_003',
    message: 'Erro ao atualizar pousada',
    status: 500
  },
  POU_004: {
    code: 'POU_004',
    message: 'Erro ao obter estatisticas',
    status: 500
  },

  // ========================================
  // User Errors (USR_XXX)
  // ========================================
  USR_001: {
    code: 'USR_001',
    message: 'Usuario nao encontrado',
    status: 404
  },
  USR_002: {
    code: 'USR_002',
    message: 'Erro ao criar usuario',
    status: 500
  },
  USR_003: {
    code: 'USR_003',
    message: 'Erro ao atualizar usuario',
    status: 500
  },
  USR_004: {
    code: 'USR_004',
    message: 'Erro ao remover usuario',
    status: 500
  },

  // ========================================
  // Server Errors (SRV_XXX)
  // ========================================
  SRV_001: {
    code: 'SRV_001',
    message: 'Erro interno do servidor',
    status: 500
  },
  SRV_002: {
    code: 'SRV_002',
    message: 'Erro de conexao com banco de dados',
    status: 500
  },
  SRV_003: {
    code: 'SRV_003',
    message: 'Servico temporariamente indisponivel',
    status: 503
  }
};

/**
 * Classe de erro customizada para a aplicacao
 */
class AppError extends Error {
  /**
   * @param {string} errorCode - Codigo do erro (ex: AUTH_001)
   * @param {string|object} [details] - Detalhes adicionais do erro
   * @param {Error} [originalError] - Erro original (para logging)
   */
  constructor(errorCode, details = null, originalError = null) {
    const errorDef = ERROR_CODES[errorCode] || ERROR_CODES.SRV_001;

    super(errorDef.message);

    this.name = 'AppError';
    this.code = errorDef.code;
    this.status = errorDef.status;
    this.details = details;
    this.originalError = originalError;
    this.timestamp = new Date().toISOString();

    // Capturar stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Converte o erro para formato JSON para resposta da API
   * @returns {object} Objeto de erro formatado
   */
  toJSON() {
    const response = {
      sucesso: false,
      codigo: this.code,
      mensagem: this.message
    };

    // Incluir detalhes apenas em desenvolvimento
    if (process.env.NODE_ENV !== 'production') {
      if (this.details) {
        response.detalhes = this.details;
      }
      if (this.originalError) {
        response.erroOriginal = this.originalError.message;
      }
    }

    return response;
  }

  /**
   * Cria uma resposta de erro padronizada
   * @param {Response} res - Express response object
   */
  send(res) {
    return res.status(this.status).json(this.toJSON());
  }
}

/**
 * Factory function para criar resposta de erro sem throw
 * @param {string} errorCode - Codigo do erro
 * @param {string|object} [details] - Detalhes adicionais
 * @returns {object} Objeto de erro formatado
 */
function createErrorResponse(errorCode, details = null) {
  const error = new AppError(errorCode, details);
  return {
    status: error.status,
    body: error.toJSON()
  };
}

/**
 * Helper para criar e enviar erro em uma linha
 * @param {Response} res - Express response
 * @param {string} errorCode - Codigo do erro
 * @param {string|object} [details] - Detalhes adicionais
 */
function sendError(res, errorCode, details = null) {
  const { status, body } = createErrorResponse(errorCode, details);
  return res.status(status).json(body);
}

/**
 * Verifica se um erro e do tipo AppError
 * @param {Error} error
 * @returns {boolean}
 */
function isAppError(error) {
  return error instanceof AppError;
}

module.exports = {
  ERROR_CODES,
  AppError,
  createErrorResponse,
  sendError,
  isAppError
};
