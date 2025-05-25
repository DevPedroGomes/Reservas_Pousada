const express = require('express');
const jwt = require('jsonwebtoken');
const Usuario = require('../models/Usuario');
const { sanitizarString } = require('../utils/validation');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('ERRO CRÍTICO: JWT_SECRET não definido nas variáveis de ambiente');
  process.exit(1);
}

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
    
    // Gerar token JWT
    const token = jwt.sign({
      id: usuario.id,
      username: usuario.username,
      nome: usuario.nome,
      role: usuario.role
    }, JWT_SECRET, { expiresIn: '24h' });
    
    // Remover senha do objeto de resposta
    const { password: _, ...usuarioSemSenha } = usuario;
    
    res.json({
      sucesso: true,
      token,
      usuario: usuarioSemSenha
    });
  } catch (error) {
    console.error('Erro ao realizar login:', error);
    res.status(500).json({ 
      sucesso: false, 
      mensagem: 'Erro no servidor' 
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

module.exports = router; 