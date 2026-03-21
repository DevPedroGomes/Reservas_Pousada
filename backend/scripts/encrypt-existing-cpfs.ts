/**
 * One-time migration script: encrypt existing plaintext CPFs
 *
 * Run after deploying migration 007_cpf_encryption.sql
 * and before deploying the new backend code.
 *
 * Usage: npx tsx scripts/encrypt-existing-cpfs.ts
 *
 * Requires: CPF_ENCRYPTION_KEY and DATABASE_URL in environment
 */

import { createCipheriv, createHash, randomBytes } from 'crypto';
import pg from 'pg';

const { Pool } = pg;

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const key = process.env.CPF_ENCRYPTION_KEY;
  if (!key) {
    console.error('CPF_ENCRYPTION_KEY nao configurada');
    process.exit(1);
  }
  return Buffer.from(key, 'hex');
}

function encryptCpf(cpf: string, key: Buffer): string {
  const normalized = cpf.replace(/[^\d]/g, '');
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  let encrypted = cipher.update(normalized, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

function hashCpf(cpf: string): string {
  const normalized = cpf.replace(/[^\d]/g, '');
  return createHash('sha256').update(normalized).digest('hex');
}

function isAlreadyEncrypted(cpf: string): boolean {
  return cpf.split(':').length === 3;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const key = getKey();

    // Fetch all reservations with plaintext CPFs
    const result = await pool.query('SELECT id, cpf FROM reservas WHERE cpf_hash IS NULL OR cpf_hash = \'\'');
    console.log(`Found ${result.rows.length} reservations to encrypt`);

    let encrypted = 0;
    let skipped = 0;

    for (const row of result.rows) {
      if (isAlreadyEncrypted(row.cpf)) {
        // Already encrypted, just compute hash
        skipped++;
        continue;
      }

      const encryptedCpf = encryptCpf(row.cpf, key);
      const cpfHash = hashCpf(row.cpf);

      await pool.query(
        'UPDATE reservas SET cpf = $1, cpf_hash = $2 WHERE id = $3',
        [encryptedCpf, cpfHash, row.id]
      );
      encrypted++;
    }

    console.log(`Done: ${encrypted} encrypted, ${skipped} skipped (already encrypted)`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
