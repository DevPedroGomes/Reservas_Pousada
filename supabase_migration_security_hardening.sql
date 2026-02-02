-- Migration: Remover funcao executar_sql (Security Fix)
-- Sistema de Reservas - Pousada
-- Esta funcao permite execucao de SQL arbitrario e representa um risco de seguranca

-- ============================================
-- 1. REVOGAR PERMISSOES
-- ============================================

REVOKE EXECUTE ON FUNCTION public.executar_sql(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.executar_sql(TEXT) FROM authenticated;

-- ============================================
-- 2. REMOVER A FUNCAO
-- ============================================

DROP FUNCTION IF EXISTS public.executar_sql(TEXT);

-- ============================================
-- 3. VERIFICACAO
-- ============================================

DO $$
BEGIN
  RAISE NOTICE 'Funcao executar_sql removida com sucesso!';
  RAISE NOTICE 'Esta funcao permitia execucao de SQL arbitrario.';
  RAISE NOTICE 'O codigo do backend foi atualizado para nao depender dela.';
END $$;
