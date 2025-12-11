const express = require('express');
const jwt = require('jsonwebtoken');
const Usuario = require('../models/Usuario');
const RefreshToken = require('../models/RefreshToken');
const { sanitizarString, sanitizarNome, validarRegistro } = require('../utils/validation');
const crypto = require('crypto');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '1h';

if (!JWT_SECRET) {
  console.error('ERRO CRÍTICO: JWT_SECRET não definido nas variáveis de ambiente');
  process.exit(1);
}

const gerarAccessToken = (usuario) =>
  jwt.sign(
    {
      id: usuario.id,
      username: usuario.username,
      nome: usuario.nome,
      role: usuario.role
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  );

// Rota de login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validação básica
    if (!username || !password) {
      return res.status(400).json({ 
        sucesso: false, 
        mensagem: 'Usuário e senha são obrigatórios' 
      });
    }
    
    // Sanitizar entrada
    const usernameSanitizado = sanitizarString(username).toLowerCase();
    
    // Validações adicionais
    if (usernameSanitizado.length < 3 || usernameSanitizado.length > 50) {
      return res.status(400).json({ 
        sucesso: false, 
        mensagem: 'Nome de usuário deve ter entre 3 e 50 caracteres' 
      });
    }
    
    if (password.length < 6 || password.length > 100) {
      return res.status(400).json({ 
        sucesso: false, 
        mensagem: 'Senha deve ter entre 6 e 100 caracteres' 
      });
    }
    
    // Verificar se o usuário existe e a senha está correta
    const senhaCorreta = await Usuario.verificarSenha(usernameSanitizado, password);
    if (!senhaCorreta) {
      return res.status(401).json({ 
        sucesso: false, 
        mensagem: 'Usuário ou senha inválidos' 
      });
    }
    
    // Buscar dados do usuário
    const usuario = await Usuario.buscarPorUsername(usernameSanitizado);
    if (!usuario) {
      return res.status(401).json({ 
        sucesso: false, 
        mensagem: 'Usuário não encontrado' 
      });
    }
    
    // Gerar tokens
    const token = gerarAccessToken(usuario);
    const refreshTokenString = RefreshToken.gerarTokenString();
    await RefreshToken.criar({
      userId: usuario.id,
      token: refreshTokenString,
      userAgent: req.headers['user-agent'] || null,
      ip: req.ip
    });
    
    // Remover senha do objeto de resposta
    const { password: _, ...usuarioSemSenha } = usuario;
    
    res.json({
      sucesso: true,
      token,
      refresh_token: refreshTokenString,
      usuario: usuarioSemSenha,
      expires_in: ACCESS_TOKEN_TTL
    });
  } catch (error) {
    console.error('Erro ao realizar login:', error);
    res.status(500).json({ 
      sucesso: false, 
      mensagem: 'Erro no servidor' 
    });
  }
});

// Rota de registro (signup)
router.post('/register', async (req, res) => {
  try {
    const { username, nome, password } = req.body;

    // Validar dados de entrada
    const validacao = validarRegistro({ username, nome, password });
    if (!validacao.valido) {
      return res.status(400).json({
        sucesso: false,
        mensagem: validacao.erros.join('. ')
      });
    }

    // Sanitizar dados
    const usernameSanitizado = sanitizarString(username).toLowerCase().trim();
    const nomeSanitizado = sanitizarNome(nome);

    // Verificar se username já existe
    try {
      const usuarioExistente = await Usuario.buscarPorUsername(usernameSanitizado);
      if (usuarioExistente) {
        return res.status(409).json({
          sucesso: false,
          mensagem: 'Este nome de usuário já está em uso'
        });
      }
    } catch (error) {
      // Se der erro ao buscar, pode ser que não existe (ok para continuar)
      if (error.code !== 'PGRST116') {
        throw error;
      }
    }

    // Criar usuário com role padrão 'recepcao'
    const novoUsuario = await Usuario.criar({
      username: usernameSanitizado,
      password: password,
      nome: nomeSanitizado,
      role: 'recepcao'
    });

    // Gerar tokens (auto-login após registro)
    const token = gerarAccessToken(novoUsuario);
    const refreshTokenString = RefreshToken.gerarTokenString();
    await RefreshToken.criar({
      userId: novoUsuario.id,
      token: refreshTokenString,
      userAgent: req.headers['user-agent'] || null,
      ip: req.ip
    });

    res.status(201).json({
      sucesso: true,
      mensagem: 'Conta criada com sucesso',
      token,
      refresh_token: refreshTokenString,
      usuario: novoUsuario,
      expires_in: ACCESS_TOKEN_TTL
    });
  } catch (error) {
    console.error('Erro ao registrar usuário:', error);

    // Verificar se é erro de username duplicado
    if (error.code === '23505') {
      return res.status(409).json({
        sucesso: false,
        mensagem: 'Este nome de usuário já está em uso'
      });
    }

    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao criar conta'
    });
  }
});

