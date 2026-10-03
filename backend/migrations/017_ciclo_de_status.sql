-- 017: ciclo de status da reserva
--
-- Havia só "ativa / finalizada / cancelada". A recepção não tinha como
-- separar a reserva que espera o sinal (e pode cair) da confirmada, nem
-- registrar check-in, check-out ou não comparecimento.
--
--   pre_reserva -> confirmada -> hospedada -> finalizada
--        \             \-> no_show
--         \-> cancelada (também a partir de confirmada)
--
-- pre_reserva tem prazo (expira_em): vencido sem confirmação, um job cancela
-- e libera o quarto.

UPDATE reservas SET status = 'confirmada' WHERE status = 'ativa';

ALTER TABLE reservas ALTER COLUMN status SET DEFAULT 'confirmada';

ALTER TABLE reservas ADD COLUMN IF NOT EXISTS expira_em TIMESTAMPTZ;
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS check_in_em TIMESTAMPTZ;
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS check_out_em TIMESTAMPTZ;
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS cancelada_em TIMESTAMPTZ;
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reservas_status_valido' AND conrelid = 'reservas'::regclass
  ) THEN
    ALTER TABLE reservas ADD CONSTRAINT reservas_status_valido
      CHECK (status IN ('pre_reserva', 'confirmada', 'hospedada', 'finalizada', 'cancelada', 'no_show'));
  END IF;
END $$;

-- A garantia anti-overbooking passa a valer para os três status que seguram
-- o quarto. Recriada (não alterada): EXCLUDE não aceita ALTER do predicado.
ALTER TABLE reservas DROP CONSTRAINT IF EXISTS reservas_sem_overbooking;
ALTER TABLE reservas
  ADD CONSTRAINT reservas_sem_overbooking
  EXCLUDE USING gist (
    pousada_id WITH =,
    quarto     WITH =,
    daterange(data_entrada, data_saida, '[)') WITH &&
  )
  WHERE (status IN ('pre_reserva', 'confirmada', 'hospedada') AND deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_reservas_pre_reserva_expira
  ON reservas (expira_em) WHERE status = 'pre_reserva' AND deleted_at IS NULL;
