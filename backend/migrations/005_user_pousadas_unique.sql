-- 005: tabela de vinculo user <-> pousada + unicidade da associacao
--
-- A tabela `user_pousadas` nunca teve CREATE em migration nenhuma: existia so no
-- schema do Drizzle e foi materializada em producao com `drizzle-kit push` na
-- mao. Consequencia: um deploy do ZERO morria exatamente aqui ("relation
-- user_pousadas does not exist"), o runner lancava e o servidor nao subia. Ou
-- seja: havia backup mas nao havia recuperacao — nem ambiente de staging.
--
-- O CREATE entrou NESTA migration (e nao numa nova) porque e aqui que a tabela e
-- referenciada pela primeira vez; migrations rodam em ordem numerica e uma 008
-- chegaria tarde demais. Em bancos onde a 005 ja consta em `schema_migrations`
-- este arquivo nao roda de novo — e mesmo se rodasse, e idempotente inteiro.
--
-- Idempotente de proposito: `ADD CONSTRAINT` puro estoura se a constraint ja
-- existir, e o runner precisa poder rodar sobre um banco onde esta migration ja
-- foi aplicada na mao (foi o caso da producao em 2026-07-25).

CREATE TABLE IF NOT EXISTS user_pousadas (
  id         SERIAL PRIMARY KEY,
  user_id    TEXT    NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  pousada_id INTEGER NOT NULL REFERENCES pousadas(id) ON DELETE CASCADE,
  role       TEXT    NOT NULL DEFAULT 'recepcao',
  is_owner   BOOLEAN DEFAULT false,
  joined_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_pousadas_user ON user_pousadas (user_id);

-- Unicidade da associacao (user, pousada).
--
-- O teste e escopado por `conrelid` alem do nome: nomes de constraint sao unicos
-- por TABELA no Postgres, nao por schema, entao checar so `conname` podia dar
-- falso positivo com uma constraint homonima em outra tabela.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_user_pousada'
      AND conrelid = 'user_pousadas'::regclass
  ) THEN
    ALTER TABLE user_pousadas
      ADD CONSTRAINT uq_user_pousada UNIQUE (user_id, pousada_id);
  END IF;
END $$;
