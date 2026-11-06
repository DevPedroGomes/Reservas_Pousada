-- 026: consumo do atendente virtual por pousada e por dia
--
-- Uma linha por (pousada, dia local). É a base do teto diário em tokens, do teto
-- global da plataforma e do custo de IA no painel de margem.
--
-- O custo fica em MICROCENTAVOS porque uma resposta custa frações de centavo:
-- arredondar chamada a chamada para o inteiro de `financeiro_lancamentos` faria
-- o total do mês não bater com o consumo real.

CREATE TABLE IF NOT EXISTS agente_uso_diario (
  pousada_id          INTEGER NOT NULL REFERENCES pousadas(id) ON DELETE CASCADE,
  dia                 DATE NOT NULL,
  chamadas            INTEGER NOT NULL DEFAULT 0,
  tokens_entrada      BIGINT NOT NULL DEFAULT 0,
  tokens_saida        BIGINT NOT NULL DEFAULT 0,
  custo_microcentavos BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (pousada_id, dia)
);
CREATE INDEX IF NOT EXISTS idx_agente_uso_dia ON agente_uso_diario (dia);

-- Alerta já disparado (um por chave): o teto global não pode gerar um alerta por
-- mensagem recebida, e a tabela vale entre réplicas da API.
CREATE TABLE IF NOT EXISTS agente_alertas (
  chave     TEXT PRIMARY KEY,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
