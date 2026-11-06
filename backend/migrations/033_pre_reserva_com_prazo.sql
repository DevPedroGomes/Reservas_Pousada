-- 033: toda pré-reserva tem prazo
--
-- Sem expira_em, o job de expiração não enxerga a pré-reserva e ela segura o
-- quarto para sempre. As antigas ganham 48h a partir de agora, o mesmo prazo
-- padrão de quem cria pela recepção.

UPDATE reservas SET expira_em = now() + interval '48 hours'
 WHERE status = 'pre_reserva' AND expira_em IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reservas_pre_reserva_com_prazo' AND conrelid = 'reservas'::regclass
  ) THEN
    ALTER TABLE reservas ADD CONSTRAINT reservas_pre_reserva_com_prazo
      CHECK (status <> 'pre_reserva' OR expira_em IS NOT NULL);
  END IF;
END $$;
