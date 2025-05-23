-- Configuração inicial do Supabase para Sistema de Reservas da Pousada
-- Execute este script no Editor SQL do Supabase para configurar as tabelas e funções necessárias

-- Funções para criar tabelas 
CREATE OR REPLACE FUNCTION criar_tabela_usuarios()
RETURNS void AS $$
BEGIN
  CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    nome TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION criar_tabela_reservas()
RETURNS void AS $$
BEGIN
  CREATE TABLE IF NOT EXISTS reservas (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    cpf TEXT NOT NULL,
    quarto INTEGER NOT NULL,
    data_entrada DATE NOT NULL,
    data_saida DATE NOT NULL,
    status TEXT NOT NULL,
    valor NUMERIC,
    pago BOOLEAN DEFAULT FALSE,
    observacoes TEXT,
    criado_por INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY(criado_por) REFERENCES usuarios(id)
  );
  
  CREATE INDEX IF NOT EXISTS idx_reservas_status ON reservas(status);
  CREATE INDEX IF NOT EXISTS idx_reservas_pago ON reservas(pago);
  CREATE INDEX IF NOT EXISTS idx_reservas_datas ON reservas(data_entrada, data_saida);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para executar SQL direto (use com cuidado)
CREATE OR REPLACE FUNCTION executar_sql(sql_query TEXT)
RETURNS void AS $$
BEGIN
  EXECUTE sql_query;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Tabela de logs para auditoria (opcional)
CREATE OR REPLACE FUNCTION criar_tabela_logs()
RETURNS void AS $$
BEGIN
  CREATE TABLE IF NOT EXISTS logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id INTEGER,
    details JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY(user_id) REFERENCES usuarios(id) ON DELETE SET NULL
  );
  
  CREATE INDEX IF NOT EXISTS idx_logs_user ON logs(user_id);
  CREATE INDEX IF NOT EXISTS idx_logs_action ON logs(action);
  CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para registrar log de atividade
CREATE OR REPLACE FUNCTION log_activity(
  p_user_id INTEGER,
  p_action TEXT, 
  p_entity TEXT,
  p_entity_id INTEGER,
  p_details JSONB,
  p_ip_address TEXT
)
RETURNS void AS $$
BEGIN
  INSERT INTO logs (user_id, action, entity, entity_id, details, ip_address)
  VALUES (p_user_id, p_action, p_entity, p_entity_id, p_details, p_ip_address);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para atualizar timestamp em reservas
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- Executar as funções para criar tabelas
SELECT criar_tabela_usuarios();
SELECT criar_tabela_reservas();
SELECT criar_tabela_logs();

-- Configurar triggers
CREATE TRIGGER set_reservas_updated_at
BEFORE UPDATE ON reservas
FOR EACH ROW
EXECUTE PROCEDURE update_updated_at_column();

-- Configurar permissões de acesso
ALTER TABLE IF EXISTS usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS reservas ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS logs ENABLE ROW LEVEL SECURITY;

-- Criar políticas de acesso (com autenticação JWT do Supabase)
CREATE POLICY "Acesso total para usuários autenticados" 
ON usuarios FOR ALL 
TO authenticated 
USING (true);

CREATE POLICY "Acesso total para usuários autenticados" 
ON reservas FOR ALL 
TO authenticated 
USING (true);

CREATE POLICY "Acesso total para usuários autenticados" 
ON logs FOR ALL 
TO authenticated 
USING (true);

-- Conceder acesso a funções
GRANT EXECUTE ON FUNCTION criar_tabela_usuarios TO anon, authenticated;
GRANT EXECUTE ON FUNCTION criar_tabela_reservas TO anon, authenticated;
GRANT EXECUTE ON FUNCTION criar_tabela_logs TO anon, authenticated;
GRANT EXECUTE ON FUNCTION executar_sql TO anon, authenticated;
GRANT EXECUTE ON FUNCTION log_activity TO anon, authenticated;

-- Mensagem de confirmação
DO $$
BEGIN
  RAISE NOTICE 'Configuração concluída com sucesso!';
END $$; 