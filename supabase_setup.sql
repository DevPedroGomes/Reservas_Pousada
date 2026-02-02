-- ============================================
-- Schema Unificado - Sistema de Reservas Multi-tenant
-- Versao: 2.0 (Consolidado)
--
-- Execute este script em um projeto Supabase NOVO
-- Todas as tabelas, indices, RLS e funcoes estao incluidas
-- ============================================

-- ============================================
-- 0. EXTENSOES NECESSARIAS
-- ============================================

CREATE EXTENSION IF NOT EXISTS unaccent;

-- ============================================
-- 1. FUNCOES AUXILIARES (triggers e helpers)
-- ============================================

-- Trigger para atualizar timestamp updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Funcao para gerar slug unico (URLs amigaveis)
CREATE OR REPLACE FUNCTION generate_slug(name TEXT)
RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
BEGIN
  -- Normalizar: lowercase, remover acentos, substituir espacos por hifens
  base_slug := lower(unaccent(name));
  base_slug := regexp_replace(base_slug, '[^a-z0-9\s]', '', 'g');
  base_slug := regexp_replace(base_slug, '\s+', '-', 'g');
  base_slug := trim(both '-' from base_slug);

  final_slug := base_slug;

  -- Verificar unicidade e adicionar numero se necessario
  WHILE EXISTS (SELECT 1 FROM pousadas WHERE slug = final_slug) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;

  RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- Funcao para definir contexto RLS (chamada pelo backend)
