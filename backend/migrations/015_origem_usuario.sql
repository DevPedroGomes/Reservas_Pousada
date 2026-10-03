-- 015: de onde veio cada cadastro (atribuição de marketing)
--
-- Sem isto, com tráfego pago não dá para saber qual anúncio trouxe cliente
-- pagante — e o custo por cliente de cada canal fica no escuro. Guarda a
-- PRIMEIRA origem do visitante (utm_*, gclid/fbclid, referrer) e se ele
-- consentiu com cookies de anúncio (condição para enviar conversões ao
-- Google/Meta pelo servidor).

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS origem JSONB;
CREATE INDEX IF NOT EXISTS idx_user_origem_fonte ON "user" ((origem->>'utm_source'));
