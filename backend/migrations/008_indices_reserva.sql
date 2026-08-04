-- 008: indice que as consultas de reserva realmente usam
--
-- Os indices existentes em `status` (3 valores) e `pago` (2 valores) tem
-- cardinalidade baixa demais — o planner os ignora e faz seq scan. Toda query
-- de reserva filtra por (pousada_id, deleted_at IS NULL) e ordena/filtra por
-- data_entrada; e esse o indice que falta.
CREATE INDEX IF NOT EXISTS idx_reservas_pousada_periodo
  ON reservas (pousada_id, data_entrada, data_saida)
  WHERE deleted_at IS NULL;

-- Auditoria e sempre lida por entidade + mais recente primeiro.
CREATE INDEX IF NOT EXISTS idx_auditoria_entity_created
  ON auditoria (entity, entity_id, created_at DESC);
