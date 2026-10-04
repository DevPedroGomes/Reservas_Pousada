import 'dotenv/config';
import { app } from './app.js';
import { testConnection, closeConnection } from './db/index.js';
import { runMigrations } from './db/migrate.js';
import { assertCpfCryptoConfigurada } from './utils/crypto.js';
import { TIMEZONE } from './utils/datas.js';
import { avisarEstadoDoBilling } from './lib/stripe.js';
import { descarregarErros, iniciarObservabilidade, reportarErro } from './lib/observabilidade.js';
import { iniciarFila, pararFila } from './lib/fila.js';

const PORT = process.env.PORT || 4000;

// ==========================================
// Falhas fora do fluxo de requisição
// ==========================================
// O Express 5 entrega ao errorHandler as rejeições de handlers async, mas
// promessas soltas (um `.then` sem `.catch`, um timer) ainda podem rejeitar
// fora dele. No Node 22 isso encerra o processo por padrão — e com ele a API
// de todos os clientes. Aqui a rejeição vira log alto e o processo segue.
process.on('unhandledRejection', (motivo) => {
  console.error('[Processo] Promessa rejeitada sem tratamento:', motivo);
  reportarErro(motivo, { origem: 'unhandledRejection' });
});

// Exceção síncrona não capturada deixa o processo em estado desconhecido:
// registra e encerra para o Docker reiniciar limpo, em vez de seguir servindo
// com memória possivelmente corrompida.
process.on('uncaughtException', (erro) => {
  console.error('[Processo] Exceção não capturada — encerrando:', erro);
  reportarErro(erro, { origem: 'uncaughtException' });
  void descarregarErros().finally(() => process.exit(1));
});

async function iniciarServidor() {
  try {
    // Configuração de cifra de CPF — fatal, igual ao BETTER_AUTH_SECRET.
    //
    // Antes não havia validação nenhuma: subir sem CPF_ENCRYPTION_KEY fazia o
    // sistema funcionar normalmente e gravar TODOS os CPFs em texto puro, sem
    // erro e sem log, porque o caminho de falha era engolido por um catch.
    // Dado pessoal em claro é falha silenciosa cara demais para tolerar.
    try {
      assertCpfCryptoConfigurada();
    } catch (err) {
      console.error('ERRO CRÍTICO: cifra de CPF mal configurada —', err instanceof Error ? err.message : err);
      console.error('Gere a chave com: openssl rand -hex 32  (e defina CPF_ENCRYPTION_KEY)');
      process.exit(1);
    }

    // URL pública é obrigatória em produção: o fallback silencioso para
    // http://localhost:4000 quebra OAuth e links de email sem avisar.
    if (process.env.NODE_ENV === 'production' && !process.env.BETTER_AUTH_URL) {
      console.error('ERRO CRÍTICO: BETTER_AUTH_URL não definida em produção');
      process.exit(1);
    }

    avisarEstadoDoBilling();
    await iniciarObservabilidade();

    // Test database connection
    const dbOk = await testConnection();
    if (!dbOk) {
      console.error('Não foi possível conectar ao banco de dados');
      process.exit(1);
    }

    // Aplica migrations pendentes ANTES de aceitar tráfego. Deliberadamente
    // fatal: se o schema não puder ser levado ao estado esperado, o servidor não
    // sobe. É o oposto do que acontecia antes — schema divergente do código,
    // servidor no ar, e todo endpoint de reserva respondendo 500.
    await runMigrations();

    // Validate critical config
    if (process.env.NODE_ENV === 'production' && !process.env.RESEND_API_KEY) {
      console.warn('⚠ RESEND_API_KEY não definida — emails (convites, reset senha, verificação) NÃO serão enviados');
    }

    // Jobs em background (limpeza, finalização de estadias, e-mails com
    // retentativa). Antes era um setInterval por processo: com duas réplicas
    // rodava em dobro, e e-mail que falhava não era reenviado.
    await iniciarFila();

    // Start server
    const server = app.listen(PORT, () => {
      console.log(`Servidor rodando na porta ${PORT}`);
      console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
      console.log(`Fuso da operação: ${TIMEZONE}`);
      console.log(`Auth URL: ${process.env.BETTER_AUTH_URL || 'http://localhost:4000'}`);
    });

    // ==========================================
    // Graceful shutdown
    // ==========================================
    // Sem isto, todo deploy matava as requisições em voo no meio (o Docker
    // manda SIGTERM e o processo morria na hora) e o pool do Postgres nunca era
    // drenado. Uma reserva sendo gravada no instante do redeploy simplesmente
    // sumia, sem erro para o usuário.
    let encerrando = false;
    async function encerrar(sinal: string) {
      if (encerrando) return;
      encerrando = true;
      console.log(`[Shutdown] ${sinal} recebido — parando de aceitar conexões`);

      const prazo = setTimeout(() => {
        console.error('[Shutdown] Prazo esgotado (15s) — encerrando à força');
        process.exit(1);
      }, 15_000);
      prazo.unref();

      server.close(async (err) => {
        if (err) console.error('[Shutdown] Erro ao fechar o servidor HTTP:', err);
        try {
          await pararFila();
          await closeConnection();
        } catch (e) {
          console.error('[Shutdown] Erro ao fechar o pool:', e);
        }
        console.log('[Shutdown] Encerrado com sucesso');
        process.exit(err ? 1 : 0);
      });
    }

    process.on('SIGTERM', () => void encerrar('SIGTERM'));
    process.on('SIGINT', () => void encerrar('SIGINT'));
  } catch (err) {
    console.error('Erro ao inicializar a aplicação:', err);
    process.exit(1);
  }
}

iniciarServidor();

