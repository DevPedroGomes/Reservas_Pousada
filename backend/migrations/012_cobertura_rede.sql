-- 012: plano Rede — uma assinatura cobre várias pousadas do mesmo dono
--
-- PROBLEMA
-- A assinatura era por pousada. Quem assinava o Rede ("até 3 propriedades")
-- criava a segunda pousada e ela nascia num trial próprio, que vencia e
-- bloqueava — o plano mais caro não entregava o que vendia. E, no sentido
-- oposto, qualquer conta criava pousadas ilimitadas, cada uma com 14 dias
-- de trial novo.
--
-- SOLUÇÃO
-- A pousada extra aponta para a pousada PAGADORA. O acesso e os limites da
-- extra são avaliados pela assinatura da pagadora. Se a cobertura acabar
-- (cancelamento do Rede), a extra cai para a própria linha, que não tem
-- trial — fica bloqueada até ter assinatura própria ou voltar a ser coberta.

ALTER TABLE assinaturas
  ADD COLUMN IF NOT EXISTS coberta_por_pousada_id INTEGER REFERENCES pousadas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assinaturas_coberta_por
  ON assinaturas (coberta_por_pousada_id)
  WHERE coberta_por_pousada_id IS NOT NULL;

-- Uma pousada não cobre a si mesma.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assinaturas_cobertura_valida' AND conrelid = 'assinaturas'::regclass
  ) THEN
    ALTER TABLE assinaturas ADD CONSTRAINT assinaturas_cobertura_valida
      CHECK (coberta_por_pousada_id IS NULL OR coberta_por_pousada_id <> pousada_id);
  END IF;
END $$;
