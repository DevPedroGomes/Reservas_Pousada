-- 022: Pix para o sinal
--
-- Cobrança Pix ligada à reserva: pelo código "copia e cola" gerado com a
-- chave da pousada (confirmação manual) ou pelo gateway da própria pousada
-- (Asaas),
-- que avisa o pagamento por webhook e a reserva se confirma sozinha.
--
-- Credencial do gateway fica cifrada aqui, fora de pousadas.configuracoes
-- (que vai para o navegador).

CREATE TABLE IF NOT EXISTS credenciais_pagamento (
  pousada_id     INTEGER NOT NULL REFERENCES pousadas(id) ON DELETE CASCADE,
  provedor       TEXT NOT NULL CHECK (provedor IN ('asaas')),
  token_cifrado  TEXT NOT NULL,
  -- Segredo do endereço do webhook desta pousada (identifica a pousada).
  webhook_token  TEXT NOT NULL UNIQUE,
  -- Token que o gateway manda no cabeçalho de cada aviso (autentica o aviso).
  webhook_auth   TEXT NOT NULL,
  -- Webhook registrado na conta do gateway pela API? (senão, cadastro manual)
  webhook_registrado BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (pousada_id, provedor)
);

CREATE TABLE IF NOT EXISTS cobrancas_pix (
  id               SERIAL PRIMARY KEY,
  pousada_id       INTEGER NOT NULL REFERENCES pousadas(id),
  reserva_id       INTEGER NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
  provedor         TEXT NOT NULL CHECK (provedor IN ('chave', 'asaas')),
  provedor_id      TEXT,
  valor_centavos   INTEGER NOT NULL CHECK (valor_centavos > 0),
  copia_e_cola     TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'paga', 'expirada', 'cancelada')),
  -- Para o hóspede acompanhar o pagamento na página de reservas, sem login.
  token_publico    TEXT NOT NULL UNIQUE,
  expira_em        TIMESTAMPTZ,
  paga_em          TIMESTAMPTZ,
  pagamento_id     INTEGER REFERENCES pagamentos(id) ON DELETE SET NULL,
  criado_por       TEXT REFERENCES "user"(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cobranca_provedor ON cobrancas_pix (provedor, provedor_id) WHERE provedor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cobrancas_reserva ON cobrancas_pix (reserva_id);
