-- Add cpf_hash column for searchable CPF lookups (LGPD: CPF will be encrypted)
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS cpf_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_reservas_cpf_hash ON reservas(cpf_hash);
