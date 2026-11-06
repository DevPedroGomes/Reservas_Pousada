-- PIN de duas etapas usado ao registrar o número na Cloud API. Sem ele, registrar
-- o mesmo número de novo exige redefinir o PIN à mão no gerenciador da Meta.
ALTER TABLE whatsapp_contas ADD COLUMN IF NOT EXISTS pin_cifrado TEXT;
