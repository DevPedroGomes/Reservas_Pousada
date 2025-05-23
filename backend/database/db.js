require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

// Configuração do cliente Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('ERRO: Variáveis de ambiente SUPABASE_URL e SUPABASE_KEY são obrigatórias');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Inicializa o banco de dados, criando tabelas se não existirem
 * e inserindo dados iniciais
 */
async function initDatabase() {
  try {
    console.log('Inicializando banco de dados...');
    
    // Verificar conexão com o Supabase
    const { data, error } = await supabase.from('usuarios').select('count').limit(1);
    
    if (error) {
      // Se a tabela não existe, vamos criar as tabelas
      await criarTabelaUsuarios();
      await criarTabelaReservas();
      await inserirUsuarioPadrao();
    } else {
      console.log('Conexão com o banco de dados estabelecida com sucesso');
    }
    
    console.log('Banco de dados inicializado com sucesso!');
    return true;
  } catch (error) {
    console.error('Erro ao inicializar banco de dados:', error);
    throw error;
  }
}

/**
 * Cria a tabela de usuários
 */
async function criarTabelaUsuarios() {
  console.log('Criando tabela de usuários...');
  
  const { error } = await supabase.rpc('criar_tabela_usuarios');
  
  if (error) {
    console.error('Erro ao criar tabela de usuários:', error);
    
    // Aqui executamos o SQL diretamente pelo cliente (pode precisar de permissões extras)
    await supabase.rpc('executar_sql', { 
      sql_query: `
        CREATE TABLE IF NOT EXISTS usuarios (
          id SERIAL PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          nome TEXT NOT NULL,
          role TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `
    });
  }
}

/**
 * Cria a tabela de reservas
 */
async function criarTabelaReservas() {
  console.log('Criando tabela de reservas...');
  
  const { error } = await supabase.rpc('criar_tabela_reservas');
  
  if (error) {
    console.error('Erro ao criar tabela de reservas:', error);
    
    // Aqui executamos o SQL diretamente pelo cliente
    await supabase.rpc('executar_sql', { 
      sql_query: `
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
      `
    });
  }
}

/**
 * Insere o usuário administrador padrão se não existir
 */
async function inserirUsuarioPadrao() {
  console.log('Verificando usuário padrão...');
  
  // Verificar se o usuário admin já existe
  const { data, error } = await supabase
    .from('usuarios')
    .select('id')
    .eq('username', 'admin')
    .limit(1);
    
  if (error) {
    console.error('Erro ao verificar usuário padrão:', error);
    throw error;
  }
    
  // Se não existir, criar o usuário admin
  if (!data || data.length === 0) {
    console.log('Criando usuário padrão...');
    
    const salt = bcrypt.genSaltSync(10);
    const defaultUsername = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
    const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
    const hash = bcrypt.hashSync(defaultPassword, salt);
    
    const { error: insertError } = await supabase
      .from('usuarios')
      .insert([{
        username: defaultUsername,
        password: hash,
        nome: 'Administrador',
        role: 'admin'
      }]);
      
    if (insertError) {
      console.error('Erro ao criar usuário padrão:', insertError);
      throw insertError;
    }
    
    console.log('Usuário padrão criado com sucesso!');
  } else {
    console.log('Usuário padrão já existe');
  }
}

/**
 * Função para fazer backup do banco de dados (não aplicável ao Supabase diretamente,
 * será necessário extrair os dados e salvar em um formato alternativo)
 */
async function backupDatabase(backupPath) {
  console.log('Iniciando backup dos dados...');
  
  try {
    // Extrair usuários
    const { data: usuarios, error: userError } = await supabase.from('usuarios').select('*');
    if (userError) throw userError;
    
    // Extrair reservas
    const { data: reservas, error: reservasError } = await supabase.from('reservas').select('*');
    if (reservasError) throw reservasError;
    
    // Criar objeto de backup
    const backup = {
      data_backup: new Date().toISOString(),
      usuarios,
      reservas
    };
    
    // Salvar como JSON
    const fs = require('fs');
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
    
    console.log(`Backup salvo em: ${backupPath}`);
    return backupPath;
  } catch (error) {
    console.error('Erro ao realizar backup:', error);
    throw error;
  }
}

module.exports = {
  supabase,
  initDatabase,
  backupDatabase
}; 