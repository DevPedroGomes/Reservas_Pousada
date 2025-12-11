const { supabase } = require('../database/db');

class Auditoria {
  static async registrar({ userId, action, entityId, detalhes = {}, ip }) {
    const { error } = await supabase.from('logs').insert([
      {
        user_id: userId || null,
        action,
        entity: 'reserva',
        entity_id: entityId,
        details: detalhes,
        ip_address: ip || null
      }
    ]);
    if (error) throw error;
  }

  static async listarPorReserva(reservaId, limit = 50) {
    const { data, error } = await supabase
      .from('logs')
      .select('id, action, entity, entity_id, details, ip_address, created_at, user:usuarios(nome,username)')
      .eq('entity', 'reserva')
      .eq('entity_id', reservaId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }
}

module.exports = Auditoria;
