-- 027: data real da inadimplência
--
-- A carência era contada a partir de `periodo_termina_em`, mas o Stripe avança
-- esse campo ao gerar a fatura, mesmo quando a cobrança falha. Quem não pagava
-- ganhava um mês inteiro a cada ciclo e nunca era cortado.
ALTER TABLE assinaturas ADD COLUMN IF NOT EXISTS inadimplente_desde TIMESTAMPTZ;

-- Quem já estava inadimplente começa a contar agora: cortar no deploy puniria
-- por um atraso que até aqui o sistema tratava como dentro do prazo.
UPDATE assinaturas SET inadimplente_desde = now() WHERE status = 'inadimplente' AND inadimplente_desde IS NULL;

-- Contestação de pagamento (chargeback) em aberto ou perdida. Coluna à parte do
-- status porque o status é reescrito a cada evento da assinatura, e a contestação
-- não pode ser desfeita por um `subscription.updated`.
ALTER TABLE assinaturas ADD COLUMN IF NOT EXISTS disputa_status TEXT;
ALTER TABLE assinaturas DROP CONSTRAINT IF EXISTS assinaturas_disputa_valida;
ALTER TABLE assinaturas ADD CONSTRAINT assinaturas_disputa_valida
  CHECK (disputa_status IS NULL OR disputa_status IN ('aberta', 'perdida'));

-- Estorno é receita devolvida. Como toda a tabela, o valor fica positivo e o
-- sinal é implícito na categoria.
ALTER TABLE financeiro_lancamentos DROP CONSTRAINT IF EXISTS financeiro_categoria_valida;
ALTER TABLE financeiro_lancamentos ADD CONSTRAINT financeiro_categoria_valida
  CHECK (categoria IN ('receita_assinatura','estorno_assinatura','taxa_stripe','custo_ia','custo_email'));
