-- 035: quando e sob qual versão da política o hóspede aceitou ou foi informado.
--
-- Até aqui o aceite só era conferido no pedido e descartado: nada provava depois
-- o que a pessoa tinha visto. Linhas antigas ficam com NULL: não há o que afirmar
-- sobre elas.
--
-- aceite_forma separa duas coisas diferentes:
--   marcado_no_site        o hóspede marcou a caixa no motor de reservas
--   informado_no_whatsapp  recebeu o aviso no início da conversa; NÃO é aceite
--                          explícito, e o tratamento se apoia nos procedimentos
--                          preliminares do contrato que ele pediu
ALTER TABLE precheckins
  ADD COLUMN IF NOT EXISTS aceite_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS aceite_versao TEXT;

ALTER TABLE reservas
  ADD COLUMN IF NOT EXISTS aceite_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS aceite_versao TEXT,
  ADD COLUMN IF NOT EXISTS aceite_forma TEXT
    CONSTRAINT ck_reservas_aceite_forma CHECK (aceite_forma IN ('marcado_no_site', 'informado_no_whatsapp'));
