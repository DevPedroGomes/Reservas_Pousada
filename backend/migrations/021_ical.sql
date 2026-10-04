-- 021: calendário iCal por quarto (Booking, Airbnb, Google Agenda...)
--
-- Sem isso, quem vende também em OTA bloqueia datas à mão em três lugares e
-- vive o overbooking que o EXCLUDE do banco não tem como ver.
--
-- Exportar: cada quarto tem um link secreto (.ics) que a OTA lê.
-- Importar: o calendário da OTA vira reservas do quarto, atualizadas por um
-- job; assim a constraint anti-overbooking passa a valer também para elas.

ALTER TABLE quartos ADD COLUMN IF NOT EXISTS ical_token TEXT;
UPDATE quartos
   SET ical_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
 WHERE ical_token IS NULL;
ALTER TABLE quartos
  ALTER COLUMN ical_token SET DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  ALTER COLUMN ical_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_quartos_ical_token ON quartos (ical_token);

CREATE TABLE IF NOT EXISTS ical_importacoes (
  id                    SERIAL PRIMARY KEY,
  pousada_id            INTEGER NOT NULL REFERENCES pousadas(id) ON DELETE CASCADE,
  quarto_numero         INTEGER NOT NULL,
  nome                  TEXT NOT NULL,
  canal                 TEXT NOT NULL DEFAULT 'outro'
                        CHECK (canal IN ('direto', 'whatsapp', 'telefone', 'instagram', 'site', 'booking', 'airbnb', 'expedia', 'decolar', 'outro')),
  url                   TEXT NOT NULL,
  ativo                 BOOLEAN NOT NULL DEFAULT true,
  ultima_sincronizacao  TIMESTAMPTZ,
  ultimo_erro           TEXT,
  eventos               INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ical_importacoes_quarto_fk FOREIGN KEY (pousada_id, quarto_numero)
    REFERENCES quartos (pousada_id, numero) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT uq_ical_importacao UNIQUE (pousada_id, quarto_numero, url)
);

ALTER TABLE reservas
  ADD COLUMN IF NOT EXISTS ical_importacao_id INTEGER REFERENCES ical_importacoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ical_uid TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reserva_ical
  ON reservas (ical_importacao_id, ical_uid) WHERE ical_importacao_id IS NOT NULL AND deleted_at IS NULL;
