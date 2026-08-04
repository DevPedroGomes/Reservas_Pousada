-- 009: o banco passa a ser a autoridade contra overbooking
--
-- PROBLEMA
-- `ReservaModel.criar()` fazia SELECT de disponibilidade e INSERT em duas
-- viagens separadas ao banco, sem transacao e sem lock. Duas requisicoes
-- simultaneas para o mesmo quarto e periodo passavam AMBAS pela checagem e
-- inseriam AMBAS: duas familias com a mesma reserva no feriado. A coluna
-- `version` (optimistic locking) nao cobre isso — ela protege UPDATE concorrente
-- na MESMA linha, nao INSERT de linhas que conflitam entre si.
--
-- SOLUCAO
-- Constraint EXCLUDE com btree_gist. O Postgres passa a recusar, de forma
-- atomica, qualquer par de reservas ativas do mesmo quarto na mesma pousada cujo
-- periodo se sobreponha. Nao existe janela de corrida: a garantia e do indice.
--
-- SEMIABERTO `[)`
-- `daterange(data_entrada, data_saida, '[)')` trata a diaria de saida como NAO
-- ocupada. Quem sai dia 12 libera o quarto para quem entra dia 12 — a troca de
-- hospede no mesmo dia, que o predicado fechado anterior bloqueava. Reservas de
-- 1 diaria (entrada 10, saida 11) continuam ocupando o dia 10.
--
-- ESCOPO
-- Só linhas `status = 'ativa'` e nao deletadas participam. Cancelada e
-- finalizada nao seguram o quarto, e soft-delete some do calculo.
--
-- AVISO PARA OUTROS AMBIENTES
-- Se a base ja tiver reservas ativas sobrepostas, este ALTER FALHA e o servidor
-- nao sobe (o runner e fatal de proposito). Isso e o comportamento desejado: o
-- dado precisa ser reconciliado a mao antes. Para descobrir os conflitos:
--
--   SELECT a.id, b.id, a.pousada_id, a.quarto
--   FROM reservas a JOIN reservas b
--     ON a.id < b.id AND a.pousada_id = b.pousada_id AND a.quarto = b.quarto
--    AND a.status = 'ativa' AND b.status = 'ativa'
--    AND a.deleted_at IS NULL AND b.deleted_at IS NULL
--    AND daterange(a.data_entrada, a.data_saida, '[)')
--     && daterange(b.data_entrada, b.data_saida, '[)');

CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reservas_sem_overbooking'
      AND conrelid = 'reservas'::regclass
  ) THEN
    ALTER TABLE reservas
      ADD CONSTRAINT reservas_sem_overbooking
      EXCLUDE USING gist (
        pousada_id WITH =,
        quarto     WITH =,
        daterange(data_entrada, data_saida, '[)') WITH &&
      )
      WHERE (status = 'ativa' AND deleted_at IS NULL);
  END IF;
END $$;

-- Coerencia basica do periodo: saida sempre depois da entrada.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reservas_periodo_valido'
      AND conrelid = 'reservas'::regclass
  ) THEN
    ALTER TABLE reservas
      ADD CONSTRAINT reservas_periodo_valido CHECK (data_saida > data_entrada);
  END IF;
END $$;
