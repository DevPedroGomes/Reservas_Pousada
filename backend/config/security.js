/**
 * Configurações de segurança para a aplicação
 * Este arquivo contém funções e middlewares para reforçar a segurança
 */
const { supabase } = require('../database/db');

// Cache de consultas frequentes (em memória)
const queryCache = {
  items: new Map(),
  ttl: 60000, // 1 minuto (em ms)
  
  /**
   * Obtém um item do cache
   * @param {string} key - A chave do item
   * @returns {any|null} - O valor ou null se não existir/expirado
   */
  get(key) {
    const item = this.items.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expiry) {
      this.items.delete(key);
      return null;
    }
    
    return item.value;
  },
  
  /**
   * Armazena um item no cache
   * @param {string} key - A chave do item
   * @param {any} value - O valor a armazenar
   * @param {number} ttl - Tempo de vida em ms (opcional)
   */
  set(key, value, ttl = this.ttl) {
    this.items.set(key, {
      value,
      expiry: Date.now() + ttl
    });
  },
  
  /**
   * Remove um item do cache
   * @param {string} key - A chave do item
   */
  invalidate(key) {
    this.items.delete(key);
  },
  
  /**
   * Limpa todo o cache
   */
  clear() {
    this.items.clear();
  }
};

/**
 * Wrapper para consultas Supabase com cache
 * @param {function} queryFn - Função que retorna uma Promise com a consulta
 * @param {string} cacheKey - Chave para o cache
 * @param {number} ttl - Tempo de vida do cache em ms
 * @returns {Promise<any>} - Resultado da consulta
 */
const cachedQuery = async (queryFn, cacheKey, ttl = queryCache.ttl) => {
  // Verificar cache
  const cached = queryCache.get(cacheKey);
  if (cached) return cached;
  
  // Executar consulta
  const result = await queryFn();
  
  // Armazenar no cache
  queryCache.set(cacheKey, result, ttl);
  return result;
};

/**
 * Middleware para validação de entrada
 * @param {object} schema - Esquema de validação
 * @returns {function} - Middleware Express
 */
const validateInput = (schema) => {
  return (req, res, next) => {
    try {
      const { error } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          sucesso: false,
          mensagem: `Dados inválidos: ${error.message}`
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};

/**
 * Middleware para logging de atividades
 */
const activityLogger = async (req, res, next) => {
  // Captura o tempo de início
  const start = Date.now();
  
  // Continua com a requisição
  res.on('finish', async () => {
    const duration = Date.now() - start;
    const log = {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      user_id: req.user?.id || null,
      ip: req.ip,
      timestamp: new Date().toISOString()
    };
    
    // Log em produção
    if (process.env.NODE_ENV === 'production') {
      try {
        // Registrar log no Supabase, se tivermos uma tabela para isso
        // Isso é opcional, pode ser implementado posteriormente
      } catch (error) {
        console.error('Erro ao registrar log:', error);
      }
    }
    
    // Log em desenvolvimento
    if (process.env.NODE_ENV !== 'production') {
      if (res.statusCode >= 400) {
        console.error(`[${log.method}] ${log.path} - ${log.status} (${log.duration}ms)`);
      } else {
        console.log(`[${log.method}] ${log.path} - ${log.status} (${log.duration}ms)`);
      }
    }
  });
  
  next();
};

/**
 * Função para registrar uma transação no banco
 */
const registrarTransacao = async (tipoTransacao, dadosTransacao, usuarioId) => {
  try {
    // Em implementações futuras, poderíamos registrar todas as transações
    // para fins de auditoria
    console.log(`Transação: ${tipoTransacao}`, dadosTransacao);
  } catch (error) {
    console.error('Erro ao registrar transação:', error);
  }
};

/**
 * Função para verificar políticas de acesso no Supabase
 * Esta função pode ser expandida conforme as necessidades
 */
const verificarConfiguracaoSupabase = async () => {
  try {
    // Verifica se as tabelas existem
    const { data, error } = await supabase.from('usuarios').select('count');
    
    if (error) {
      console.error('Erro ao verificar configuração do Supabase:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Erro ao verificar configuração do Supabase:', error);
    return false;
  }
};

module.exports = {
  queryCache,
  cachedQuery,
  validateInput,
  activityLogger,
  registrarTransacao,
  verificarConfiguracaoSupabase
}; 