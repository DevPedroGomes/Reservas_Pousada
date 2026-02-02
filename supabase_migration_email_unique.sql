-- Migration: Email Unique Constraint
-- Sistema de Reservas - Pousada
-- Execute APÓS supabase_migration_multitenant.sql

-- ============================================
-- 1. ADICIONAR CONSTRAINT UNIQUE NO EMAIL
-- ============================================

-- Primeiro, verificar se há emails duplicados
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT email, COUNT(*)
    FROM usuarios
    WHERE email IS NOT NULL
    GROUP BY email
    HAVING COUNT(*) > 1
  ) duplicates;

  IF duplicate_count > 0 THEN
    RAISE NOTICE 'Atenção: Existem % emails duplicados. Corrija antes de adicionar constraint.', duplicate_count;
  ELSE
    RAISE NOTICE 'Nenhum email duplicado encontrado.';
  END IF;
END $$;

-- Adicionar constraint UNIQUE no email (permite NULL)
-- Múltiplos NULLs são permitidos, mas emails não-nulos devem ser únicos
ALTER TABLE usuarios
ADD CONSTRAINT usuarios_email_unique UNIQUE (email);

-- ============================================
-- 2. ADICIONAR CONSTRAINT UNIQUE NO GOOGLE_ID
-- ============================================

ALTER TABLE usuarios
ADD CONSTRAINT usuarios_google_id_unique UNIQUE (google_id);

-- ============================================
-- 3. ÍNDICE PARA BUSCA RÁPIDA
-- ============================================

-- O índice já existe, mas garantir
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usuarios_google_id ON usuarios(google_id) WHERE google_id IS NOT NULL;

-- ============================================
-- 4. MENSAGEM DE CONFIRMAÇÃO
-- ============================================

DO $$
BEGIN
  RAISE NOTICE 'Migration email_unique concluída!';
  RAISE NOTICE 'Constraint UNIQUE adicionada em usuarios.email';
  RAISE NOTICE 'Constraint UNIQUE adicionada em usuarios.google_id';
END $$;
