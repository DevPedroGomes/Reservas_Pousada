-- 019: pagamentos e consumo da reserva
--
-- A reserva só tinha um "pago: sim/não". Na pousada real há sinal (30–50%
-- para segurar a data), o resto no check-in, às vezes em duas formas, e o
-- frigobar/passeio lançado na conta. Sem isso, o "a receber" do painel era
-- um chute e o relatório de receita, impossível.
--
-- Valores em centavos (inteiro). `reservas.valor` (diárias, em reais)
-- continua como está; total da conta = diárias + consumos; saldo = total
-- menos o que foi pago. `reservas.pago` passa a ser derivado quando há
-- pagamento lançado (a aplicação recalcula a cada lançamento).

CREATE TABLE IF NOT EXISTS pagamentos (
  id              SERIAL PRIMARY KEY,
  pousada_id      INTEGER NOT NULL REFERENCES pousadas(id),
  reserva_id      INTEGER NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
  -- Negativo = estorno (devolução ao hóspede).
  valor_centavos  INTEGER NOT NULL CHECK (valor_centavos <> 0),
  forma           TEXT NOT NULL CHECK (forma IN ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'transferencia', 'ota', 'outro')),
  tipo            TEXT NOT NULL DEFAULT 'pagamento' CHECK (tipo IN ('sinal', 'pagamento', 'estorno')),
  recebido_em     DATE NOT NULL DEFAULT current_date,
  observacao      TEXT,
  criado_por      TEXT REFERENCES "user"(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pagamentos_estorno_negativo CHECK ((tipo = 'estorno') = (valor_centavos < 0))
);
CREATE INDEX IF NOT EXISTS idx_pagamentos_reserva ON pagamentos (reserva_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_pousada_data ON pagamentos (pousada_id, recebido_em);

CREATE TABLE IF NOT EXISTS consumos (
  id                       SERIAL PRIMARY KEY,
  pousada_id               INTEGER NOT NULL REFERENCES pousadas(id),
  reserva_id               INTEGER NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
  descricao                TEXT NOT NULL,
  quantidade               INTEGER NOT NULL DEFAULT 1 CHECK (quantidade BETWEEN 1 AND 999),
  valor_unitario_centavos  INTEGER NOT NULL CHECK (valor_unitario_centavos BETWEEN 0 AND 100000000),
  lancado_em               DATE NOT NULL DEFAULT current_date,
  criado_por               TEXT REFERENCES "user"(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consumos_reserva ON consumos (reserva_id);

-- Reservas já marcadas como pagas ganham um pagamento equivalente, para o
-- saldo e a receita baterem com o que a pousada já tinha registrado.
INSERT INTO pagamentos (pousada_id, reserva_id, valor_centavos, forma, tipo, recebido_em, observacao, created_at)
SELECT r.pousada_id, r.id, round(r.valor * 100)::int, 'outro', 'pagamento', r.data_entrada,
       'Registrado antes do controle de pagamentos', COALESCE(r.updated_at, now())
  FROM reservas r
 WHERE r.pago = true
   AND r.valor IS NOT NULL
   AND round(r.valor * 100) > 0
   AND NOT EXISTS (SELECT 1 FROM pagamentos p WHERE p.reserva_id = r.id);
