require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');
const reservaRoutes = require('./routes/reservas');
const { initDatabase } = require('./database/db');
const { activityLogger, verificarConfiguracaoSupabase } = require('./config/security');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('ERRO CRÍTICO: JWT_SECRET não definido nas variáveis de ambiente');
  process.exit(1);
}

// Rate limiting para proteção contra ataques
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // Limita cada IP a 100 requisições por janela
  standardHeaders: true, // Retorna info de rate limit nos headers `RateLimit-*`
  legacyHeaders: false, // Desativa os headers `X-RateLimit-*`
  message: 'Muitas requisições deste IP, tente novamente após 15 minutos'
});

// Aplicar rate limiting em todas rotas da API
app.use('/api/', limiter);

// Configurações de segurança básicas
app.disable('x-powered-by'); // Remove o header X-Powered-By para ocultar informações do servidor

// Headers de segurança adicionais
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

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Middleware para parsear o corpo das requisições com limites de segurança
app.use(bodyParser.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    // Verificar se o JSON é válido
    try {
      JSON.parse(buf);
    } catch (e) {
      res.status(400).json({
        sucesso: false,
        mensagem: 'JSON inválido'
      });
      throw new Error('JSON inválido');
    }
  }
}));
app.use(bodyParser.urlencoded({ 
  extended: true,
  limit: '10mb',
  parameterLimit: 100
}));

// Logger de atividades
app.use(activityLogger);

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, '../public')));

// Middleware de autenticação
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      sucesso: false,
      mensagem: 'Token de acesso requerido'
    });
  }
  
  const token = authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({
      sucesso: false,
      mensagem: 'Token inválido'
    });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Verificar se o token tem os campos necessários
    if (!decoded.id || !decoded.username) {
      return res.status(403).json({
        sucesso: false,
        mensagem: 'Token malformado'
      });
    }
    
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Token expirado'
      });
    } else if (err.name === 'JsonWebTokenError') {
      return res.status(403).json({
        sucesso: false,
        mensagem: 'Token inválido'
      });
    } else {
      return res.status(500).json({
        sucesso: false,
        mensagem: 'Erro interno do servidor'
      });
    }
  }
};

// Rotas
app.use('/api/auth', authRoutes);
app.use('/api/reservas', authenticateJWT, reservaRoutes);

// Rota principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Rota para verificar status do servidor
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Tratamento de erros global
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({ 
    sucesso: false, 
    mensagem: 'Erro interno do servidor' 
  });
});

// Inicializar o banco de dados e iniciar o servidor
async function iniciarServidor() {
  try {
    // Inicializar banco de dados
    await initDatabase();
    
    // Verificar configuração do Supabase
    const supabaseConfigOk = await verificarConfiguracaoSupabase();
    if (!supabaseConfigOk) {
      console.warn('Aviso: Configuração do Supabase pode estar incompleta!');
    }
    
    // Iniciar servidor
    app.listen(PORT, () => {
      console.log(`Servidor rodando na porta ${PORT}`);
      console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err) {
    console.error('Erro ao inicializar a aplicação:', err);
    process.exit(1);
  }
}

iniciarServidor();

// Exportar apenas o app, o JWT_SECRET será importado diretamente do .env
module.exports = { app }; 