CREATE OR REPLACE FUNCTION set_current_user_context(p_user_id INTEGER, p_pousada_id INTEGER DEFAULT NULL)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.current_user_id', COALESCE(p_user_id, 0)::TEXT, true);
  PERFORM set_config('app.current_pousada_id', COALESCE(p_pousada_id, 0)::TEXT, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 2. TABELA POUSADAS (primeira para FKs)
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

-- Indices para pousadas
CREATE INDEX IF NOT EXISTS idx_pousadas_slug ON pousadas(slug);
CREATE INDEX IF NOT EXISTS idx_pousadas_ativa ON pousadas(ativa);

-- Trigger updated_at
CREATE TRIGGER set_pousadas_updated_at
BEFORE UPDATE ON pousadas
FOR EACH ROW
EXECUTE PROCEDURE update_updated_at_column();

-- ============================================
-- 3. TABELA USUARIOS
-- ============================================

CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  nome TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'recepcao',
  email TEXT,
  google_id TEXT,
  avatar_url TEXT,
  pousada_id INTEGER REFERENCES pousadas(id) ON DELETE SET NULL,
  is_owner BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Constraints UNIQUE (permite NULL, mas nao-nulos devem ser unicos)
ALTER TABLE usuarios ADD CONSTRAINT usuarios_email_unique UNIQUE (email);
ALTER TABLE usuarios ADD CONSTRAINT usuarios_google_id_unique UNIQUE (google_id);

-- Indices para usuarios
CREATE INDEX IF NOT EXISTS idx_usuarios_pousada ON usuarios(pousada_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usuarios_google_id ON usuarios(google_id) WHERE google_id IS NOT NULL;

-- Trigger updated_at
CREATE TRIGGER set_usuarios_updated_at
BEFORE UPDATE ON usuarios
FOR EACH ROW
EXECUTE PROCEDURE update_updated_at_column();

-- ============================================
-- 4. TABELA RESERVAS
-- ============================================

CREATE TABLE IF NOT EXISTS reservas (
  id SERIAL PRIMARY KEY,
  pousada_id INTEGER NOT NULL REFERENCES pousadas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cpf TEXT NOT NULL,
  quarto INTEGER NOT NULL,
  data_entrada DATE NOT NULL,
  data_saida DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativa',
  valor NUMERIC,
  pago BOOLEAN DEFAULT FALSE,
  observacoes TEXT,
  criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices para reservas
CREATE INDEX IF NOT EXISTS idx_reservas_pousada ON reservas(pousada_id);
CREATE INDEX IF NOT EXISTS idx_reservas_status ON reservas(status);
CREATE INDEX IF NOT EXISTS idx_reservas_pago ON reservas(pago);
CREATE INDEX IF NOT EXISTS idx_reservas_datas ON reservas(data_entrada, data_saida);
CREATE INDEX IF NOT EXISTS idx_reservas_quarto_datas ON reservas(pousada_id, quarto, data_entrada, data_saida);

-- Trigger updated_at
CREATE TRIGGER set_reservas_updated_at
BEFORE UPDATE ON reservas
FOR EACH ROW
EXECUTE PROCEDURE update_updated_at_column();

-- ============================================
-- 5. TABELA LOGS (auditoria)
-- ============================================

CREATE TABLE IF NOT EXISTS logs (
  id SERIAL PRIMARY KEY,
  pousada_id INTEGER REFERENCES pousadas(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices para logs
CREATE INDEX IF NOT EXISTS idx_logs_pousada ON logs(pousada_id);
CREATE INDEX IF NOT EXISTS idx_logs_user ON logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_action ON logs(action);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at);
CREATE INDEX IF NOT EXISTS idx_logs_entity ON logs(entity, entity_id);

-- ============================================
-- 6. TABELA REFRESH_TOKENS
-- ============================================

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_selector VARCHAR(32) NOT NULL,  -- Primeiros 32 chars para busca O(1)
  token_hash TEXT NOT NULL,              -- Hash bcrypt do restante (verifier)
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN DEFAULT FALSE,
  user_agent TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices para refresh_tokens
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_selector ON refresh_tokens(token_selector) WHERE revoked = false;
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- ============================================
-- 7. HABILITAR ROW LEVEL SECURITY
-- ============================================

ALTER TABLE pousadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservas ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 8. POLITICAS RLS - POUSADAS
-- ============================================

-- Usuarios podem ver apenas sua propria pousada
CREATE POLICY "pousadas_select_own" ON pousadas
FOR SELECT TO authenticated
USING (
  id IN (
    SELECT pousada_id FROM usuarios
    WHERE id = NULLIF(current_setting('app.current_user_id', true), '')::INTEGER
  )
);

-- Owners podem atualizar sua pousada
CREATE POLICY "pousadas_update_owner" ON pousadas
FOR UPDATE TO authenticated
USING (
  id IN (
    SELECT pousada_id FROM usuarios
    WHERE id = NULLIF(current_setting('app.current_user_id', true), '')::INTEGER
    AND is_owner = TRUE
  )
);

-- Qualquer um pode criar uma pousada (durante onboarding)
CREATE POLICY "pousadas_insert_any" ON pousadas
FOR INSERT TO authenticated, anon
WITH CHECK (true);

-- ============================================
-- 9. POLITICAS RLS - USUARIOS
-- ============================================

-- Usuarios veem apenas colegas da mesma pousada (ou sem pousada durante registro)
CREATE POLICY "usuarios_select_same_pousada" ON usuarios
FOR SELECT TO authenticated, anon
USING (
  pousada_id IS NULL
  OR pousada_id IN (
    SELECT pousada_id FROM usuarios
    WHERE id = NULLIF(current_setting('app.current_user_id', true), '')::INTEGER
  )
);

-- Usuarios podem atualizar seu proprio perfil
CREATE POLICY "usuarios_update_self" ON usuarios
FOR UPDATE TO authenticated
USING (
  id = NULLIF(current_setting('app.current_user_id', true), '')::INTEGER
);

-- Admins/Owners podem gerenciar usuarios da pousada
CREATE POLICY "usuarios_manage_by_admin" ON usuarios
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.id = NULLIF(current_setting('app.current_user_id', true), '')::INTEGER
    AND u.pousada_id = usuarios.pousada_id
    AND (u.role = 'admin' OR u.is_owner = TRUE)
  )
);

-- Permitir insercao durante registro (anon e authenticated)
CREATE POLICY "usuarios_insert_any" ON usuarios
FOR INSERT TO authenticated, anon
WITH CHECK (true);

-- ============================================
-- 10. POLITICAS RLS - RESERVAS
-- ============================================

-- Usuarios veem apenas reservas da sua pousada
CREATE POLICY "reservas_access_same_pousada" ON reservas
FOR ALL TO authenticated
USING (
  pousada_id IN (
    SELECT pousada_id FROM usuarios
    WHERE id = NULLIF(current_setting('app.current_user_id', true), '')::INTEGER
  )
);

-- ============================================
-- 11. POLITICAS RLS - LOGS
-- ============================================

-- Usuarios veem apenas logs da sua pousada
CREATE POLICY "logs_access_same_pousada" ON logs
FOR ALL TO authenticated
USING (
  pousada_id IN (
    SELECT pousada_id FROM usuarios
    WHERE id = NULLIF(current_setting('app.current_user_id', true), '')::INTEGER
  )
);

-- ============================================
-- 12. POLITICAS RLS - REFRESH_TOKENS
-- ============================================

-- Usuarios so acessam seus proprios tokens
CREATE POLICY "tokens_access_own" ON refresh_tokens
FOR ALL TO authenticated
USING (
  user_id = NULLIF(current_setting('app.current_user_id', true), '')::INTEGER
);

-- Permitir insercao de tokens (para login)
CREATE POLICY "tokens_insert_any" ON refresh_tokens
FOR INSERT TO authenticated, anon
WITH CHECK (true);

-- ============================================
-- 13. FUNCOES DE NEGOCIO
-- ============================================

-- Funcao para criar pousada com owner (onboarding)
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
  -- Gerar slug unico
  v_slug := generate_slug(p_nome);

  -- Criar pousada
  INSERT INTO pousadas (nome, slug, num_quartos, endereco, cidade, estado, cep, telefone, email, logo_url, descricao)
  VALUES (p_nome, v_slug, p_num_quartos, p_endereco, p_cidade, p_estado, p_cep, p_telefone, p_email, p_logo_url, p_descricao)
  RETURNING id INTO v_pousada_id;

  -- Atualizar usuario como owner
  UPDATE usuarios
  SET pousada_id = v_pousada_id, is_owner = TRUE, role = 'admin'
  WHERE id = p_user_id;

  RETURN v_pousada_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Funcao para adicionar usuario a pousada
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

-- Funcao para obter estatisticas da pousada
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
  -- Obter numero de quartos da pousada
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

-- Funcao para registrar log de atividade
CREATE OR REPLACE FUNCTION log_activity(
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
-- 14. GRANT PERMISSOES
-- ============================================

-- Funcoes podem ser executadas por authenticated e anon
GRANT EXECUTE ON FUNCTION update_updated_at_column TO authenticated, anon;
GRANT EXECUTE ON FUNCTION generate_slug TO authenticated, anon;
GRANT EXECUTE ON FUNCTION set_current_user_context TO authenticated, anon;
GRANT EXECUTE ON FUNCTION criar_pousada_com_owner TO authenticated;
GRANT EXECUTE ON FUNCTION adicionar_usuario_pousada TO authenticated;
GRANT EXECUTE ON FUNCTION get_pousada_stats TO authenticated;
GRANT EXECUTE ON FUNCTION log_activity TO authenticated;

-- ============================================
-- 15. MENSAGEM DE CONFIRMACAO
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Schema unificado criado com sucesso!';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Tabelas: pousadas, usuarios, reservas, logs, refresh_tokens';
  RAISE NOTICE 'RLS: Habilitado em todas as tabelas';
  RAISE NOTICE 'Multi-tenant: Configurado via pousada_id';
  RAISE NOTICE 'Token selector: Habilitado para performance O(1)';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'IMPORTANTE: O backend deve chamar set_current_user_context()';
  RAISE NOTICE 'antes de cada requisicao para RLS funcionar corretamente.';
  RAISE NOTICE '============================================';
END $$;
