const express = require('express');
const jwt = require('jsonwebtoken');
const Usuario = require('../models/Usuario');
const RefreshToken = require('../models/RefreshToken');
const { sanitizarString, sanitizarNome, validarRegistro, validarEmail } = require('../utils/validation');
const { supabase } = require('../database/db');
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
      role: usuario.role,
      pousada_id: usuario.pousada_id || null,
      is_owner: usuario.is_owner || false
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

    // Verificar se precisa de onboarding (não tem pousada associada)
    const needsOnboarding = !usuario.pousada_id;

    res.json({
      sucesso: true,
      token,
      refresh_token: refreshTokenString,
      usuario: usuarioSemSenha,
      expires_in: ACCESS_TOKEN_TTL,
      needsOnboarding
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
      expires_in: ACCESS_TOKEN_TTL,
      needsOnboarding: true // Novo usuário sempre precisa configurar pousada
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
        role: usuario.role,
        pousada_id: usuario.pousada_id,
        is_owner: usuario.is_owner,
        email: usuario.email,
        avatar_url: usuario.avatar_url
      },
      needsOnboarding: !usuario.pousada_id
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

// ============================================
// GOOGLE OAUTH
// ============================================

/**
 * POST /api/auth/google
 * Autentica usuário via Google OAuth usando Supabase Auth
 * Aceita dados do usuário diretamente do Supabase session ou token de acesso
 */
router.post('/google', async (req, res) => {
  try {
    const { access_token, id_token, supabase_user_id, email: userEmail, nome: userName, avatar_url: userAvatar } = req.body;

    let googleId, email, nome, avatarUrl;

    // Verificar se recebemos dados diretos do Supabase session
    if (supabase_user_id && userEmail) {
      // Dados já vieram do frontend após autenticação Supabase
      googleId = supabase_user_id;
      email = userEmail;
      nome = userName || userEmail.split('@')[0];
      avatarUrl = userAvatar || null;
    } else if (access_token || id_token) {
      // Verificar token com Supabase Auth
      const { data: { user: googleUser }, error: authError } = await supabase.auth.getUser(access_token || id_token);

      if (authError || !googleUser) {
        console.error('Erro ao verificar token Google:', authError);
        return res.status(401).json({
          sucesso: false,
          mensagem: 'Token do Google inválido ou expirado'
        });
      }

      // Extrair dados do usuário do Google
      googleId = googleUser.id;
      email = googleUser.email;
      const user_metadata = googleUser.user_metadata;
      nome = user_metadata?.full_name || user_metadata?.name || email.split('@')[0];
      avatarUrl = user_metadata?.avatar_url || user_metadata?.picture || null;
    } else {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Dados de autenticação são obrigatórios'
      });
    }

    // Verificar se usuário já existe por google_id ou email
    let usuario = null;

    // Primeiro tentar buscar por google_id (usuário já usou Google antes)
    const { data: existingByGoogleId } = await supabase
      .from('usuarios')
      .select('*')
      .eq('google_id', googleId)
      .single();

    if (existingByGoogleId) {
      usuario = existingByGoogleId;

      // Atualizar avatar se mudou
      if (avatarUrl && avatarUrl !== existingByGoogleId.avatar_url) {
        await supabase
          .from('usuarios')
          .update({ avatar_url: avatarUrl })
          .eq('id', existingByGoogleId.id);
        usuario.avatar_url = avatarUrl;
      }
    } else {
      // Tentar buscar por email (pode ser usuário que fez signup tradicional ou Google)
      const { data: existingByEmail } = await supabase
        .from('usuarios')
        .select('*')
        .eq('email', email)
        .single();

      if (existingByEmail) {
        // Vincular conta Google ao usuário existente
        const { data: updated, error: updateError } = await supabase
          .from('usuarios')
          .update({
            google_id: googleId,
            avatar_url: avatarUrl || existingByEmail.avatar_url,
            nome: existingByEmail.nome || nome // Manter nome existente ou usar do Google
          })
          .eq('id', existingByEmail.id)
          .select()
          .single();

        if (updateError) throw updateError;
        usuario = updated;
        console.log(`Conta Google vinculada ao usuário existente: ${email}`);
      }
    }

    // Se não encontrou, criar novo usuário
    if (!usuario) {
      // Gerar username único baseado no email
      const baseUsername = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '').substring(0, 20);
      let username = baseUsername;
      let attempts = 0;
      const maxAttempts = 5;

      // Tentar criar usuário com retry para username duplicado
      while (attempts < maxAttempts) {
        attempts++;

        // Verificar se username já existe
        const { data: existing } = await supabase
          .from('usuarios')
          .select('id')
          .eq('username', username)
          .single();

        if (existing) {
          // Username existe, gerar novo com sufixo aleatório
          const randomSuffix = crypto.randomBytes(3).toString('hex');
          username = `${baseUsername}_${randomSuffix}`;
          continue;
        }

        // Tentar criar usuário
        const { data: newUser, error: createError } = await supabase
          .from('usuarios')
          .insert([{
            username,
            password: crypto.randomBytes(32).toString('hex'),
            nome,
            email,
            google_id: googleId,
            avatar_url: avatarUrl,
            role: 'recepcao',
            is_owner: false
          }])
          .select()
          .single();

        if (createError) {
          // Se erro de duplicidade de username, tentar novamente com outro
          if (createError.code === '23505' && createError.message.includes('username')) {
            const randomSuffix = crypto.randomBytes(3).toString('hex');
            username = `${baseUsername}_${randomSuffix}`;
            continue;
          }

          // Se erro de duplicidade de email, buscar o usuário existente e vincular
          if (createError.code === '23505' && createError.message.includes('email')) {
            console.log(`Email ${email} já existe, buscando usuário...`);
            const { data: existingUser } = await supabase
              .from('usuarios')
              .select('*')
              .eq('email', email)
              .single();

            if (existingUser) {
              // Vincular google_id ao usuário existente
              const { data: linked } = await supabase
                .from('usuarios')
                .update({ google_id: googleId, avatar_url: avatarUrl || existingUser.avatar_url })
                .eq('id', existingUser.id)
                .select()
                .single();
              usuario = linked || existingUser;
              break;
            }
          }

          throw createError;
        }

        usuario = newUser;
        break;
      }

      if (!usuario) {
        throw new Error('Não foi possível criar usuário após várias tentativas');
      }
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

    // Remover senha e google_id do objeto de resposta
    const { password: _, google_id: __, ...usuarioSemSenha } = usuario;

    res.json({
      sucesso: true,
      token,
      refresh_token: refreshTokenString,
      usuario: usuarioSemSenha,
      expires_in: ACCESS_TOKEN_TTL,
      needsOnboarding: !usuario.pousada_id,
      isNewUser: !usuario.pousada_id
    });
  } catch (error) {
    console.error('Erro na autenticação Google:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao autenticar com Google'
    });
  }
});

