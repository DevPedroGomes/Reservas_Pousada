const { supabase } = require('../database/db');
const bcrypt = require('bcryptjs');

class Usuario {
  static async buscarPorUsername(username) {
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('username', username)
      .single();
    
    if (error) throw error;
    return data;
  }

  static async buscarPorId(id) {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, username, nome, role, created_at')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data;
  }

  static async verificarSenha(username, senha) {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('password')
        .eq('username', username)
        .single();
      
      if (error || !data) {
        return false;
      }
      
      return bcrypt.compareSync(senha, data.password);
    } catch (error) {
      console.error('Erro ao verificar senha:', error);
      return false;
    }
  }

  static async listarTodos() {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, username, nome, role, created_at');
    
    if (error) throw error;
    return data || [];
  }

  static async criar(usuario) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(usuario.password, salt);
    
    const { username, nome, role } = usuario;
    
    const { data, error } = await supabase
      .from('usuarios')
      .insert([{
        username,
        password: hash,
        nome,
        role
      }])
      .select('id, username, nome, role')
      .single();
    
    if (error) throw error;
    return data;
  }

  static async atualizar(id, usuario) {
    const { nome, role } = usuario;
    const updateData = { nome, role };
    
    // Apenas atualize a senha se ela for fornecida
    if (usuario.password) {
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(usuario.password, salt);
      updateData.password = hash;
    }
    
    const { error } = await supabase
      .from('usuarios')
      .update(updateData)
      .eq('id', id);
    
    if (error) throw error;
    return { changes: 1 };
  }

  static async excluir(id) {
    const { error } = await supabase
      .from('usuarios')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    return { changes: 1 };
  }
}

module.exports = Usuario; 