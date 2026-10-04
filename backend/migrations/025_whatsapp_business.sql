-- 025: WhatsApp Business da própria pousada (Cloud API via Embedded Signup)
--
-- A pousada conecta o número dela pelo painel (fluxo da Meta); o Diária guarda
-- o token daquela conta (cifrado), recebe as mensagens num webhook único e,
-- se ela quiser, o atendente virtual responde com os dados da pousada.
-- Conversas e mensagens ficam cifradas e são apagadas pela retenção.

CREATE TABLE IF NOT EXISTS whatsapp_contas (
  pousada_id        INTEGER PRIMARY KEY REFERENCES pousadas(id) ON DELETE CASCADE,
  waba_id           TEXT NOT NULL,
  phone_number_id   TEXT NOT NULL UNIQUE,
  numero_exibicao   TEXT,
  nome_verificado   TEXT,
  token_cifrado     TEXT NOT NULL,
  -- Número continua no app WhatsApp Business do celular (coexistência).
  coexistencia      BOOLEAN NOT NULL DEFAULT false,
  agente_ativo      BOOLEAN NOT NULL DEFAULT false,
  modelos_criados   BOOLEAN NOT NULL DEFAULT false,
  conectado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS whatsapp_conversas (
  id                    SERIAL PRIMARY KEY,
  pousada_id            INTEGER NOT NULL REFERENCES pousadas(id) ON DELETE CASCADE,
  contato               TEXT NOT NULL,
  nome_contato          TEXT,
  -- humano: alguém da equipe assumiu; o agente fica calado até humano_ate.
  modo                  TEXT NOT NULL DEFAULT 'agente' CHECK (modo IN ('agente', 'humano')),
  humano_ate            TIMESTAMPTZ,
  optout                BOOLEAN NOT NULL DEFAULT false,
  aviso_enviado         BOOLEAN NOT NULL DEFAULT false,
  -- Janela de atendimento de 24h da Meta (resposta livre e sem custo).
  janela_ate            TIMESTAMPTZ,
  ultima_mensagem_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_whatsapp_conversa UNIQUE (pousada_id, contato)
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversas_recentes ON whatsapp_conversas (pousada_id, ultima_mensagem_em DESC);

CREATE TABLE IF NOT EXISTS whatsapp_mensagens (
  id             SERIAL PRIMARY KEY,
  conversa_id    INTEGER NOT NULL REFERENCES whatsapp_conversas(id) ON DELETE CASCADE,
  wamid          TEXT UNIQUE,
  direcao        TEXT NOT NULL CHECK (direcao IN ('entrada', 'agente', 'equipe', 'sistema')),
  texto_cifrado  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_mensagens_conversa ON whatsapp_mensagens (conversa_id, id);