/**
 * GET /api/auth/google/url
 * Retorna a URL para iniciar o fluxo OAuth com Google via Supabase
 */
router.get('/google/url', async (req, res) => {
  try {
    const redirectTo = req.query.redirect_to || process.env.GOOGLE_REDIRECT_URL || 'http://localhost:3000/auth/callback';

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent'
        }
      }
    });

    if (error) throw error;

    res.json({
      sucesso: true,
      url: data.url
    });
  } catch (error) {
    console.error('Erro ao gerar URL do Google:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao gerar URL de autenticação'
    });
  }
});

/**
 * POST /api/auth/google/callback
 * Processa o callback do OAuth do Google
 */
router.post('/google/callback', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Código de autorização é obrigatório'
      });
    }

    // Trocar código por sessão
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('Erro ao trocar código:', error);
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Código de autorização inválido'
      });
    }

    // Redirecionar para o endpoint /google com o access_token
    req.body.access_token = data.session.access_token;

    // Chamar a lógica do /google
    const googleUser = data.user;
    const { id: googleId, email, user_metadata } = googleUser;
    const nome = user_metadata?.full_name || user_metadata?.name || email.split('@')[0];
    const avatarUrl = user_metadata?.avatar_url || user_metadata?.picture || null;

    // Verificar se usuário já existe por google_id ou email
    let usuario = null;

    // Primeiro buscar por google_id
    const { data: existingByGoogleId } = await supabase
      .from('usuarios')
      .select('*')
      .eq('google_id', googleId)
      .single();

    if (existingByGoogleId) {
      usuario = existingByGoogleId;

      // Atualizar avatar se mudou
      if (avatarUrl && avatarUrl !== existingByGoogleId.avatar_url) {
        await supabase
          .from('usuarios')
          .update({ avatar_url: avatarUrl })
          .eq('id', existingByGoogleId.id);
        usuario.avatar_url = avatarUrl;
      }
    } else {
      // Buscar por email (vincular conta existente)
      const { data: existingByEmail } = await supabase
        .from('usuarios')
        .select('*')
        .eq('email', email)
        .single();

      if (existingByEmail) {
        const { data: updated } = await supabase
          .from('usuarios')
          .update({
            google_id: googleId,
            avatar_url: avatarUrl || existingByEmail.avatar_url,
            nome: existingByEmail.nome || nome
          })
          .eq('id', existingByEmail.id)
          .select()
          .single();
        usuario = updated;
        console.log(`Conta Google vinculada ao usuário existente: ${email}`);
      }
    }

    // Criar novo usuário se não encontrou
    if (!usuario) {
      const baseUsername = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '').substring(0, 20);
      let username = baseUsername;
      let attempts = 0;
      const maxAttempts = 5;

      while (attempts < maxAttempts) {
        attempts++;

        const { data: existing } = await supabase
          .from('usuarios')
          .select('id')
          .eq('username', username)
          .single();

        if (existing) {
          const randomSuffix = crypto.randomBytes(3).toString('hex');
          username = `${baseUsername}_${randomSuffix}`;
          continue;
        }

        const { data: newUser, error: createError } = await supabase
          .from('usuarios')
          .insert([{
            username,
            password: crypto.randomBytes(32).toString('hex'),
            nome,
            email,
            google_id: googleId,
            avatar_url: avatarUrl,
            role: 'recepcao',
            is_owner: false
          }])
          .select()
          .single();

        if (createError) {
          // Duplicidade de username - tentar outro
          if (createError.code === '23505' && createError.message.includes('username')) {
            const randomSuffix = crypto.randomBytes(3).toString('hex');
            username = `${baseUsername}_${randomSuffix}`;
            continue;
          }

          // Duplicidade de email - vincular conta existente
          if (createError.code === '23505' && createError.message.includes('email')) {
            console.log(`Email ${email} já existe, buscando usuário...`);
            const { data: existingUser } = await supabase
              .from('usuarios')
              .select('*')
              .eq('email', email)
              .single();

            if (existingUser) {
              const { data: linked } = await supabase
                .from('usuarios')
                .update({ google_id: googleId, avatar_url: avatarUrl || existingUser.avatar_url })
                .eq('id', existingUser.id)
                .select()
                .single();
              usuario = linked || existingUser;
              break;
            }
          }

          throw createError;
        }

        usuario = newUser;
        break;
      }

      if (!usuario) {
        throw new Error('Não foi possível criar usuário após várias tentativas');
      }
    }

    const token = gerarAccessToken(usuario);
    const refreshTokenString = RefreshToken.gerarTokenString();
    await RefreshToken.criar({
      userId: usuario.id,
      token: refreshTokenString,
      userAgent: req.headers['user-agent'] || null,
      ip: req.ip
    });

    const { password: _, google_id: __, ...usuarioSemSenha } = usuario;

    res.json({
      sucesso: true,
      token,
      refresh_token: refreshTokenString,
      usuario: usuarioSemSenha,
      expires_in: ACCESS_TOKEN_TTL,
      needsOnboarding: !usuario.pousada_id
    });
  } catch (error) {
    console.error('Erro no callback Google:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao processar autenticação'
    });
  }
});

module.exports = router; 
