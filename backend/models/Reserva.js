const { supabase } = require('../database/db');

class Reserva {
  static async listarTodas({ page = 1, limit = 50, search = '', status, pago, data_inicio, data_fim } = {}) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('reservas')
      .select(`
        *,
        criado_por_nome:usuarios(nome)
      `, { count: 'exact' })
      .order('data_entrada', { ascending: true });

    if (status) {
      query = query.eq('status', status);
    }

    if (pago !== undefined && pago !== null) {
      query = query.eq('pago', pago);
    }

    if (data_inicio && data_fim) {
      query = query.or(`
        and(data_entrada.gte.${data_inicio},data_entrada.lte.${data_fim}),
        and(data_saida.gte.${data_inicio},data_saida.lte.${data_fim}),
        and(data_entrada.lte.${data_inicio},data_saida.gte.${data_fim})
      `);
    }

    if (search) {
      const like = `%${search}%`;
      query = query.or(`nome.ilike.${like},cpf.ilike.${like},quarto.eq.${search}`);
    }

    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;
    return { data: data || [], count: count || 0 };
  }

  static async buscarPorId(id) {
    const { data, error } = await supabase
      .from('reservas')
      .select(`
        *,
        criado_por_nome:usuarios(nome)
      `)
      .eq('id', id)
      .single();
      
    if (error) throw error;
    return data;
  }

  static async buscarPorPeriodo(dataInicio, dataFim) {
    const { data, error } = await supabase
      .from('reservas')
      .select(`
        *,
        criado_por_nome:usuarios(nome)
      `)
      .or(`
        and(data_entrada.gte.${dataInicio},data_entrada.lte.${dataFim}),
        and(data_saida.gte.${dataInicio},data_saida.lte.${dataFim}),
        and(data_entrada.lte.${dataInicio},data_saida.gte.${dataFim})
      `)
      .order('data_entrada');
      
    if (error) throw error;
    return data || [];
  }

  static async buscarPorStatus(status) {
    const { data, error } = await supabase
      .from('reservas')
      .select(`
        *,
        criado_por_nome:usuarios(nome)
      `)
      .eq('status', status)
      .order('data_entrada');
      
    if (error) throw error;
    return data || [];
  }

  static async buscarPorStatusPagamento(pago) {
    const { data, error } = await supabase
      .from('reservas')
      .select(`
        *,
        criado_por_nome:usuarios(nome)
      `)
      .eq('pago', pago)
      .order('data_entrada');
      
    if (error) throw error;
    return data || [];
  }

  static async verificarDisponibilidade(quarto, dataEntrada, dataSaida, reservaIdExcluir = null) {
    let query = supabase
      .from('reservas')
      .select('*')
      .eq('quarto', quarto)
      .eq('status', 'ativa')
      .or(`
        and(data_entrada.lte.${dataSaida},data_saida.gte.${dataEntrada}),
        and(data_entrada.gte.${dataEntrada},data_entrada.lte.${dataSaida}),
        and(data_saida.gte.${dataEntrada},data_saida.lte.${dataSaida})
      `);
    
    // Excluir a própria reserva da verificação quando for uma atualização
    if (reservaIdExcluir) {
      query = query.neq('id', reservaIdExcluir);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    return {
      disponivel: !data || data.length === 0,
      conflitos: data || []
    };
  }

  static async criar(reserva) {
    const { nome, cpf, quarto, data_entrada, data_saida, status, valor, pago, observacoes, criado_por } = reserva;
    
    // Verificar disponibilidade
    const disponibilidade = await this.verificarDisponibilidade(quarto, data_entrada, data_saida);
    if (!disponibilidade.disponivel) {
      const error = new Error('Quarto não disponível para o período selecionado');
      error.conflitos = disponibilidade.conflitos;
      throw error;
    }
    
    const { data, error } = await supabase
      .from('reservas')
      .insert([{
        nome,
        cpf,
        quarto,
        data_entrada,
        data_saida,
        status,
        valor,
        pago,
        observacoes,
        criado_por
      }])
      .select()
      .single();
      
    if (error) throw error;
    return data;
  }

  static async atualizar(id, reserva) {
    const { nome, cpf, quarto, data_entrada, data_saida, status, valor, pago, observacoes } = reserva;
    
    // Verificar disponibilidade
    const disponibilidade = await this.verificarDisponibilidade(
      quarto, data_entrada, data_saida, id
    );
    
    if (!disponibilidade.disponivel) {
      const error = new Error('Quarto não disponível para o período selecionado');
      error.conflitos = disponibilidade.conflitos;
      throw error;
    }
    
    const { data, error } = await supabase
      .from('reservas')
      .update({
        nome,
        cpf,
        quarto,
        data_entrada,
        data_saida,
        status,
        valor,
        pago,
        observacoes,
        updated_at: new Date()
      })
      .eq('id', id);
      
    if (error) throw error;
    
    return { 
      changes: data ? 1 : 0,
      id
    };
  }

  static async atualizarStatus(id, status) {
    const { data, error } = await supabase
      .from('reservas')
      .update({
        status,
        updated_at: new Date()
      })
      .eq('id', id);
      
    if (error) throw error;
    
    return { 
      changes: data ? 1 : 0,
      id,
      status
    };
  }

  static async excluir(id) {
    const { data, error } = await supabase
      .from('reservas')
      .delete()
      .eq('id', id);
      
    if (error) throw error;
    
    return { changes: data ? 1 : 0 };
  }
}

module.exports = Reserva; 
