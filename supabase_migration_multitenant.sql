-- Migration: Multi-tenant Support
-- Sistema de Reservas - Pousada
-- Execute este script APÓS o supabase_setup.sql inicial

-- ============================================
-- 1. CRIAR TABELA POUSADAS
-- ============================================

CREATE TABLE IF NOT EXISTS pousadas (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  num_quartos INTEGER NOT NULL CHECK (num_quartos >= 1 AND num_quartos <= 100),
  endereco TEXT NOT NULL,
  cidade TEXT,
  estado TEXT,
  cep TEXT,
  telefone TEXT NOT NULL,
  email TEXT NOT NULL,
  logo_url TEXT,
  descricao TEXT,
  configuracoes JSONB DEFAULT '{}',
  ativa BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para updated_at em pousadas
CREATE TRIGGER set_pousadas_updated_at
BEFORE UPDATE ON pousadas
FOR EACH ROW
EXECUTE PROCEDURE update_updated_at_column();

-- Índices para pousadas
CREATE INDEX IF NOT EXISTS idx_pousadas_slug ON pousadas(slug);
CREATE INDEX IF NOT EXISTS idx_pousadas_ativa ON pousadas(ativa);

-- ============================================
-- 2. MODIFICAR TABELA USUARIOS
-- ============================================

-- Adicionar novas colunas
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pousada_id INTEGER REFERENCES pousadas(id) ON DELETE SET NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS google_id TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS is_owner BOOLEAN DEFAULT FALSE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Índices para novas colunas
CREATE INDEX IF NOT EXISTS idx_usuarios_pousada ON usuarios(pousada_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_google_id ON usuarios(google_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);

-- Trigger para updated_at em usuarios
DROP TRIGGER IF EXISTS set_usuarios_updated_at ON usuarios;
CREATE TRIGGER set_usuarios_updated_at
BEFORE UPDATE ON usuarios
FOR EACH ROW
EXECUTE PROCEDURE update_updated_at_column();

-- ============================================
-- 3. MODIFICAR TABELA RESERVAS
-- ============================================

-- Adicionar coluna pousada_id
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS pousada_id INTEGER REFERENCES pousadas(id) ON DELETE CASCADE;

-- Índice para pousada_id
CREATE INDEX IF NOT EXISTS idx_reservas_pousada ON reservas(pousada_id);

-- ============================================
-- 4. MODIFICAR TABELA LOGS
-- ============================================

-- Adicionar coluna pousada_id para auditoria
ALTER TABLE logs ADD COLUMN IF NOT EXISTS pousada_id INTEGER REFERENCES pousadas(id) ON DELETE CASCADE;

-- Índice
CREATE INDEX IF NOT EXISTS idx_logs_pousada ON logs(pousada_id);

-- ============================================
-- 5. HABILITAR RLS EM POUSADAS
-- ============================================

ALTER TABLE pousadas ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 6. CRIAR POLÍTICAS RLS PARA MULTI-TENANT
-- ============================================

-- Remover políticas antigas (se existirem)
DROP POLICY IF EXISTS "Acesso total para usuários autenticados" ON usuarios;
DROP POLICY IF EXISTS "Acesso total para usuários autenticados" ON reservas;
DROP POLICY IF EXISTS "Acesso total para usuários autenticados" ON logs;

-- Políticas para POUSADAS
-- Usuários podem ver apenas sua própria pousada
CREATE POLICY "usuarios_view_own_pousada" ON pousadas
FOR SELECT TO authenticated
USING (
  id IN (
    SELECT pousada_id FROM usuarios WHERE id = current_setting('app.current_user_id', true)::INTEGER
  )
);

-- Owners podem atualizar sua pousada
CREATE POLICY "owners_update_pousada" ON pousadas
FOR UPDATE TO authenticated
USING (
  id IN (
    SELECT pousada_id FROM usuarios
    WHERE id = current_setting('app.current_user_id', true)::INTEGER
    AND is_owner = TRUE
  )
);

-- Qualquer um pode criar uma pousada (durante onboarding)
CREATE POLICY "anyone_create_pousada" ON pousadas
FOR INSERT TO authenticated
WITH CHECK (true);

-- Políticas para USUARIOS
-- Usuários veem apenas colegas da mesma pousada
CREATE POLICY "usuarios_view_same_pousada" ON usuarios
FOR SELECT TO authenticated
USING (
  pousada_id IN (
    SELECT pousada_id FROM usuarios WHERE id = current_setting('app.current_user_id', true)::INTEGER
  )
  OR pousada_id IS NULL
);

-- Usuários podem atualizar seu próprio perfil
CREATE POLICY "usuarios_update_self" ON usuarios
FOR UPDATE TO authenticated
USING (
  id = current_setting('app.current_user_id', true)::INTEGER
);

-- Admins/Owners podem gerenciar usuários da pousada
CREATE POLICY "admins_manage_usuarios" ON usuarios
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.id = current_setting('app.current_user_id', true)::INTEGER
    AND u.pousada_id = usuarios.pousada_id
    AND (u.role = 'admin' OR u.is_owner = TRUE)
  )
);

