/**
 * RefreshToken Model
 *
 * Implementa token selector strategy para busca O(1):
 * - Token de 128 chars (64 bytes hex)
 * - Selector: primeiros 32 chars (armazenado em plaintext, indexado)
 * - Verifier: ultimos 96 chars (armazenado como hash bcrypt)
 *
 * Na busca: query por selector (O(1)), depois verifica hash do verifier (1 operacao)
 */

const { supabase } = require('../database/db');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const REFRESH_TTL_DAYS = parseInt(process.env.REFRESH_TTL_DAYS || '7', 10);
const SELECTOR_LENGTH = 32; // Primeiros 32 chars do token hex

class RefreshToken {
  /**
   * Gera um token de 128 caracteres hex (64 bytes)
   * @returns {string} Token hex de 128 caracteres
   */
  static gerarTokenString() {
    return crypto.randomBytes(64).toString('hex');
  }

  /**
   * Extrai o selector (primeiros 32 chars) do token
   * @param {string} token - Token completo
   * @returns {string} Selector de 32 chars
   */
  static extrairSelector(token) {
    return token.substring(0, SELECTOR_LENGTH);
  }

  /**
   * Extrai o verifier (restante apos selector) do token
   * @param {string} token - Token completo
   * @returns {string} Verifier de 96 chars
   */
  static extrairVerifier(token) {
    return token.substring(SELECTOR_LENGTH);
  }

  /**
   * Calcula a data de expiracao do token
   * @returns {string} Data ISO string
   */
  static calcularExpiracao() {
    const expires = new Date();
    expires.setDate(expires.getDate() + REFRESH_TTL_DAYS);
    return expires.toISOString();
  }

  /**
   * Cria um novo refresh token no banco de dados
   * @param {Object} params
   * @param {number} params.userId - ID do usuario
   * @param {string} params.token - Token completo (128 chars)
   * @param {string} [params.userAgent] - User agent do cliente
   * @param {string} [params.ip] - IP do cliente
   * @returns {Promise<Object>} Token criado
   */
  static async criar({ userId, token, userAgent = null, ip = null }) {
    const selector = this.extrairSelector(token);
    const verifier = this.extrairVerifier(token);

    // Hash apenas do verifier (selector fica em plaintext para indexacao)
    const verifierHash = await bcrypt.hash(verifier, 10);
    const expiresAt = this.calcularExpiracao();

    const { data, error } = await supabase
      .from('refresh_tokens')
      .insert([{
        user_id: userId,
        token_selector: selector,
        token_hash: verifierHash,
        expires_at: expiresAt,
        user_agent: userAgent,
        ip_address: ip
      }])
      .select('id, user_id, expires_at, revoked')
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Busca um token pelo token completo
   * Usa token selector strategy para busca O(1)
   *
   * @param {string} token - Token completo (128 chars)
   * @returns {Promise<Object|null>} Token encontrado ou null
   */
  static async buscarPorToken(token) {
    if (!token || token.length < SELECTOR_LENGTH) {
      return null;
    }

    const selector = this.extrairSelector(token);
    const verifier = this.extrairVerifier(token);

    // Busca O(1) pelo selector indexado
    const { data, error } = await supabase
      .from('refresh_tokens')
      .select('*')
      .eq('token_selector', selector)
      .eq('revoked', false)
      .single();

    if (error || !data) {
      return null;
    }

    // Verificar se expirou
    if (new Date(data.expires_at) < new Date()) {
      return null;
    }

    // Verificacao unica do hash do verifier
    const match = await bcrypt.compare(verifier, data.token_hash);
    return match ? data : null;
  }

  /**
   * Revoga um token especifico
   * @param {number} id - ID do token
   */
  static async revogar(id) {
    const { error } = await supabase
      .from('refresh_tokens')
      .update({ revoked: true })
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * Revoga todos os tokens de um usuario
   * @param {number} userId - ID do usuario
   */
  static async revogarTodosDoUsuario(userId) {
    const { error } = await supabase
      .from('refresh_tokens')
      .update({ revoked: true })
      .eq('user_id', userId)
      .eq('revoked', false);

    if (error) throw error;
  }

  /**
   * Remove tokens expirados (cleanup)
   * Pode ser executado periodicamente via cron
   */
  static async limparExpirados() {
    const { error } = await supabase
      .from('refresh_tokens')
      .delete()
      .lt('expires_at', new Date().toISOString());

    if (error) throw error;
  }
}

module.exports = RefreshToken;
