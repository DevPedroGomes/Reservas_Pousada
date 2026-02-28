-- Migration: Convert auditoria.details from text to jsonb
-- This allows querying audit details efficiently

-- Convert existing text data to jsonb (handles both valid JSON strings and nulls)
ALTER TABLE auditoria
  ALTER COLUMN details TYPE jsonb
  USING CASE
    WHEN details IS NULL THEN NULL
    WHEN details ~ '^\s*[\{\[]' THEN details::jsonb
    ELSE jsonb_build_object('raw', details)
  END;
