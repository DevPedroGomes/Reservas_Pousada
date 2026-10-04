-- 024: pré-check-in online (campos da FNRH)
--
-- O hóspede preenche a ficha (dele e dos acompanhantes) por um link secreto
-- antes de chegar; a recepção não digita nada no balcão. A ficha tem dado
-- pessoal sensível (documento, nascimento, endereço): vai inteira cifrada.
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS precheckin_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reservas_precheckin_token ON reservas (precheckin_token) WHERE precheckin_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS precheckins (
  reserva_id      INTEGER PRIMARY KEY REFERENCES reservas(id) ON DELETE CASCADE,
  pousada_id      INTEGER NOT NULL REFERENCES pousadas(id),
  dados_cifrados  TEXT NOT NULL,
  enviado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip              TEXT
);
