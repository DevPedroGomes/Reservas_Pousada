-- Add unique constraint on user_pousadas to prevent duplicate memberships
ALTER TABLE user_pousadas
  ADD CONSTRAINT uq_user_pousada UNIQUE (user_id, pousada_id);
