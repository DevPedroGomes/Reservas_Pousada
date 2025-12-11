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
 * @returns {boolean} - True se válido
 */
function validarQuarto(quarto) {
  const num = parseInt(quarto);
  return Number.isInteger(num) && num >= 1 && num <= 25;
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
  validarRegistro
}; 
