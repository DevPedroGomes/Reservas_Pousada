-- 018: hóspede como cadastro
--
-- O hóspede era só nome + CPF digitados em cada reserva: sem telefone nem
-- e-mail (a pousada vive de WhatsApp), sem como hospedar estrangeiro (CPF
-- obrigatório), e o mesmo cliente virava N cadastros soltos, sem histórico.
--
-- `hospedes` guarda a pessoa, por pousada. O documento (CPF, passaporte...)
-- vai cifrado, com hash para busca e para não duplicar o cadastro. A reserva
-- aponta para o hóspede e guarda uma cópia do nome (listagem, agenda e busca
-- continuam sem join), além de nº de hóspedes e canal de origem.

CREATE TABLE IF NOT EXISTS hospedes (
  id               SERIAL PRIMARY KEY,
  pousada_id       INTEGER NOT NULL REFERENCES pousadas(id),
  nome             TEXT NOT NULL,
  tipo_documento   TEXT NOT NULL DEFAULT 'cpf' CHECK (tipo_documento IN ('cpf', 'passaporte', 'outro')),
  documento        TEXT,
  documento_hash   TEXT,
  nacionalidade    TEXT,
  telefone         TEXT,
  email            TEXT,
  data_nascimento  DATE,
  observacoes      TEXT,
  anonimizado_em   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Um documento = um cadastro, por pousada.
CREATE UNIQUE INDEX IF NOT EXISTS uq_hospede_documento
  ON hospedes (pousada_id, documento_hash) WHERE documento_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hospedes_nome ON hospedes (pousada_id, lower(nome));
CREATE INDEX IF NOT EXISTS idx_hospedes_telefone ON hospedes (pousada_id, telefone) WHERE telefone IS NOT NULL;

ALTER TABLE reservas
  ADD COLUMN IF NOT EXISTS hospede_id INTEGER REFERENCES hospedes(id),
  ADD COLUMN IF NOT EXISTS adultos    INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS criancas   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS canal      TEXT NOT NULL DEFAULT 'direto';

ALTER TABLE reservas DROP CONSTRAINT IF EXISTS reservas_hospedes_validos;
ALTER TABLE reservas ADD CONSTRAINT reservas_hospedes_validos
  CHECK (adultos BETWEEN 1 AND 50 AND criancas BETWEEN 0 AND 50);

ALTER TABLE reservas DROP CONSTRAINT IF EXISTS reservas_canal_valido;
ALTER TABLE reservas ADD CONSTRAINT reservas_canal_valido
  CHECK (canal IN ('direto', 'whatsapp', 'telefone', 'instagram', 'site', 'booking', 'airbnb', 'expedia', 'decolar', 'outro'));

CREATE INDEX IF NOT EXISTS idx_reservas_hospede ON reservas (hospede_id) WHERE hospede_id IS NOT NULL;

-- O documento passa a morar no hóspede; a coluna da reserva fica só para o
-- legado que não pôde ser migrado (sem hash) e para o marcador de anonimizado.
ALTER TABLE reservas ALTER COLUMN cpf DROP NOT NULL;

-- Reservas existentes: um hóspede por CPF (hash) e pousada, com o nome da
-- reserva mais recente. O ciphertext é copiado como está (mesma chave).
INSERT INTO hospedes (pousada_id, nome, tipo_documento, documento, documento_hash, created_at)
SELECT DISTINCT ON (r.pousada_id, r.cpf_hash)
       r.pousada_id, r.nome, 'cpf', r.cpf, r.cpf_hash, COALESCE(r.created_at, now())
  FROM reservas r
 WHERE r.cpf_hash IS NOT NULL
   AND r.cpf IS NOT NULL
   AND r.cpf <> 'anonimizado'
 ORDER BY r.pousada_id, r.cpf_hash, r.created_at DESC NULLS LAST, r.id DESC
ON CONFLICT DO NOTHING;

UPDATE reservas r
   SET hospede_id = h.id, cpf = NULL, cpf_hash = NULL
  FROM hospedes h
 WHERE r.hospede_id IS NULL
   AND r.cpf_hash IS NOT NULL
   AND h.pousada_id = r.pousada_id
   AND h.documento_hash = r.cpf_hash;
