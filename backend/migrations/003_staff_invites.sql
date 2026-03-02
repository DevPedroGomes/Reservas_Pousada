-- Migration 003: Staff Invites
-- Tabela para convites de equipe

CREATE TABLE IF NOT EXISTS staff_invites (
  id SERIAL PRIMARY KEY,
  pousada_id INTEGER NOT NULL REFERENCES pousadas(id),
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'recepcao',
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  invited_by TEXT NOT NULL REFERENCES "user"(id),
  accepted_by TEXT REFERENCES "user"(id),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_invites_token ON staff_invites(token);
CREATE INDEX IF NOT EXISTS idx_staff_invites_pousada ON staff_invites(pousada_id);
CREATE INDEX IF NOT EXISTS idx_staff_invites_email ON staff_invites(email);