-- Permitir inserção durante registro
CREATE POLICY "anyone_insert_usuario" ON usuarios
FOR INSERT TO authenticated, anon
WITH CHECK (true);

-- Políticas para RESERVAS
-- Usuários veem apenas reservas da sua pousada
CREATE POLICY "reservas_same_pousada" ON reservas
FOR ALL TO authenticated
USING (
  pousada_id IN (
    SELECT pousada_id FROM usuarios WHERE id = current_setting('app.current_user_id', true)::INTEGER
  )
);

-- Políticas para LOGS
-- Usuários veem apenas logs da sua pousada
CREATE POLICY "logs_same_pousada" ON logs
FOR ALL TO authenticated
USING (
  pousada_id IN (
    SELECT pousada_id FROM usuarios WHERE id = current_setting('app.current_user_id', true)::INTEGER
  )
);

-- Política para REFRESH_TOKENS (mantém acesso total - tokens são por usuário)
DROP POLICY IF EXISTS "Acesso total para usuários autenticados" ON refresh_tokens;
CREATE POLICY "users_own_tokens" ON refresh_tokens
FOR ALL TO authenticated
USING (
  user_id = current_setting('app.current_user_id', true)::INTEGER
);

-- Permitir inserção de tokens
CREATE POLICY "insert_tokens" ON refresh_tokens
FOR INSERT TO authenticated, anon
WITH CHECK (true);

-- ============================================
-- 7. FUNÇÕES AUXILIARES
-- ============================================

