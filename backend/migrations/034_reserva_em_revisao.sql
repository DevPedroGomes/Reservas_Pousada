-- 034: reserva confirmada que passou da saída sem check-in
--
-- O job a finalizava, e ela virava estadia e receita sem o hóspede ter vindo.
-- Agora fica em revisão: a recepção decide entre check-in atrasado, não
-- comparecimento ou cancelamento.

ALTER TABLE reservas
  ADD COLUMN IF NOT EXISTS revisao_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revisao_motivo TEXT;

CREATE INDEX IF NOT EXISTS idx_reservas_em_revisao
  ON reservas (pousada_id) WHERE revisao_em IS NOT NULL AND deleted_at IS NULL;
