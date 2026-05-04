import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './lib/auth.js';
import { testConnection, pool } from './db/index.js';
import reservaRoutes from './routes/reservas.js';
import pousadaRoutes from './routes/pousadas.js';
import conviteRoutes from './routes/convites.js';
import { authMiddleware, requirePousada } from './middleware/auth.js';
import { activityLogger } from './middleware/activity.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app = express();
const PORT = process.env.PORT || 4000;

// Trust proxy (Traefik reverse proxy)
app.set('trust proxy', 1);

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
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// ==========================================
// Rate Limiting
// ==========================================
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
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
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  keyGenerator: (req) => req.ip || 'unknown',
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { sucesso: false, mensagem: 'Muitas tentativas de autenticação. Tente novamente em 15 minutos.' },
});

app.use(
  [
    '/api/auth/sign-in/email',
    '/api/auth/sign-in',
    '/api/auth/sign-up/email',
    '/api/auth/forget-password',
  ],
  authLimiter,
);

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
app.all('/api/auth/*', toNodeHandler(auth));

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
const userLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 500,
  keyGenerator: (req: any) => req.user?.id || req.ip || 'anonymous',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: any) => !req.user,
  message: { sucesso: false, mensagem: 'Limite de requisicoes excedido. Tente novamente em alguns minutos.' },
});

// ==========================================
// API Routes
// ==========================================
app.use('/api/convites', conviteRoutes);
app.use('/api/reservas', authMiddleware, userLimiter, requirePousada, reservaRoutes);
app.use('/api/pousadas', authMiddleware, userLimiter, pousadaRoutes);

// ==========================================
// Health Check & Status
// ==========================================
app.get('/', (req, res) => {
  res.json({ status: 'ok', mensagem: 'API de Reservas online' });
});

app.get('/health', async (req, res) => {
  try {
    const dbOk = await testConnection();
    res.json({
      status: dbOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database: dbOk ? 'connected' : 'disconnected'
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'error'
    });
  }
});

// ==========================================
// Error Handlers
// ==========================================
app.use(notFoundHandler);
app.use(errorHandler);

// ==========================================
// Server Startup
// ==========================================
async function iniciarServidor() {
  try {
    // Test database connection
    const dbOk = await testConnection();
    if (!dbOk) {
      console.error('Não foi possível conectar ao banco de dados');
      process.exit(1);
    }

    // Validate critical config
    if (process.env.NODE_ENV === 'production' && !process.env.RESEND_API_KEY) {
      console.warn('⚠ RESEND_API_KEY não definida — emails (convites, reset senha, verificação) NÃO serão enviados');
    }

    // Cleanup expired sessions every 6 hours
    setInterval(async () => {
      try {
        const result = await pool.query('DELETE FROM session WHERE expires_at < NOW()');
        if (result.rowCount && result.rowCount > 0) {
          console.log(`[Cleanup] ${result.rowCount} sessões expiradas removidas`);
        }
      } catch (err) {
        console.error('[Cleanup] Erro ao limpar sessões:', err);
      }
    }, 6 * 60 * 60 * 1000);

    // Start server
    app.listen(PORT, () => {
      console.log(`Servidor rodando na porta ${PORT}`);
      console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
      console.log(`Auth URL: ${process.env.BETTER_AUTH_URL || 'http://localhost:4000'}`);
    });
  } catch (err) {
    console.error('Erro ao inicializar a aplicação:', err);
    process.exit(1);
  }
}

iniciarServidor();

export { app };