// Rota para verificar o token atual
router.get('/verificar', async (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ 
      sucesso: false, 
      mensagem: 'Token não fornecido' 
    });
  }
  
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Verificar se o usuário ainda existe no banco
    const usuario = await Usuario.buscarPorId(decoded.id);
    if (!usuario) {
      return res.status(401).json({ 
        sucesso: false, 
        mensagem: 'Usuário não encontrado' 
      });
    }
    
    res.json({
      sucesso: true,
      usuario: {
        id: usuario.id,
        username: usuario.username,
        nome: usuario.nome,
        role: usuario.role
      }
    });
  } catch (error) {
    console.error('Erro ao verificar token:', error);
    res.status(401).json({ 
      sucesso: false, 
      mensagem: 'Token inválido ou expirado' 
    });
  }
});

// Refresh token
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      return res.status(400).json({ sucesso: false, mensagem: 'Refresh token é obrigatório' });
    }

    const stored = await RefreshToken.buscarPorToken(refresh_token);
    if (!stored) {
      return res.status(401).json({ sucesso: false, mensagem: 'Refresh token inválido' });
    }

    if (stored.revoked || new Date(stored.expires_at) < new Date()) {
      await RefreshToken.revogar(stored.id);
      return res.status(401).json({ sucesso: false, mensagem: 'Refresh token expirado ou revogado' });
    }

    const usuario = await Usuario.buscarPorId(stored.user_id);
    if (!usuario) {
      await RefreshToken.revogar(stored.id);
      return res.status(401).json({ sucesso: false, mensagem: 'Usuário não encontrado' });
    }

    // Rotacionar refresh token
    await RefreshToken.revogar(stored.id);
    const novoRefresh = RefreshToken.gerarTokenString();
    await RefreshToken.criar({
      userId: usuario.id,
      token: novoRefresh,
      userAgent: req.headers['user-agent'] || null,
      ip: req.ip
    });

    const token = gerarAccessToken(usuario);

    res.json({
      sucesso: true,
      token,
      refresh_token: novoRefresh,
      usuario,
      expires_in: ACCESS_TOKEN_TTL
    });
  } catch (error) {
    console.error('Erro ao renovar token:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao renovar token' });
  }
});

// Logout e revogação de refresh token
router.post('/logout', async (req, res) => {
  try {
    const { refresh_token, logout_all } = req.body;
    if (!refresh_token) {
      return res.status(400).json({ sucesso: false, mensagem: 'Refresh token é obrigatório' });
    }

    const stored = await RefreshToken.buscarPorToken(refresh_token);
    if (stored) {
      await RefreshToken.revogar(stored.id);
      if (logout_all && stored.user_id) {
        await RefreshToken.revogarTodosDoUsuario(stored.user_id);
      }
    }

    res.json({ sucesso: true, mensagem: 'Sessão encerrada' });
  } catch (error) {
    console.error('Erro ao fazer logout:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao fazer logout' });
  }
});

module.exports = router; 
