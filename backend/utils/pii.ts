/**
 * Redação de dado pessoal antes de persistir em log/auditoria.
 *
 * PROBLEMA
 * `ReservaModel.criar()` devolve a reserva JÁ DECIFRADA, e as rotas passavam
 * esse objeto inteiro para a auditoria como `{ antes }` / `{ depois }`. O CPF
 * acabava em texto puro num jsonb — anulando a cifra AES da coluna ao lado e
 * vazando em qualquer backup ou export da tabela `auditoria`.
 *
 * A redação vive aqui, num módulo sem dependência de banco, e é aplicada no
 * ponto de estrangulamento (`AuditoriaModel.log`) — não em cada rota. Assim uma
 * rota nova não consegue reintroduzir o vazamento por esquecimento.
 */

const CAMPOS_PII = new Set(['cpf', 'cpfhash', 'cpf_hash']);
const REDIGIDO = '[redigido]';
const PROFUNDIDADE_MAX = 8;

export function redigirPII(valor: unknown, profundidade = 0): unknown {
  if (profundidade > PROFUNDIDADE_MAX || valor === null || typeof valor !== 'object') {
    return valor;
  }
  if (valor instanceof Date) {
    return valor;
  }
  if (Array.isArray(valor)) {
    return valor.map((v) => redigirPII(v, profundidade + 1));
  }

  const saida: Record<string, unknown> = {};
  for (const [chave, v] of Object.entries(valor as Record<string, unknown>)) {
    saida[chave] = CAMPOS_PII.has(chave.toLowerCase()) ? REDIGIDO : redigirPII(v, profundidade + 1);
  }
  return saida;
}
