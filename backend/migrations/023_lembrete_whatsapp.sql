-- 023: lembrete de chegada pelo WhatsApp (API oficial)
--
-- Marca quando o lembrete da véspera foi enviado, para o job não mandar duas
-- vezes (reinício, réplica, nova execução no mesmo dia).
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS lembrete_enviado_em TIMESTAMPTZ;
