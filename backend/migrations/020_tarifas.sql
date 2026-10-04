-- 020: tarifário
--
-- Preço era digitado a cada reserva, de cabeça. Pousada cobra diferente na
-- alta temporada, no feriado e no fim de semana, e exige mínimo de noites
-- em pacote (Réveillon, Carnaval). Cada regra ajusta o preço base do quarto
-- (preço fixo por noite ou percentual) num período, em dias da semana e/ou
-- num quarto; quando várias valem na mesma noite, vale a mais específica.

CREATE TABLE IF NOT EXISTS tarifas (
  id                 SERIAL PRIMARY KEY,
  pousada_id         INTEGER NOT NULL REFERENCES pousadas(id) ON DELETE CASCADE,
  nome               TEXT NOT NULL,
  quarto_numero      INTEGER,
  data_inicio        DATE,
  data_fim           DATE,
  -- Noites que começam nesses dias (0 = domingo ... 6 = sábado).
  dias_semana        SMALLINT[],
  preco_centavos     INTEGER CHECK (preco_centavos IS NULL OR preco_centavos BETWEEN 0 AND 100000000),
  ajuste_percentual  INTEGER CHECK (ajuste_percentual IS NULL OR ajuste_percentual BETWEEN -90 AND 500),
  minimo_noites      INTEGER CHECK (minimo_noites IS NULL OR minimo_noites BETWEEN 1 AND 60),
  ativa              BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tarifas_periodo CHECK ((data_inicio IS NULL) = (data_fim IS NULL) AND (data_fim IS NULL OR data_fim >= data_inicio)),
  CONSTRAINT tarifas_um_ajuste CHECK (preco_centavos IS NULL OR ajuste_percentual IS NULL),
  CONSTRAINT tarifas_faz_algo CHECK (preco_centavos IS NOT NULL OR ajuste_percentual IS NOT NULL OR minimo_noites IS NOT NULL),
  CONSTRAINT tarifas_dias_validos CHECK (
    dias_semana IS NULL OR (dias_semana <@ ARRAY[0,1,2,3,4,5,6]::smallint[] AND cardinality(dias_semana) BETWEEN 1 AND 7)
  ),
  CONSTRAINT tarifas_quarto_fk FOREIGN KEY (pousada_id, quarto_numero)
    REFERENCES quartos (pousada_id, numero) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tarifas_pousada ON tarifas (pousada_id) WHERE ativa;
