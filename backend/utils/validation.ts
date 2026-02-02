/**
 * Validation and sanitization module
 */

/**
 * Validates Brazilian CPF
 */
export function validarCPF(cpf: string | null | undefined): boolean {
  if (!cpf) return false;

  // Remove non-numeric characters
  cpf = cpf.replace(/[^\d]/g, '');

  // Check if has 11 digits
  if (cpf.length !== 11) return false;

  // Check if all digits are the same
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  // Validate first check digit
  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += parseInt(cpf.charAt(i)) * (10 - i);
  }
  let resto = 11 - (soma % 11);
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf.charAt(9))) return false;

  // Validate second check digit
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
 * Validates date in YYYY-MM-DD format
 */
export function validarData(data: string | null | undefined): boolean {
  if (!data) return false;

  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(data)) return false;

  const date = new Date(data);
  const timestamp = date.getTime();

  if (typeof timestamp !== 'number' || Number.isNaN(timestamp)) return false;

  return date.toISOString().startsWith(data);
}

/**
 * Validates if check-in date is before check-out date
 */
export function validarPeriodo(dataEntrada: string, dataSaida: string): boolean {
  if (!validarData(dataEntrada) || !validarData(dataSaida)) return false;

  const entrada = new Date(dataEntrada);
  const saida = new Date(dataSaida);

  return entrada < saida;
}

/**
 * Validates if date is not in the past
 */
export function validarDataFuturaOuHoje(data: string): boolean {
  if (!validarData(data)) return false;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dataVerificada = new Date(data);
  return dataVerificada >= hoje;
}

/**
 * Validates room number
 */
export function validarQuarto(quarto: number | string, maxQuartos: number = 100): boolean {
  const num = parseInt(String(quarto));
  return Number.isInteger(num) && num >= 1 && num <= maxQuartos;
}

/**
 * Validates reservation status
 */
export function validarStatus(status: string): boolean {
  const statusValidos = ['ativa', 'finalizada', 'cancelada'];
  return statusValidos.includes(status);
}

/**
 * Validates monetary value
 */
export function validarValor(valor: number | string | null | undefined): boolean {
  if (valor === null || valor === undefined) return true;
  const num = parseFloat(String(valor));
  return !isNaN(num) && num >= 0 && num <= 999999.99;
}

/**
 * Sanitizes string removing dangerous characters
 */
