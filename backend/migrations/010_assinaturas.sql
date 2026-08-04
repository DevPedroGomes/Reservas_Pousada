-- 010: assinaturas e idempotencia de webhook
--
-- O trial de 14 dias e NOSSO, nao do Stripe: como nao pedimos cartao na
-- entrada, nao existe assinatura no Stripe durante o teste. O Stripe so entra
-- em cena quando o dono decide pagar. Por isso `trial_termina_em` vive aqui e
-- os campos stripe_* sao nulaveis.

CREATE TABLE IF NOT EXISTS assinaturas (
  id                     SERIAL PRIMARY KEY,
  pousada_id             INTEGER NOT NULL UNIQUE REFERENCES pousadas(id) ON DELETE CASCADE,

  -- trial | ativa | inadimplente | suspensa | cancelada | cortesia
  status                 TEXT NOT NULL DEFAULT 'trial',
  -- essencial | pousada | rede  (null enquanto em trial)
  plano                  TEXT,
  -- mensal | anual
  ciclo                  TEXT,

  trial_termina_em       TIMESTAMPTZ,
  periodo_termina_em     TIMESTAMPTZ,
  cancela_no_fim         BOOLEAN NOT NULL DEFAULT false,

  stripe_customer_id     TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,

  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assinaturas_status ON assinaturas (status);
CREATE INDEX IF NOT EXISTS idx_assinaturas_customer ON assinaturas (stripe_customer_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assinaturas_status_valido' AND conrelid = 'assinaturas'::regclass
  ) THEN
    ALTER TABLE assinaturas ADD CONSTRAINT assinaturas_status_valido
      CHECK (status IN ('trial','ativa','inadimplente','suspensa','cancelada','cortesia'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assinaturas_plano_valido' AND conrelid = 'assinaturas'::regclass
  ) THEN
    ALTER TABLE assinaturas ADD CONSTRAINT assinaturas_plano_valido
      CHECK (plano IS NULL OR plano IN ('essencial','pousada','rede'));
  END IF;
END $$;

-- Idempotencia de webhook.
--
-- O Stripe reenvia um evento ate conseguir um 2xx, e pode entregar o mesmo
-- evento mais de uma vez mesmo depois do sucesso. Sem esta tabela, um retry de
-- `invoice.paid` reprocessaria a mesma cobranca. O id do evento e a chave
-- primaria: quem tenta inserir duas vezes leva conflito e o handler pula.
CREATE TABLE IF NOT EXISTS stripe_events (
  id           TEXT PRIMARY KEY,
  tipo         TEXT NOT NULL,
  processado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_processado ON stripe_events (processado_em DESC);

-- Pousadas que ja existiam entram como cortesia: nunca expira, nunca cobra.
-- Sao as contas internas de teste; ligar o enforcement nao pode derrubar quem
-- ja estava dentro. Contas novas nascem em trial pelo default da coluna.
INSERT INTO assinaturas (pousada_id, status)
SELECT p.id, 'cortesia' FROM pousadas p
WHERE NOT EXISTS (SELECT 1 FROM assinaturas a WHERE a.pousada_id = p.id);
