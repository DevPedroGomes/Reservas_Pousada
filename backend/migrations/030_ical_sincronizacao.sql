-- 030: sincronização de calendário iCal mais cautelosa
--
-- ical_ausencias: em quantas sincronizações seguidas o evento não apareceu no
-- feed. Um feed ruim uma vez não pode cancelar reserva e revender a data.

ALTER TABLE reservas
  ADD COLUMN IF NOT EXISTS ical_ausencias INTEGER NOT NULL DEFAULT 0;

-- ical_bloqueio: o evento é data fechada na OTA, não hóspede. Não é venda.
-- O Booking publica reserva e data fechada com o mesmo texto, então lá não dá
-- para distinguir.
ALTER TABLE reservas
  ADD COLUMN IF NOT EXISTS ical_bloqueio BOOLEAN NOT NULL DEFAULT false;
UPDATE reservas SET ical_bloqueio = true
 WHERE ical_importacao_id IS NOT NULL AND canal <> 'booking' AND valor IS NULL AND NOT ical_bloqueio
   AND nome ~* '(not available|unavailable|indispon|blocked|bloquead)';

-- cancelada_manualmente: cancelamento manual; a sincronização não desfaz. O que
-- já foi cancelado à mão se reconhece por não trazer o motivo que o sync grava.
ALTER TABLE reservas
  ADD COLUMN IF NOT EXISTS cancelada_manualmente BOOLEAN NOT NULL DEFAULT false;
UPDATE reservas SET cancelada_manualmente = true
 WHERE ical_importacao_id IS NOT NULL AND status = 'cancelada' AND NOT cancelada_manualmente
   AND (motivo_cancelamento IS NULL OR motivo_cancelamento NOT LIKE 'Cancelada no calendário%');

-- ultima_tentativa: gravada antes de buscar o feed. Feed que trava ou derruba a
-- rodada vai para o fim da fila, em vez de voltar à frente na rodada seguinte.
ALTER TABLE ical_importacoes
  ADD COLUMN IF NOT EXISTS ultima_tentativa TIMESTAMPTZ;
