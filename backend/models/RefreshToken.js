const { supabase } = require('../database/db');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const REFRESH_TTL_DAYS = parseInt(process.env.REFRESH_TTL_DAYS || '7', 10);

class RefreshToken {
  static gerarTokenString() {
    return crypto.randomBytes(64).toString('hex');
  }

  static calcularExpiracao() {
    const expires = new Date();
    expires.setDate(expires.getDate() + REFRESH_TTL_DAYS);
    return expires.toISOString();
  }

  static async criar({ userId, token, userAgent = null, ip = null }) {
    const tokenHash = bcrypt.hashSync(token, 10);
    const expiresAt = this.calcularExpiracao();

    const { data, error } = await supabase
      .from('refresh_tokens')
      .insert([
        {
          user_id: userId,
          token_hash: tokenHash,
          expires_at: expiresAt,
          user_agent: userAgent,
          ip_address: ip
        }
      ])
      .select('id, user_id, expires_at, revoked')
      .single();

    if (error) throw error;
    return data;
  }

  static async buscarPorToken(token) {
    const { data, error } = await supabase
      .from('refresh_tokens')
      .select('*')
      .eq('revoked', false)
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!data || data.length === 0) return null;

    for (const item of data) {
      const match = bcrypt.compareSync(token, item.token_hash);
      if (match) return item;
    }
    return null;
  }

  static async revogar(id) {
    const { error } = await supabase
      .from('refresh_tokens')
      .update({ revoked: true })
      .eq('id', id);
    if (error) throw error;
  }

  static async revogarTodosDoUsuario(userId) {
    const { error } = await supabase
      .from('refresh_tokens')
      .update({ revoked: true })
      .eq('user_id', userId)
      .eq('revoked', false);
    if (error) throw error;
  }
}

module.exports = RefreshToken;
