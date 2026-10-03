import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './lib/auth.js';
import { bancoResponde, pool } from './db/index.js';
import reservaRoutes from './routes/reservas.js';
import pousadaRoutes from './routes/pousadas.js';
import conviteRoutes from './routes/convites.js';
import billingRoutes from './routes/billing.js';
import adminRoutes from './routes/admin.js';
import telemetriaRoutes from './routes/telemetria.js';
import contaRoutes from './routes/conta.js';
import stripeWebhookRoutes from './routes/stripe-webhook.js';
import { authMiddleware, requirePousada } from './middleware/auth.js';
import { activityLogger } from './middleware/activity.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { chaveDeRateLimit } from './utils/rede.js';
import { criarLimitador } from './utils/limitadores.js';
import { origensPermitidas } from './utils/origens.js';
import { requerAssinaturaAtiva } from './middleware/assinatura.js';
import { requestId } from './lib/observabilidade.js';

/**
 * Montagem do app Express — sem efeitos colaterais de boot (sem listen, sem
 * migrations, sem fila). Separado de server.ts para que os testes HTTP
 * subam a aplicação real numa porta qualquer.
 */
const app = express();

// Trust proxy (Traefik reverse proxy)
app.set('trust proxy', 1);

// Primeiro de tudo: todo log e toda resposta de erro carregam o mesmo id.
app.use(requestId);

// ==========================================
// Security Headers
// ==========================================
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  next();
});

// ==========================================
// CORS Configuration (MUST be before rate limiter)
// ==========================================
// Lista, nao valor unico: durante uma migracao de dominio o host antigo e o
// novo precisam responder ao mesmo tempo. Ver utils/origens.ts.
app.use(cors({
  origin: origensPermitidas(),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Pousada-Id'],
  credentials: true
}));

// ==========================================
// Rate Limiting
// ==========================================
// Teto por IP folgado de propósito: uma pousada inteira (recepção, dono,
// tablet do café) costuma sair por UM IP, e cada carga de tela faz várias
// chamadas. O controle fino é por usuário (userLimiter, abaixo).
const limiter = criarLimitador('global', {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1500,
  keyGenerator: (req) => chaveDeRateLimit(req.ip),
  skip: (req) => req.originalUrl.startsWith('/api/webhooks/stripe'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { sucesso: false, mensagem: 'Muitas requisições deste IP, tente novamente após 15 minutos' }
});

app.use('/api/', limiter);

// ==========================================
// Auth-endpoint Rate Limiter (narrow, IP-based)
// ==========================================
// Tighter window for credential endpoints to slow brute-force attempts.
// Successful sign-ins do not consume the budget.
//
// A chave é o prefixo /64 em IPv6 (ver utils/rede.ts): chavear pelo endereço
// inteiro dava a qualquer atacante com IPv6 um orçamento praticamente infinito.
const authLimiter = criarLimitador('auth', {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  keyGenerator: (req) => chaveDeRateLimit(req.ip),
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { sucesso: false, mensagem: 'Muitas tentativas de autenticação. Tente novamente em 15 minutos.' },
});

app.use(
  [
    '/api/auth/sign-in/email',
    '/api/auth/sign-in',
    '/api/auth/forget-password',
  ],
  authLimiter,
);

// Cadastro tem limitador PRÓPRIO, sem `skipSuccessfulRequests`.
//
// No limitador acima, cadastro bem-sucedido não consumia orçamento — ou seja,
// criar contas de verdade era ilimitado. Sem captcha e sem cobrança, isso é uma
// fábrica de tenants grátis. Aqui todo cadastro conta, com ou sem sucesso.
const signupLimiter = criarLimitador('cadastro', {
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5,
  keyGenerator: (req) => chaveDeRateLimit(req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  message: { sucesso: false, mensagem: 'Limite de cadastros atingido. Tente novamente em 1 hora.' },
});

app.use('/api/auth/sign-up/email', signupLimiter);

// ==========================================
// Session Invalidation on Sensitive Auth Changes
// ==========================================
// Better Auth does not expose a clean afterUpdate hook for change-password /
// change-email at this version; intercept the response and, on 2xx, evict
// every session for the user EXCEPT the current one. This forces other
// devices to re-authenticate after credential changes.
const SENSITIVE_AUTH_PATHS = new Set([
  '/api/auth/change-password',
  '/api/auth/change-email',
]);

app.use((req, res, next) => {
  if (req.method !== 'POST' || !SENSITIVE_AUTH_PATHS.has(req.path)) {
    return next();
  }

  res.on('finish', async () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    try {
      const session = await auth.api.getSession({
        headers: req.headers as unknown as Headers,
      });
      if (!session?.user?.id || !session?.session?.id) return;
      await pool.query(
        'DELETE FROM session WHERE user_id = $1 AND id <> $2',
        [session.user.id, session.session.id],
      );
    } catch (err) {
      console.error('[SessionEvict] Falha ao revogar sessões após mudança sensível:', err);
    }
  });

  next();
});

// ==========================================
// Better Auth Handler
// ==========================================
// Mount Better Auth BEFORE body parser (it handles its own parsing)
// Express 5: curinga nomeado (`{*caminho}`) — o `*` solto do Express 4 não casa mais.
app.all('/api/auth/{*caminho}', toNodeHandler(auth));

// ==========================================
// Webhook do Stripe — ANTES do body parser
// ==========================================
// A verificação de assinatura do Stripe roda sobre os BYTES exatos do corpo.
// Se o express.json() rodar antes, o JSON é reserializado, os bytes mudam e
// toda verificação falha. A rota usa express.raw internamente.
app.use('/api/webhooks/stripe', stripeWebhookRoutes);

// ==========================================
// Body Parser (after Better Auth)
// ==========================================
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));

