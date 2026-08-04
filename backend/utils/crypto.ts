/**
 * Proteção de CPF (LGPD).
 *
 * - Confidencialidade: AES-256-GCM (cifra autenticada) na coluna `cpf`.
 * - Busca por igualdade: HMAC-SHA-256 na coluna `cpf_hash`.
 *
 * Por que HMAC e não SHA-256 puro: existem ~10^9 CPFs válidos. Um SHA-256 sem
 * chave é varrido por força bruta em ~24 min num único core (medido nesta VPS:
 * 625k hashes/s), então um `cpf_hash` sem chave devolve o CPF em claro para
 * quem tiver o dump — anulando a cifra da coluna ao lado. Com HMAC, quem tem só
 * o banco não consegue nada sem a chave, que vive fora dele.
 *
 * A chave do HMAC é derivada de CPF_ENCRYPTION_KEY com separação de domínio,
 * para não exigir um segundo segredo em produção.
 *
 * ATENÇÃO: trocar CPF_ENCRYPTION_KEY invalida (a) a leitura dos CPFs cifrados e
 * (b) todos os `cpf_hash` gravados. Rotação exige re-cifrar e re-hashear a base.
 */

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const HASH_DOMAIN = 'cpf-hash:v1:';

let chaveCache: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (chaveCache) return chaveCache;

  const key = process.env.CPF_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('CPF_ENCRYPTION_KEY nao configurada. Gere com: openssl rand -hex 32');
  }
  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error('CPF_ENCRYPTION_KEY deve ter exatamente 64 caracteres hexadecimais (32 bytes)');
  }

  chaveCache = Buffer.from(key, 'hex');
  return chaveCache;
}

/**
 * Valida a configuração de cifra no boot.
 *
 * Deliberadamente chamada antes de o servidor aceitar tráfego: sem isso, uma
 * chave ausente fazia o sistema subir normalmente e gravar CPF em TEXTO PURO,
 * em silêncio, porque o caminho de erro era engolido por um catch.
 */
export function assertCpfCryptoConfigurada(): void {
  const chave = getEncryptionKey();
  // Round-trip real: pega chave de tamanho certo mas inválida para o algoritmo.
  const teste = '12345678909';
  if (decryptCpf(encryptCpf(teste)) !== teste) {
    throw new Error('Falha no round-trip de cifra de CPF — configuracao invalida');
  }
  if (chave.length !== 32) {
    throw new Error('CPF_ENCRYPTION_KEY deve ter 32 bytes');
  }
}

function normalizeCpf(cpf: string): string {
  return cpf.replace(/[^\d]/g, '');
}

/**
 * Cifra um CPF. Retorna `iv:authTag:ciphertext` (tudo em base64).
 * Lança se a chave não estiver configurada — nunca devolve texto puro.
 */
export function encryptCpf(cpf: string): string {
  const key = getEncryptionKey();
  const normalized = normalizeCpf(cpf);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(normalized, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decifra. Lança se o valor não estiver no formato esperado ou se a autenticação
 * falhar — antes isso devolvia o próprio ciphertext como se fosse o CPF, e a
 * recepção via base64 na tela sem nenhum erro em lugar nenhum.
 */
export function decryptCpf(encrypted: string): string {
  const key = getEncryptionKey();
  const parts = encrypted.split(':');

  if (parts.length !== 3) {
    throw new Error('Valor de CPF nao esta no formato cifrado esperado (iv:authTag:ciphertext)');
  }

  const [ivB64, authTagB64, ciphertext] = parts;
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivB64, 'base64'),
    { authTagLength: AUTH_TAG_LENGTH },
  );
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));

  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Hash determinístico com chave, para busca por CPF exato sem decifrar a coluna.
 */
export function hashCpf(cpf: string): string {
  return createHmac('sha256', getEncryptionKey())
    .update(HASH_DOMAIN + normalizeCpf(cpf))
    .digest('hex');
}

/**
 * O valor já está no formato cifrado?
 */
export function isEncrypted(value: string): boolean {
  return value.split(':').length === 3;
}
