-- 004: Soft delete for reservas + missing indexes

-- Add soft delete column
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- Index for filtering non-deleted records efficiently
CREATE INDEX IF NOT EXISTS idx_reservas_deleted_at ON reservas (deleted_at) WHERE deleted_at IS NULL;

-- Missing indexes for performance
CREATE INDEX IF NOT EXISTS idx_auditoria_created_at ON auditoria (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_expires_at ON session (expires_at);
