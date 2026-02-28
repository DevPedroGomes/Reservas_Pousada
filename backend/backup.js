/**
 * Script para realizar backup do PostgreSQL em formato JSON
 * Usa a mesma DATABASE_URL do backend
 *
 * Uso: node backup.js
 * Ou via npm: npm run backup (requer tsx para carregar .env)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar DATABASE_URL do ambiente
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('ERRO: DATABASE_URL nao definida. Execute com: tsx backup.js (carrega .env via dotenv)');
  process.exit(1);
}

// Configuracoes
const backupDir = path.join(__dirname, 'backup');
const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
const date = new Date().toISOString().split('T')[0];
const backupPath = path.join(backupDir, `pousada-${date}-${timestamp}.json`);

// Criar pasta de backup se nao existir
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
  console.log(`Diretorio de backup criado: ${backupDir}`);
}

// Limitar numero de backups (manter os 10 mais recentes)
function limparBackupsAntigos() {
  if (!fs.existsSync(backupDir)) return;

  const files = fs.readdirSync(backupDir)
    .filter(file => file.startsWith('pousada-') && file.endsWith('.json'))
    .map(file => ({
      name: file,
      path: path.join(backupDir, file),
      time: fs.statSync(path.join(backupDir, file)).mtime.getTime()
    }))
    .sort((a, b) => b.time - a.time);

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

// Realizar backup via PostgreSQL direto
async function realizarBackup() {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 2,
    connectionTimeoutMillis: 5000,
  });

  try {
    console.log(`Iniciando backup para: ${backupPath}`);

    // Extrair usuarios (sem campo password/tokens por seguranca)
    const { rows: usuarios } = await pool.query(
      'SELECT id, name, email, role, pousada_id, is_owner, created_at, updated_at FROM "user"'
    );

    // Extrair pousadas
    const { rows: pousadas } = await pool.query(
      'SELECT * FROM pousadas'
    );

    // Extrair reservas
    const { rows: reservas } = await pool.query(
      'SELECT * FROM reservas ORDER BY created_at DESC'
    );

    // Extrair auditoria
    const { rows: auditoria } = await pool.query(
      'SELECT * FROM auditoria ORDER BY created_at DESC LIMIT 1000'
    );

    // Criar objeto de backup
    const backup = {
      timestamp: new Date().toISOString(),
      versao: '2.0',
      totais: {
        usuarios: usuarios.length,
        pousadas: pousadas.length,
        reservas: reservas.length,
        auditoria: auditoria.length,
      },
      usuarios,
      pousadas,
      reservas,
      auditoria,
    };

    // Salvar em arquivo JSON
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
    console.log(`Backup concluido com sucesso!`);
    console.log(`  Usuarios: ${usuarios.length}`);
    console.log(`  Pousadas: ${pousadas.length}`);
    console.log(`  Reservas: ${reservas.length}`);
    console.log(`  Auditoria: ${auditoria.length}`);

    // Limpar backups antigos
    limparBackupsAntigos();

    return backupPath;
  } catch (error) {
    console.error('Erro ao realizar backup:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Executar
realizarBackup()
  .then(() => console.log('Processo de backup finalizado'))
  .catch(err => {
    console.error('Erro fatal durante o backup:', err);
    process.exit(1);
  });
