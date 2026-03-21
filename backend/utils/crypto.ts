/**
 * CPF encryption/decryption for LGPD compliance
 * Uses AES-256-GCM for authenticated encryption
 * Uses SHA-256 for deterministic hashing (search by CPF)
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.CPF_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('CPF_ENCRYPTION_KEY nao configurada. Gere com: openssl rand -hex 32');
  }
  const keyBuffer = Buffer.from(key, 'hex');
  if (keyBuffer.length !== 32) {
    throw new Error('CPF_ENCRYPTION_KEY deve ter 32 bytes (64 caracteres hex)');
  }
  return keyBuffer;
}

/**
 * Normalize CPF to digits only
 */
function normalizeCpf(cpf: string): string {
  return cpf.replace(/[^\d]/g, '');
}

/**
 * Encrypt a CPF value
 * Returns: iv:authTag:ciphertext (all base64)
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
 * Decrypt an encrypted CPF value
 * Input: iv:authTag:ciphertext (all base64)
 */
export function decryptCpf(encrypted: string): string {
  const key = getEncryptionKey();
  const parts = encrypted.split(':');

  // If it looks like a plain CPF (only digits, 11 chars), return as-is
  if (parts.length === 1 && /^\d{11}$/.test(encrypted)) {
    return encrypted;
  }

  if (parts.length !== 3) {
    // Might be an unencrypted CPF with formatting — return as-is
    return encrypted;
  }

  const [ivB64, authTagB64, ciphertext] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Create a deterministic SHA-256 hash of a CPF (for search/lookup)
 */
export function hashCpf(cpf: string): string {
  const normalized = normalizeCpf(cpf);
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Check if a CPF value is already encrypted (contains colons for iv:tag:ciphertext format)
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(':');
  return parts.length === 3;
}
