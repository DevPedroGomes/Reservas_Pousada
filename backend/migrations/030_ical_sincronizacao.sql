-- 030: sincronização de calendário iCal mais cautelosa
--
-- ical_ausencias: em quantas sincronizações seguidas o evento não apareceu no
-- feed. Um feed ruim uma vez não pode cancelar reserva e revender a data.

ALTER TABLE reservas
  ADD COLUMN IF NOT EXISTS ical_ausencias INTEGER NOT NULL DEFAULT 0;