export function sanitizarString(str: string | null | undefined): string {
  if (!str || typeof str !== 'string') return '';

  return str
    .trim()
    .replace(/[<>"'&]/g, '') // Remove dangerous HTML characters
    .substring(0, 255); // Limit size
}

/**
 * Sanitizes name (allows only letters, spaces, and accents)
 */
export function sanitizarNome(nome: string | null | undefined): string {
  if (!nome || typeof nome !== 'string') return '';

  return nome
    .trim()
    .replace(/[^a-zA-ZÀ-ÿ\s]/g, '') // Only letters and spaces
    .replace(/\s+/g, ' ') // Remove duplicate spaces
    .substring(0, 100);
}

interface ValidacaoResult {
  valido: boolean;
  erros: string[];
}

interface ReservaData {
  nome?: string;
  cpf?: string;
  quarto?: number | string;
  data_entrada?: string;
  data_saida?: string;
  status?: string;
  valor?: number | string | null;
  pago?: boolean;
  observacoes?: string;
}

/**
 * Validates complete reservation data
 */
export function validarReserva(reserva: ReservaData): ValidacaoResult {
  const erros: string[] = [];

  // Validate name
  if (!reserva.nome || reserva.nome.trim().length < 2) {
    erros.push('Nome deve ter pelo menos 2 caracteres');
  }

  // Validate CPF
  if (!validarCPF(reserva.cpf)) {
    erros.push('CPF inválido');
  }

  // Validate room
  if (!validarQuarto(reserva.quarto!)) {
    erros.push('Número do quarto deve estar entre 1 e 100');
  }

  // Validate dates
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

  // Validate status
  if (reserva.status && !validarStatus(reserva.status)) {
    erros.push('Status inválido. Use: ativa, finalizada ou cancelada');
  }

  // Validate value
  if (reserva.valor !== undefined && !validarValor(reserva.valor)) {
    erros.push('Valor inválido');
  }

  return {
    valido: erros.length === 0,
    erros
  };
}

interface SanitizedReserva {
  nome: string;
  cpf: string;
  quarto: number;
  data_entrada: string;
  data_saida: string;
  status?: string;
  valor: string | null;
  pago: boolean;
  observacoes: string;
}

/**
 * Sanitizes reservation data
 */
export function sanitizarReserva(reserva: ReservaData): SanitizedReserva {
  return {
    nome: sanitizarNome(reserva.nome),
    cpf: reserva.cpf ? reserva.cpf.replace(/[^\d]/g, '') : '',
    quarto: parseInt(String(reserva.quarto)),
    data_entrada: reserva.data_entrada || '',
    data_saida: reserva.data_saida || '',
    status: reserva.status,
    valor: reserva.valor ? String(parseFloat(String(reserva.valor))) : null,
    pago: Boolean(reserva.pago),
    observacoes: sanitizarString(reserva.observacoes || '')
  };
}

/**
 * Validates email
 */
export function validarEmail(email: string | null | undefined): boolean {
  if (!email || typeof email !== 'string') return false;
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email.trim()) && email.length <= 255;
}

/**
 * Validates Brazilian phone number
 */
export function validarTelefone(telefone: string | null | undefined): boolean {
  if (!telefone || typeof telefone !== 'string') return false;
  const numeros = telefone.replace(/[^\d]/g, '');
  return numeros.length >= 10 && numeros.length <= 11;
}

/**
 * Validates number of rooms
 */
export function validarNumQuartos(numQuartos: number | string): boolean {
  const num = parseInt(String(numQuartos));
  return Number.isInteger(num) && num >= 1 && num <= 100;
}

interface PousadaData {
  nome?: string;
  num_quartos?: number | string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  telefone?: string;
  email?: string;
  logo_url?: string;
  descricao?: string;
  configuracoes?: Record<string, unknown>;
}

/**
 * Validates complete pousada data
 */
export function validarPousada(pousada: PousadaData, parcial: boolean = false): ValidacaoResult {
  const erros: string[] = [];

  // Pousada name
  if (!parcial || pousada.nome !== undefined) {
    if (!pousada.nome || pousada.nome.trim().length < 2) {
      erros.push('Nome da pousada deve ter pelo menos 2 caracteres');
    } else if (pousada.nome.length > 100) {
      erros.push('Nome da pousada deve ter no máximo 100 caracteres');
    }
  }

  // Number of rooms
  if (!parcial || pousada.num_quartos !== undefined) {
    if (!validarNumQuartos(pousada.num_quartos!)) {
      erros.push('Número de quartos deve estar entre 1 e 100');
    }
  }

  // Address
  if (!parcial || pousada.endereco !== undefined) {
    if (!pousada.endereco || pousada.endereco.trim().length < 5) {
      erros.push('Endereço deve ter pelo menos 5 caracteres');
    } else if (pousada.endereco.length > 255) {
      erros.push('Endereço deve ter no máximo 255 caracteres');
    }
  }

  // Phone
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

  // Optional fields with size validation
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
 * Sanitizes pousada data
 */
export function sanitizarPousada(pousada: PousadaData): Partial<PousadaData> {
  const sanitizado: Partial<PousadaData> = {};

  if (pousada.nome !== undefined) {
    sanitizado.nome = sanitizarString(pousada.nome);
  }

  if (pousada.num_quartos !== undefined) {
    sanitizado.num_quartos = parseInt(String(pousada.num_quartos));
  }

  if (pousada.endereco !== undefined) {
    sanitizado.endereco = sanitizarString(pousada.endereco);
  }

  if (pousada.cidade !== undefined) {
    sanitizado.cidade = sanitizarString(pousada.cidade);
  }

  if (pousada.estado !== undefined) {
    sanitizado.estado = pousada.estado ? pousada.estado.toUpperCase().substring(0, 2) : undefined;
  }

  if (pousada.cep !== undefined) {
    sanitizado.cep = pousada.cep ? pousada.cep.replace(/[^\d]/g, '').substring(0, 8) : undefined;
  }

  if (pousada.telefone !== undefined) {
    sanitizado.telefone = pousada.telefone ? pousada.telefone.replace(/[^\d]/g, '') : undefined;
  }

  if (pousada.email !== undefined) {
    sanitizado.email = pousada.email ? pousada.email.trim().toLowerCase() : undefined;
  }

  if (pousada.logo_url !== undefined) {
    sanitizado.logo_url = pousada.logo_url ? pousada.logo_url.trim() : undefined;
  }

  if (pousada.descricao !== undefined) {
    sanitizado.descricao = pousada.descricao ? sanitizarString(pousada.descricao).substring(0, 1000) : undefined;
  }

  if (pousada.configuracoes !== undefined) {
    sanitizado.configuracoes = pousada.configuracoes || {};
  }

  return sanitizado;
}
