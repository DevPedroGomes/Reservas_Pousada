-- 037: IP e user agent de quem abriu o checkout, para o evento de assinatura
-- enviado à Meta pela Conversions API. A Meta exige o user agent em evento de
-- site, e o pagamento chega pelo webhook, sem navegador. Só é gravado quando a
-- medição está configurada, e a limpeza apaga depois de 7 dias.
ALTER TABLE assinaturas ADD COLUMN IF NOT EXISTS contexto_conversao JSONB;
