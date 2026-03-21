-- Add version column for optimistic locking on reservations
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
