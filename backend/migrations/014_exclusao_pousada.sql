-- 014: exclusão de pousada a pedido do dono (LGPD)
--
-- A exclusão apaga os dados de hóspedes, reservas, convites e vínculos, mas
-- NÃO a linha da pousada: assinatura e lançamentos financeiros do SaaS são
-- registro contábil que precisa ser mantido. A linha fica anonimizada e
-- marcada com a data da exclusão.

ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS excluida_em TIMESTAMPTZ;
