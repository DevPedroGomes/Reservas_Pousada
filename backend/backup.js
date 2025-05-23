/**
 * Script para realizar backup dos dados do Supabase em formato JSON
 * Usado em agendamentos de tarefas
 */
const fs = require('fs');
const path = require('path');
const { supabase } = require('./database/db');

// Configurações
const backupDir = path.join(__dirname, 'backup');
const date = new Date().toISOString().split('T')[0];
const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
const backupPath = path.join(backupDir, `pousada-${date}-${timestamp}.json`);

// Criar pasta de backup se não existir
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
  console.log(`Diretório de backup criado: ${backupDir}`);
}

// Limitar número de backups (manter os 10 mais recentes)
const limparBackupsAntigos = () => {
  if (fs.existsSync(backupDir)) {
    const files = fs.readdirSync(backupDir)
      .filter(file => file.startsWith('pousada-') && file.endsWith('.json'))
      .map(file => ({
        name: file,
        path: path.join(backupDir, file),
        time: fs.statSync(path.join(backupDir, file)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);
    
    // Manter apenas os 10 backups mais recentes
    if (files.length > 10) {
      files.slice(10).forEach(file => {
        try {
          fs.unlinkSync(file.path);
          console.log(`Backup antigo removido: ${file.name}`);
        } catch (err) {
          console.error(`Erro ao remover backup antigo ${file.name}:`, err);
        }
      });
    }
  }
};

// Realizar backup
console.log(`Iniciando backup para: ${backupPath}`);

// Função para fazer backup dos dados
async function realizarBackup() {
  try {
    // Extrair usuários
    const { data: usuarios, error: usuariosError } = await supabase
      .from('usuarios')
      .select('*');
    
    if (usuariosError) throw usuariosError;
    
    // Extrair reservas
    const { data: reservas, error: reservasError } = await supabase
      .from('reservas')
      .select('*');
    
    if (reservasError) throw reservasError;
    
    // Criar objeto de backup
    const backup = {
      timestamp: new Date().toISOString(),
      usuarios,
      reservas
    };
    
    // Salvar em arquivo JSON
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
    console.log(`Backup concluído com sucesso!`);
    
    // Limpar backups antigos
    limparBackupsAntigos();
    
    return backupPath;
  } catch (error) {
    console.error('Erro ao realizar backup:', error);
    throw error;
  }
}

// Executar backup
realizarBackup()
  .then(() => console.log('Processo de backup finalizado'))
  .catch(err => {
    console.error('Erro fatal durante o backup:', err);
    process.exit(1);
  }); 