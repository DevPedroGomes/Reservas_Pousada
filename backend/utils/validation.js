/**
 * Módulo de validação e sanitização de dados
 */

/**
 * Valida CPF brasileiro
 * @param {string} cpf - CPF a ser validado
 * @returns {boolean} - True se válido
 */
function validarCPF(cpf) {
  if (!cpf) return false;
  
  // Remove caracteres não numéricos
  cpf = cpf.replace(/[^\d]/g, '');
  
  // Verifica se tem 11 dígitos
  if (cpf.length !== 11) return false;
  
  // Verifica se todos os dígitos são iguais
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  
  // Validação do primeiro dígito verificador
  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += parseInt(cpf.charAt(i)) * (10 - i);
  }
  let resto = 11 - (soma % 11);
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf.charAt(9))) return false;
  
  // Validação do segundo dígito verificador
  soma = 0;
  for (let i = 0; i < 10; i++) {
    soma += parseInt(cpf.charAt(i)) * (11 - i);
  }
  resto = 11 - (soma % 11);
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf.charAt(10))) return false;
  
  return true;
}

/**
 * Valida data no formato YYYY-MM-DD
 * @param {string} data - Data a ser validada
 * @returns {boolean} - True se válida
 */
function validarData(data) {
  if (!data) return false;
  
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(data)) return false;
  
  const date = new Date(data);
  const timestamp = date.getTime();
  
  if (typeof timestamp !== 'number' || Number.isNaN(timestamp)) return false;
  
  return date.toISOString().startsWith(data);
}

/**
 * Valida se data de entrada é anterior à data de saída
 * @param {string} dataEntrada - Data de entrada
 * @param {string} dataSaida - Data de saída
 * @returns {boolean} - True se válida
 */
function validarPeriodo(dataEntrada, dataSaida) {
  if (!validarData(dataEntrada) || !validarData(dataSaida)) return false;
  
  const entrada = new Date(dataEntrada);
  const saida = new Date(dataSaida);
  
  return entrada < saida;
}

/**
 * Valida se a data não está no passado (considerando dia atual)
 * @param {string} data - Data no formato YYYY-MM-DD
 * @returns {boolean} - True se data for hoje ou futura
 */
function validarDataFuturaOuHoje(data) {
  if (!validarData(data)) return false;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dataVerificada = new Date(data);
  return dataVerificada >= hoje;
}

/**
 * Valida número do quarto
 * @param {number} quarto - Número do quarto
 * @param {number} maxQuartos - Máximo de quartos da pousada (default 100)
 * @returns {boolean} - True se válido
 */
function validarQuarto(quarto, maxQuartos = 100) {
  const num = parseInt(quarto);
  return Number.isInteger(num) && num >= 1 && num <= maxQuartos;
}

/**
 * Valida status da reserva
 * @param {string} status - Status da reserva
 * @returns {boolean} - True se válido
 */
function validarStatus(status) {
  const statusValidos = ['ativa', 'finalizada', 'cancelada'];
  return statusValidos.includes(status);
}

/**
 * Valida valor monetário
 * @param {number} valor - Valor a ser validado
 * @returns {boolean} - True se válido
 */
function validarValor(valor) {
  if (valor === null || valor === undefined) return true; // Valor opcional
  const num = parseFloat(valor);
  return !isNaN(num) && num >= 0 && num <= 999999.99;
}

/**
 * Sanitiza string removendo caracteres perigosos
 * @param {string} str - String a ser sanitizada
 * @returns {string} - String sanitizada
 */