// ==========================================
// Activity Logger
// ==========================================
app.use(activityLogger);

// ==========================================
// Per-user rate limiter (after auth, before routes)
// ==========================================
const userLimiter = criarLimitador('usuario', {
  windowMs: 60 * 60 * 1000, // 1 hour
  // ~33/min sustentado por usuário: comporta várias abas abertas com a
  // atualização automática das telas, e ainda corta automação abusiva.
  max: 2000,
  keyGenerator: (req: any) => req.user?.id || chaveDeRateLimit(req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: any) => !req.user,
  message: { sucesso: false, mensagem: 'Limite de requisicoes excedido. Tente novamente em alguns minutos.' },
});

// ==========================================
// API Routes
// ==========================================
app.use('/api/telemetria', telemetriaRoutes);
app.use('/api/convites', conviteRoutes);
app.use('/api/reservas', authMiddleware, userLimiter, requirePousada, requerAssinaturaAtiva, reservaRoutes);
app.use('/api/pousadas', authMiddleware, userLimiter, pousadaRoutes);
// Sem requerAssinaturaAtiva de proposito: quem esta bloqueado precisa
// conseguir ver o proprio estado e escolher um plano.
app.use('/api/billing', authMiddleware, userLimiter, billingRoutes);
app.use('/api/admin', authMiddleware, userLimiter, adminRoutes);
app.use('/api/conta', authMiddleware, userLimiter, contaRoutes);

// ==========================================
// Health Check & Status
// ==========================================
app.get('/', (req, res) => {
  res.json({ status: 'ok', mensagem: 'API de Reservas online' });
});

// Liveness: o processo está de pé e o event loop responde. É o que o Docker
// consulta — uma oscilação do banco não deve tirar o container do Traefik.
app.get('/health/live', (req, res) => {
  res.json({ status: 'alive', timestamp: new Date().toISOString() });
});

// Readiness: a API consegue servir de verdade (inclui o banco). É o que o
// monitor de uptime deve consultar. Antes respondia 200 "degraded" com o banco
// fora — nenhum monitor alertava.
app.get('/health', async (req, res) => {
  const dbOk = await bancoResponde();
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: dbOk ? 'connected' : 'disconnected',
  });
});

// ==========================================
// Error Handlers
// ==========================================
app.use(notFoundHandler);
app.use(errorHandler);

export { app };
