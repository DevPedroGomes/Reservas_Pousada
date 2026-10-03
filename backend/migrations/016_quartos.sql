-- 016: quartos como cadastro
--
-- O quarto era só um número de 1 a num_quartos: sem nome ("Suíte Mar",
-- "Chalé 2"), sem tipo, capacidade ou preço base, e sem como desativar um
-- quarto em reforma. Pior: nada no banco amarrava a reserva a um quarto que
-- existisse — a aplicação checava, mas uma linha inserida por fora passava.
--
-- A tabela `quartos` vira a fonte da verdade. `pousadas.num_quartos` passa a
-- ser um cache (quantidade de quartos ATIVOS), mantido por trigger, para não
-- quebrar o que já lê a coluna (estatísticas, limites de plano).

CREATE TABLE IF NOT EXISTS quartos (
  id                  SERIAL PRIMARY KEY,
  pousada_id          INTEGER NOT NULL REFERENCES pousadas(id) ON DELETE CASCADE,
  numero              INTEGER NOT NULL CHECK (numero BETWEEN 1 AND 9999),
  nome                TEXT NOT NULL,
  tipo                TEXT,
  capacidade          INTEGER NOT NULL DEFAULT 2 CHECK (capacidade BETWEEN 1 AND 50),
  preco_base_centavos INTEGER CHECK (preco_base_centavos IS NULL OR preco_base_centavos >= 0),
  descricao           TEXT,
  ativo               BOOLEAN NOT NULL DEFAULT true,
  ordem               INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_quarto_numero UNIQUE (pousada_id, numero)
);

CREATE INDEX IF NOT EXISTS idx_quartos_pousada ON quartos (pousada_id, ordem, numero);

-- Pousadas existentes: um quarto por número até num_quartos, e também os
-- números usados por reservas antigas acima disso (ficam inativos), para a
-- chave estrangeira abaixo nunca encontrar órfão.
INSERT INTO quartos (pousada_id, numero, nome, ordem, ativo)
SELECT p.id, g.n, 'Quarto ' || g.n, g.n, g.n <= p.num_quartos
  FROM pousadas p
  CROSS JOIN LATERAL generate_series(
    1, GREATEST(p.num_quartos, (SELECT COALESCE(MAX(r.quarto), 0) FROM reservas r WHERE r.pousada_id = p.id))
  ) AS g(n)
ON CONFLICT (pousada_id, numero) DO NOTHING;

-- A reserva aponta para um quarto que existe nesta pousada. Renumerar um
-- quarto leva as reservas junto.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_reserva_quarto' AND conrelid = 'reservas'::regclass
  ) THEN
    ALTER TABLE reservas
      ADD CONSTRAINT fk_reserva_quarto FOREIGN KEY (pousada_id, quarto)
      REFERENCES quartos (pousada_id, numero) ON UPDATE CASCADE;
  END IF;
END $$;

-- Pousada nova nasce com os quartos 1..num_quartos.
CREATE OR REPLACE FUNCTION criar_quartos_iniciais() RETURNS trigger AS $$
BEGIN
  INSERT INTO quartos (pousada_id, numero, nome, ordem)
  SELECT NEW.id, g.n, 'Quarto ' || g.n, g.n FROM generate_series(1, GREATEST(NEW.num_quartos, 0)) AS g(n)
  ON CONFLICT (pousada_id, numero) DO NOTHING;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_criar_quartos_iniciais ON pousadas;
CREATE TRIGGER trg_criar_quartos_iniciais
  AFTER INSERT ON pousadas FOR EACH ROW EXECUTE FUNCTION criar_quartos_iniciais();

-- num_quartos = quantidade de quartos ativos (cache para estatísticas e limites).
CREATE OR REPLACE FUNCTION sincronizar_num_quartos() RETURNS trigger AS $$
DECLARE
  alvo INTEGER := COALESCE(NEW.pousada_id, OLD.pousada_id);
BEGIN
  UPDATE pousadas
     SET num_quartos = (SELECT count(*) FROM quartos WHERE pousada_id = alvo AND ativo)
   WHERE id = alvo;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sincronizar_num_quartos ON quartos;
CREATE TRIGGER trg_sincronizar_num_quartos
  AFTER INSERT OR UPDATE OF ativo OR DELETE ON quartos
  FOR EACH ROW EXECUTE FUNCTION sincronizar_num_quartos();

DROP TRIGGER IF EXISTS update_quartos_updated_at ON quartos;
CREATE TRIGGER update_quartos_updated_at
  BEFORE UPDATE ON quartos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