-- Função para gerar slug único
CREATE OR REPLACE FUNCTION generate_slug(name TEXT)
RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
BEGIN
  -- Normalizar: lowercase, remover acentos, substituir espaços por hífens
  base_slug := lower(unaccent(name));
  base_slug := regexp_replace(base_slug, '[^a-z0-9\s]', '', 'g');
  base_slug := regexp_replace(base_slug, '\s+', '-', 'g');
  base_slug := trim(both '-' from base_slug);

  final_slug := base_slug;

  -- Verificar unicidade e adicionar número se necessário
  WHILE EXISTS (SELECT 1 FROM pousadas WHERE slug = final_slug) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;

  RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- Habilitar extensão unaccent se não existir
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Função para criar pousada com owner
CREATE OR REPLACE FUNCTION criar_pousada_com_owner(
  p_nome TEXT,
  p_num_quartos INTEGER,
  p_endereco TEXT,
  p_telefone TEXT,
  p_email TEXT,
  p_user_id INTEGER,
  p_cidade TEXT DEFAULT NULL,
  p_estado TEXT DEFAULT NULL,
  p_cep TEXT DEFAULT NULL,
  p_logo_url TEXT DEFAULT NULL,
  p_descricao TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_pousada_id INTEGER;
  v_slug TEXT;
BEGIN
  -- Gerar slug único
  v_slug := generate_slug(p_nome);

  -- Criar pousada
  INSERT INTO pousadas (nome, slug, num_quartos, endereco, cidade, estado, cep, telefone, email, logo_url, descricao)
  VALUES (p_nome, v_slug, p_num_quartos, p_endereco, p_cidade, p_estado, p_cep, p_telefone, p_email, p_logo_url, p_descricao)
  RETURNING id INTO v_pousada_id;

  -- Atualizar usuário como owner
  UPDATE usuarios
  SET pousada_id = v_pousada_id, is_owner = TRUE, role = 'admin'
  WHERE id = p_user_id;

  RETURN v_pousada_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para adicionar usuário à pousada
CREATE OR REPLACE FUNCTION adicionar_usuario_pousada(
  p_pousada_id INTEGER,
  p_user_id INTEGER,
  p_role TEXT DEFAULT 'recepcao'
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE usuarios
  SET pousada_id = p_pousada_id, role = p_role
  WHERE id = p_user_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para obter estatísticas da pousada
CREATE OR REPLACE FUNCTION get_pousada_stats(p_pousada_id INTEGER)
RETURNS TABLE (
  total_reservas BIGINT,
  reservas_ativas BIGINT,
  reservas_hoje BIGINT,
  quartos_ocupados BIGINT,
  taxa_ocupacao NUMERIC,
  receita_total NUMERIC,
  receita_pendente NUMERIC
) AS $$
DECLARE
  v_num_quartos INTEGER;
BEGIN
  -- Obter número de quartos da pousada
  SELECT num_quartos INTO v_num_quartos FROM pousadas WHERE id = p_pousada_id;

  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_reservas,
    COUNT(*) FILTER (WHERE r.status = 'ativa')::BIGINT AS reservas_ativas,
    COUNT(*) FILTER (WHERE r.status = 'ativa' AND (r.data_entrada = CURRENT_DATE OR r.data_saida = CURRENT_DATE))::BIGINT AS reservas_hoje,
    COUNT(DISTINCT r.quarto) FILTER (WHERE r.status = 'ativa' AND r.data_entrada <= CURRENT_DATE AND r.data_saida >= CURRENT_DATE)::BIGINT AS quartos_ocupados,
    ROUND(
      (COUNT(DISTINCT r.quarto) FILTER (WHERE r.status = 'ativa' AND r.data_entrada <= CURRENT_DATE AND r.data_saida >= CURRENT_DATE)::NUMERIC / NULLIF(v_num_quartos, 0)) * 100,
      2
    ) AS taxa_ocupacao,
    COALESCE(SUM(r.valor) FILTER (WHERE r.pago = TRUE), 0) AS receita_total,
    COALESCE(SUM(r.valor) FILTER (WHERE r.pago = FALSE AND r.status = 'ativa'), 0) AS receita_pendente
  FROM reservas r
  WHERE r.pousada_id = p_pousada_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para log de atividade com pousada_id
CREATE OR REPLACE FUNCTION log_activity_pousada(
  p_user_id INTEGER,
  p_pousada_id INTEGER,
  p_action TEXT,
  p_entity TEXT,
  p_entity_id INTEGER,
  p_details JSONB,
  p_ip_address TEXT
)
RETURNS void AS $$
BEGIN
  INSERT INTO logs (user_id, pousada_id, action, entity, entity_id, details, ip_address)
  VALUES (p_user_id, p_pousada_id, p_action, p_entity, p_entity_id, p_details, p_ip_address);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 8. GRANT PERMISSÕES
-- ============================================

GRANT EXECUTE ON FUNCTION generate_slug TO authenticated;
GRANT EXECUTE ON FUNCTION criar_pousada_com_owner TO authenticated;
GRANT EXECUTE ON FUNCTION adicionar_usuario_pousada TO authenticated;
GRANT EXECUTE ON FUNCTION get_pousada_stats TO authenticated;
GRANT EXECUTE ON FUNCTION log_activity_pousada TO authenticated;

-- ============================================
-- 9. MENSAGEM DE CONFIRMAÇÃO
-- ============================================

DO $$
BEGIN
  RAISE NOTICE 'Migration multi-tenant concluída com sucesso!';
  RAISE NOTICE 'Tabela pousadas criada';
  RAISE NOTICE 'Colunas adicionadas em usuarios, reservas e logs';
  RAISE NOTICE 'Políticas RLS configuradas para isolamento multi-tenant';
  RAISE NOTICE 'Funções auxiliares criadas';
END $$;
