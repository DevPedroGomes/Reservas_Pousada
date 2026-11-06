-- 031: Pix pago com a reserva já encerrada
--
-- O dinheiro entrou e a reserva não pôde voltar (quarto de outra reserva,
-- reserva excluída, estadia passada): o pagamento fica registrado e a cobrança
-- marcada para a pousada devolver ao hóspede.

ALTER TABLE cobrancas_pix
  ADD COLUMN IF NOT EXISTS estorno_pendente BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_cobrancas_estorno_pendente
  ON cobrancas_pix (pousada_id) WHERE estorno_pendente;
