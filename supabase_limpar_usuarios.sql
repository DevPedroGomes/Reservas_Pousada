-- Script para limpar dados de usuários e testar auth do zero
-- Execute no Supabase SQL Editor

-- ============================================
-- 1. LIMPAR DADOS (ordem importante por FK)
-- ============================================

-- Limpar refresh tokens
DELETE FROM refresh_tokens;

-- Limpar logs
DELETE FROM logs;

-- Limpar reservas
DELETE FROM reservas;

-- Limpar usuários
DELETE FROM usuarios;

-- Limpar pousadas
DELETE FROM pousadas;

-- ============================================
-- 2. RESETAR SEQUENCES (IDs voltam para 1)
-- ============================================

ALTER SEQUENCE IF EXISTS usuarios_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS pousadas_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS reservas_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS logs_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS refresh_tokens_id_seq RESTART WITH 1;

-- ============================================
-- 3. VERIFICAR LIMPEZA
-- ============================================

SELECT 'usuarios' as tabela, COUNT(*) as registros FROM usuarios
UNION ALL
SELECT 'pousadas', COUNT(*) FROM pousadas
UNION ALL
SELECT 'reservas', COUNT(*) FROM reservas
UNION ALL
SELECT 'refresh_tokens', COUNT(*) FROM refresh_tokens
UNION ALL
SELECT 'logs', COUNT(*) FROM logs;

-- Resultado esperado: todas as tabelas com 0 registros
