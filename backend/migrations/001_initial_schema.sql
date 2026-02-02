-- ==========================================
-- Migration 001: Initial Schema
-- Sistema de Reservas para Pousada
-- PostgreSQL + Better Auth + Drizzle ORM
-- ==========================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- Better Auth Tables
-- ==========================================

-- Users table (Better Auth core)
CREATE TABLE IF NOT EXISTS "user" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    email_verified BOOLEAN NOT NULL DEFAULT false,
    image TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    -- Custom fields for our app
    role TEXT DEFAULT 'recepcao',
    pousada_id INTEGER,
    is_owner BOOLEAN DEFAULT false
);

-- Sessions table (Better Auth core)
CREATE TABLE IF NOT EXISTS session (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    ip_address TEXT,
    user_agent TEXT,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);

-- Accounts table (Better Auth - OAuth providers)
CREATE TABLE IF NOT EXISTS account (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    account_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    access_token TEXT,
    refresh_token TEXT,
    id_token TEXT,
    access_token_expires_at TIMESTAMP WITH TIME ZONE,
    refresh_token_expires_at TIMESTAMP WITH TIME ZONE,
    scope TEXT,
    password TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Verification table (Better Auth - email verification, password reset)
CREATE TABLE IF NOT EXISTS verification (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- Application Tables
-- ==========================================

-- Pousadas table
CREATE TABLE IF NOT EXISTS pousadas (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    slug TEXT UNIQUE,
    num_quartos INTEGER NOT NULL DEFAULT 10,
    endereco TEXT,
    cidade TEXT,
    estado TEXT,
    cep TEXT,
    telefone TEXT,
    email TEXT,
    logo_url TEXT,
    descricao TEXT,
    configuracoes JSONB DEFAULT '{}',
    ativa BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add foreign key from user to pousadas
ALTER TABLE "user"
    ADD CONSTRAINT fk_user_pousada
    FOREIGN KEY (pousada_id)
    REFERENCES pousadas(id);

-- Reservas table
CREATE TABLE IF NOT EXISTS reservas (
    id SERIAL PRIMARY KEY,
    pousada_id INTEGER NOT NULL REFERENCES pousadas(id),
    nome TEXT NOT NULL,
    cpf TEXT NOT NULL,
    quarto INTEGER NOT NULL,
    data_entrada DATE NOT NULL,
    data_saida DATE NOT NULL,
    status TEXT DEFAULT 'ativa',
    valor NUMERIC,
    pago BOOLEAN DEFAULT false,
    observacoes TEXT,
    criado_por TEXT REFERENCES "user"(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Auditoria table
CREATE TABLE IF NOT EXISTS auditoria (
    id SERIAL PRIMARY KEY,
    user_id TEXT REFERENCES "user"(id),
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id INTEGER,
    details TEXT, -- JSON stringified
    ip TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- Indexes
-- ==========================================

-- User indexes
CREATE INDEX IF NOT EXISTS idx_user_email ON "user"(email);
CREATE INDEX IF NOT EXISTS idx_user_pousada ON "user"(pousada_id);

-- Session indexes
CREATE INDEX IF NOT EXISTS idx_session_user ON session(user_id);
CREATE INDEX IF NOT EXISTS idx_session_token ON session(token);

-- Account indexes
CREATE INDEX IF NOT EXISTS idx_account_user ON account(user_id);
CREATE INDEX IF NOT EXISTS idx_account_provider ON account(provider_id, account_id);

-- Pousadas indexes
CREATE INDEX IF NOT EXISTS idx_pousadas_slug ON pousadas(slug);

-- Reservas indexes
CREATE INDEX IF NOT EXISTS idx_reservas_status ON reservas(status);
CREATE INDEX IF NOT EXISTS idx_reservas_pago ON reservas(pago);
CREATE INDEX IF NOT EXISTS idx_reservas_datas ON reservas(data_entrada, data_saida);
CREATE INDEX IF NOT EXISTS idx_reservas_pousada ON reservas(pousada_id);

-- Auditoria indexes
CREATE INDEX IF NOT EXISTS idx_auditoria_user ON auditoria(user_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_entity ON auditoria(entity, entity_id);

-- ==========================================
-- Functions
-- ==========================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_user_updated_at
    BEFORE UPDATE ON "user"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_session_updated_at
    BEFORE UPDATE ON session
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_account_updated_at
    BEFORE UPDATE ON account
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_verification_updated_at
    BEFORE UPDATE ON verification
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pousadas_updated_at
    BEFORE UPDATE ON pousadas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reservas_updated_at
    BEFORE UPDATE ON reservas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- Comments
-- ==========================================

COMMENT ON TABLE "user" IS 'Usuarios do sistema - gerenciado pelo Better Auth';
COMMENT ON TABLE session IS 'Sessoes ativas - gerenciado pelo Better Auth';
COMMENT ON TABLE account IS 'Contas OAuth vinculadas - gerenciado pelo Better Auth';
COMMENT ON TABLE verification IS 'Tokens de verificacao - gerenciado pelo Better Auth';
COMMENT ON TABLE pousadas IS 'Cadastro de pousadas';
COMMENT ON TABLE reservas IS 'Reservas de hospedes';
COMMENT ON TABLE auditoria IS 'Log de auditoria de acoes';
