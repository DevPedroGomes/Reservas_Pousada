-- 032: cadastro de hóspede a conferir
--
-- Pedido público com documento de um cadastro, mas com outro contato, não mexe
-- nesse cadastro: nasce um separado, sem o documento, e a recepção confere.

ALTER TABLE hospedes
  ADD COLUMN IF NOT EXISTS revisao_motivo TEXT,
  ADD COLUMN IF NOT EXISTS revisao_hospede_id INTEGER REFERENCES hospedes(id) ON DELETE SET NULL;
