-- 027: data real da inadimplência
--
-- A carência era contada a partir de `periodo_termina_em`, mas o Stripe avança
-- esse campo ao gerar a fatura, mesmo quando a cobrança falha. Quem não pagava
-- ganhava um mês inteiro a cada ciclo e nunca era cortado.
ALTER TABLE assinaturas ADD COLUMN IF NOT EXISTS inadimplente_desde TIMESTAMPTZ;

-- Quem já estava inadimplente começa a contar agora: cortar no deploy puniria
-- por um atraso que até aqui o sistema tratava como dentro do prazo.
UPDATE assinaturas SET inadimplente_desde = now() WHERE status = 'inadimplente' AND inadimplente_desde IS NULL;
