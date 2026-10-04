-- 013: contadores de rate limit compartilhados
--
-- Os limitadores guardavam os contadores na memória do processo. Dois efeitos:
-- (1) com duas réplicas da API, cada uma tinha o próprio contador — o limite
--     real virava o dobro;
-- (2) todo deploy zerava os contadores — o limite de tentativas de login
--     reiniciava a cada versão publicada.
--
-- UNLOGGED: contador de rate limit não precisa sobreviver a um crash do
-- Postgres, e sem WAL o upsert por requisição fica bem mais barato.

CREATE UNLOGGED TABLE IF NOT EXISTS rate_limits (
  chave     TEXT PRIMARY KEY,
  hits      INTEGER NOT NULL,
  reset_em  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON rate_limits (reset_em);