function sanitizarString(str) {
  if (!str || typeof str !== 'string') return '';
  
  return str
    .trim()
    .replace(/[<>\"'&]/g, '') // Remove caracteres HTML perigosos
    .substring(0, 255); // Limita tamanho
}

/**
 * Sanitiza nome (permite apenas letras, espaços e acentos)
 * @param {string} nome - Nome a ser sanitizado
 * @returns {string} - Nome sanitizado
 */
function sanitizarNome(nome) {
  if (!nome || typeof nome !== 'string') return '';
  
  return nome
    .trim()
    .replace(/[^a-zA-ZÀ-ÿ\s]/g, '') // Apenas letras e espaços
    .replace(/\s+/g, ' ') // Remove espaços duplos
    .substring(0, 100);
}

/**
 * Valida dados completos de uma reserva
 * @param {object} reserva - Dados da reserva
 * @returns {object} - {valido: boolean, erros: string[]}
 */
function validarReserva(reserva) {
  const erros = [];
  
  // Validar nome
  if (!reserva.nome || reserva.nome.trim().length < 2) {
    erros.push('Nome deve ter pelo menos 2 caracteres');
  }
  
  // Validar CPF
  if (!validarCPF(reserva.cpf)) {
    erros.push('CPF inválido');
  }
  
  // Validar quarto
  if (!validarQuarto(reserva.quarto)) {
    erros.push('Número do quarto deve estar entre 1 e 25');
  }
  
  // Validar datas
  if (!validarData(reserva.data_entrada)) {
    erros.push('Data de entrada inválida');
  }
  
  if (!validarData(reserva.data_saida)) {
    erros.push('Data de saída inválida');
  }
  
  if (reserva.data_entrada && reserva.data_saida && !validarPeriodo(reserva.data_entrada, reserva.data_saida)) {
    erros.push('Data de entrada deve ser anterior à data de saída');
  }

  if (reserva.data_entrada && !validarDataFuturaOuHoje(reserva.data_entrada)) {
    erros.push('Data de entrada não pode estar no passado');
  }

  if (reserva.data_saida && !validarDataFuturaOuHoje(reserva.data_saida)) {
    erros.push('Data de saída não pode estar no passado');
  }
  
  // Validar status
  if (reserva.status && !validarStatus(reserva.status)) {
    erros.push('Status inválido. Use: ativa, finalizada ou cancelada');
  }
  
  // Validar valor
  if (reserva.valor !== undefined && !validarValor(reserva.valor)) {
    erros.push('Valor inválido');
  }
  
  return {
    valido: erros.length === 0,
    erros
  };
}

/**
 * Sanitiza dados de uma reserva
 * @param {object} reserva - Dados da reserva
 * @returns {object} - Dados sanitizados
 */
function sanitizarReserva(reserva) {
  return {
    nome: sanitizarNome(reserva.nome),
    cpf: reserva.cpf ? reserva.cpf.replace(/[^\d]/g, '') : '',
    quarto: parseInt(reserva.quarto),
    data_entrada: reserva.data_entrada,
    data_saida: reserva.data_saida,
    status: reserva.status,
    valor: reserva.valor ? parseFloat(reserva.valor) : null,
    pago: Boolean(reserva.pago),
    observacoes: sanitizarString(reserva.observacoes || '')
  };
}

/**
 * Valida username para registro
 * @param {string} username - Username a ser validado
 * @returns {object} - {valido: boolean, erro?: string}
 */
function validarUsername(username) {
  if (!username || typeof username !== 'string') {
    return { valido: false, erro: 'Username é obrigatório' };
  }

  const trimmed = username.trim();

  if (trimmed.length < 3) {
    return { valido: false, erro: 'Username deve ter pelo menos 3 caracteres' };
  }

  if (trimmed.length > 50) {
    return { valido: false, erro: 'Username deve ter no máximo 50 caracteres' };
  }

  // Apenas letras, números e underscore
  if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
    return { valido: false, erro: 'Username deve conter apenas letras, números e underscore' };
  }

  return { valido: true };
}

/**
 * Valida nome completo para registro
 * @param {string} nome - Nome a ser validado
 * @returns {object} - {valido: boolean, erro?: string}
 */
function validarNomeCompleto(nome) {
  if (!nome || typeof nome !== 'string') {
    return { valido: false, erro: 'Nome é obrigatório' };
  }

  const trimmed = nome.trim();

  if (trimmed.length < 2) {
    return { valido: false, erro: 'Nome deve ter pelo menos 2 caracteres' };
  }

  if (trimmed.length > 100) {
    return { valido: false, erro: 'Nome deve ter no máximo 100 caracteres' };
  }

  return { valido: true };
}

/**
 * Valida senha para registro
 * @param {string} senha - Senha a ser validada
 * @returns {object} - {valido: boolean, erro?: string}
 */
function validarSenha(senha) {
  if (!senha || typeof senha !== 'string') {
    return { valido: false, erro: 'Senha é obrigatória' };
  }

  if (senha.length < 6) {
    return { valido: false, erro: 'Senha deve ter pelo menos 6 caracteres' };
  }

  if (senha.length > 100) {
    return { valido: false, erro: 'Senha deve ter no máximo 100 caracteres' };
  }

  return { valido: true };
}

/**
 * Valida dados completos de registro
 * @param {object} dados - {username, nome, password}
 * @returns {object} - {valido: boolean, erros: string[]}
 */
function validarRegistro(dados) {
  const erros = [];

  const usernameResult = validarUsername(dados.username);
  if (!usernameResult.valido) erros.push(usernameResult.erro);

  const nomeResult = validarNomeCompleto(dados.nome);
  if (!nomeResult.valido) erros.push(nomeResult.erro);

  const senhaResult = validarSenha(dados.password);
  if (!senhaResult.valido) erros.push(senhaResult.erro);

  return {
    valido: erros.length === 0,
    erros
  };
}

// ============================================
// VALIDAÇÕES DE POUSADA
// ============================================

/**
 * Valida email
 * @param {string} email - Email a ser validado
 * @returns {boolean} - True se válido
 */
function validarEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email.trim()) && email.length <= 255;
}

/**
 * Valida telefone brasileiro
 * @param {string} telefone - Telefone a ser validado
 * @returns {boolean} - True se válido
 */
function validarTelefone(telefone) {
  if (!telefone || typeof telefone !== 'string') return false;
  // Remove caracteres não numéricos
  const numeros = telefone.replace(/[^\d]/g, '');
  // Aceita telefones com 10 ou 11 dígitos (com DDD)
  return numeros.length >= 10 && numeros.length <= 11;
}

/**
 * Valida número de quartos da pousada
 * @param {number} numQuartos - Número de quartos
 * @returns {boolean} - True se válido
 */
