-- 011: lançamentos financeiros por tenant — a base do painel de margem
--
-- POR QUE ISTO EXISTE
-- Sem medir margem por cliente, um SaaS descobre que está perdendo dinheiro num
-- cliente específico quando já perdeu por vários meses. A regra do portfólio é
-- explícita: margem negativa por 2 ciclos → forçar upgrade ou cancelar. Não dá
-- para cumprir uma regra que ninguém mede.
--
-- POR QUE UMA TABELA DE LANÇAMENTOS E NÃO COLUNAS AGREGADAS
-- Agregado não se audita. Quando a margem de um cliente parecer errada, a
-- pergunta vai ser "de onde veio esse número", e a resposta precisa ser uma
-- lista de linhas com referência externa — o id da fatura no Stripe — não um
-- total que alguém somou uma vez.

CREATE TABLE IF NOT EXISTS financeiro_lancamentos (
  id                 SERIAL PRIMARY KEY,
  pousada_id         INTEGER NOT NULL REFERENCES pousadas(id) ON DELETE CASCADE,

  -- 'YYYY-MM'. Competência, não data de recebimento: uma fatura de julho paga
  -- em agosto pertence a julho, senão a margem mensal fica torta.
  competencia        TEXT NOT NULL,

  -- receita_assinatura | taxa_stripe | custo_ia | custo_email
  categoria          TEXT NOT NULL,

  -- Sempre POSITIVO. O sinal é implícito na categoria; guardar negativo
  -- convida erro de soma na primeira query que alguém escrever à mão.
  valor_centavos     INTEGER NOT NULL CHECK (valor_centavos >= 0),
  moeda              TEXT NOT NULL DEFAULT 'brl',

  -- true quando o valor é uma estimativa, não um número que veio do provedor.
  -- O painel mostra a diferença: estimativa não pode virar fato por descuido.
  estimado           BOOLEAN NOT NULL DEFAULT false,

  descricao          TEXT,
  -- Id no provedor (fatura do Stripe). É por aqui que se audita um lançamento.
  referencia_externa TEXT,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financeiro_pousada_competencia
  ON financeiro_lancamentos (pousada_id, competencia);
CREATE INDEX IF NOT EXISTS idx_financeiro_competencia
  ON financeiro_lancamentos (competencia, categoria);

-- Mesmo lançamento não pode entrar duas vezes.
--
-- O webhook do Stripe já é idempotente por evento, mas eventos DIFERENTES podem
-- falar da mesma fatura (`invoice.paid` e um retry manual, por exemplo). Esta
-- constraint é a segunda linha de defesa: o dinheiro não pode ser contado duas
-- vezes por causa de um caminho que ninguém previu.
CREATE UNIQUE INDEX IF NOT EXISTS uq_financeiro_ref
  ON financeiro_lancamentos (categoria, referencia_externa)
  WHERE referencia_externa IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'financeiro_categoria_valida' AND conrelid = 'financeiro_lancamentos'::regclass
  ) THEN
    ALTER TABLE financeiro_lancamentos ADD CONSTRAINT financeiro_categoria_valida
      CHECK (categoria IN ('receita_assinatura','taxa_stripe','custo_ia','custo_email'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'financeiro_competencia_valida' AND conrelid = 'financeiro_lancamentos'::regclass
  ) THEN
    ALTER TABLE financeiro_lancamentos ADD CONSTRAINT financeiro_competencia_valida
      CHECK (competencia ~ '^\d{4}-\d{2}$');
  END IF;
END $$;
