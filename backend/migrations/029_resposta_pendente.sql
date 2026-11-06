-- 029: resposta do atendente guardada antes de enviar
--
-- Se o modelo respondeu e a Meta falhou, a retentativa da fila chamava o modelo
-- de novo e pagava outra vez pela mesma resposta. A resposta fica na mensagem de
-- entrada, cifrada como o resto da conversa, só até sair. Vai embora junto com a
-- mensagem na retenção.
ALTER TABLE whatsapp_mensagens ADD COLUMN IF NOT EXISTS resposta_pendente_cifrada TEXT;
ALTER TABLE whatsapp_mensagens ADD COLUMN IF NOT EXISTS resposta_transferir TEXT;