function validarNumQuartos(numQuartos) {
  const num = parseInt(numQuartos);
  return Number.isInteger(num) && num >= 1 && num <= 100;
}

/**
 * Valida dados completos de uma pousada
 * @param {object} pousada - Dados da pousada
 * @param {boolean} parcial - Se true, valida apenas campos presentes
 * @returns {object} - {valido: boolean, erros: string[]}
 */
function validarPousada(pousada, parcial = false) {
  const erros = [];

  // Nome da pousada
  if (!parcial || pousada.nome !== undefined) {
    if (!pousada.nome || pousada.nome.trim().length < 2) {
      erros.push('Nome da pousada deve ter pelo menos 2 caracteres');
    } else if (pousada.nome.length > 100) {
      erros.push('Nome da pousada deve ter no máximo 100 caracteres');
    }
  }

  // Número de quartos
  if (!parcial || pousada.num_quartos !== undefined) {
    if (!validarNumQuartos(pousada.num_quartos)) {
      erros.push('Número de quartos deve estar entre 1 e 100');
    }
  }

  // Endereço
  if (!parcial || pousada.endereco !== undefined) {
    if (!pousada.endereco || pousada.endereco.trim().length < 5) {
      erros.push('Endereço deve ter pelo menos 5 caracteres');
    } else if (pousada.endereco.length > 255) {
      erros.push('Endereço deve ter no máximo 255 caracteres');
    }
  }

  // Telefone
  if (!parcial || pousada.telefone !== undefined) {
    if (!validarTelefone(pousada.telefone)) {
      erros.push('Telefone inválido. Use formato com DDD (10 ou 11 dígitos)');
    }
  }

  // Email
  if (!parcial || pousada.email !== undefined) {
    if (!validarEmail(pousada.email)) {
      erros.push('Email inválido');
    }
  }

  // Campos opcionais com validação de tamanho
  if (pousada.cidade && pousada.cidade.length > 100) {
    erros.push('Cidade deve ter no máximo 100 caracteres');
  }

  if (pousada.estado && pousada.estado.length > 2) {
    erros.push('Estado deve ter no máximo 2 caracteres (sigla)');
  }

  if (pousada.cep) {
    const cepNumeros = pousada.cep.replace(/[^\d]/g, '');
    if (cepNumeros.length !== 8) {
      erros.push('CEP deve ter 8 dígitos');
    }
  }

  if (pousada.descricao && pousada.descricao.length > 1000) {
    erros.push('Descrição deve ter no máximo 1000 caracteres');
  }

  if (pousada.logo_url && pousada.logo_url.length > 500) {
    erros.push('URL do logo deve ter no máximo 500 caracteres');
  }

  return {
    valido: erros.length === 0,
    erros
  };
}

/**
 * Sanitiza dados de uma pousada
 * @param {object} pousada - Dados da pousada
 * @returns {object} - Dados sanitizados
 */
function sanitizarPousada(pousada) {
  const sanitizado = {};

  if (pousada.nome !== undefined) {
    sanitizado.nome = sanitizarString(pousada.nome);
  }

  if (pousada.num_quartos !== undefined) {
    sanitizado.num_quartos = parseInt(pousada.num_quartos);
  }

  if (pousada.endereco !== undefined) {
    sanitizado.endereco = sanitizarString(pousada.endereco);
  }

  if (pousada.cidade !== undefined) {
    sanitizado.cidade = sanitizarString(pousada.cidade);
  }

  if (pousada.estado !== undefined) {
    sanitizado.estado = pousada.estado ? pousada.estado.toUpperCase().substring(0, 2) : null;
  }

  if (pousada.cep !== undefined) {
    sanitizado.cep = pousada.cep ? pousada.cep.replace(/[^\d]/g, '').substring(0, 8) : null;
  }

  if (pousada.telefone !== undefined) {
    sanitizado.telefone = pousada.telefone ? pousada.telefone.replace(/[^\d]/g, '') : null;
  }

  if (pousada.email !== undefined) {
    sanitizado.email = pousada.email ? pousada.email.trim().toLowerCase() : null;
  }

  if (pousada.logo_url !== undefined) {
    sanitizado.logo_url = pousada.logo_url ? pousada.logo_url.trim() : null;
  }

  if (pousada.descricao !== undefined) {
    sanitizado.descricao = pousada.descricao ? sanitizarString(pousada.descricao).substring(0, 1000) : null;
  }

  if (pousada.configuracoes !== undefined) {
    sanitizado.configuracoes = pousada.configuracoes || {};
  }

  return sanitizado;
}

module.exports = {
  validarCPF,
  validarData,
  validarPeriodo,
  validarDataFuturaOuHoje,
  validarQuarto,
  validarStatus,
  validarValor,
  sanitizarString,
  sanitizarNome,
  validarReserva,
  sanitizarReserva,
  validarUsername,
  validarNomeCompleto,
  validarSenha,
  validarRegistro,
  // Validações de pousada
  validarEmail,
  validarTelefone,
  validarNumQuartos,
  validarPousada,
  sanitizarPousada
}; 
