-- 028: o trial é um só por pessoa e por conta de WhatsApp
--
-- Excluir a pousada apaga o vínculo com o dono, e sem vínculo a pousada seguinte
-- nascia com 14 dias novos: um teste grátis renovável para sempre.

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS trial_usado_em TIMESTAMPTZ;

-- Quem já é dono de uma pousada já consumiu o seu.
UPDATE "user" u SET trial_usado_em = s.primeiro
  FROM (
    SELECT up.user_id, min(a.created_at) AS primeiro
      FROM user_pousadas up JOIN assinaturas a ON a.pousada_id = up.pousada_id
     WHERE up.is_owner
     GROUP BY up.user_id
  ) s
 WHERE s.user_id = u.id AND u.trial_usado_em IS NULL;

-- Excluir a conta anonimiza o usuário, e o recadastro é outra linha. Fica só o
-- HMAC do e-mail: não identifica a pessoa sem a chave do servidor e serve apenas
-- para reconhecer o mesmo e-mail de volta.
CREATE TABLE IF NOT EXISTS trial_emails_usados (
  email_hash TEXT PRIMARY KEY,
  usado_em   TIMESTAMPTZ NOT NULL
);

-- WABA que já passou pelo sistema. Sobrevive à exclusão da pousada de propósito.
CREATE TABLE IF NOT EXISTS whatsapp_wabas_usadas (
  waba_id        TEXT PRIMARY KEY,
  pousada_id     INTEGER NOT NULL,
  primeiro_uso_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO whatsapp_wabas_usadas (waba_id, pousada_id)
SELECT waba_id, pousada_id FROM whatsapp_contas
ON CONFLICT DO NOTHING;
