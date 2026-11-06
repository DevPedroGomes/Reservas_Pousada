-- 030: sincronização de calendário iCal mais cautelosa
--
-- ical_ausencias: em quantas sincronizações seguidas o evento não apareceu no
-- feed. Um feed ruim uma vez não pode cancelar reserva e revender a data.

ALTER TABLE reservas
  ADD COLUMN IF NOT EXISTS ical_ausencias INTEGER NOT NULL DEFAULT 0;

-- ultima_tentativa: gravada antes de buscar o feed. Quem trava ou derruba a
-- rodada vai para o fim da fila, em vez de voltar à frente na rodada seguinte.
ALTER TABLE ical_importacoes
  ADD COLUMN IF NOT EXISTS ultima_tentativa TIMESTAMPTZ;
