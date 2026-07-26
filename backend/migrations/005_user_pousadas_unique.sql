-- Add unique constraint on user_pousadas to prevent duplicate memberships
--
-- Idempotente de proposito: `ADD CONSTRAINT` puro estoura se a constraint ja
-- existir, e o runner de migrations precisa poder rodar sobre um banco onde
-- esta migration ja foi aplicada na mao (foi o caso da producao em 2026-07-25).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_user_pousada') THEN
    ALTER TABLE user_pousadas
      ADD CONSTRAINT uq_user_pousada UNIQUE (user_id, pousada_id);
  END IF;
END $$;
