const { supabase } = require('../database/db');

class Pousada {
  /**
   * Gera um slug único baseado no nome
   */
  static gerarSlug(nome) {
    let slug = nome
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^a-z0-9\s]/g, '') // Remove caracteres especiais
      .replace(/\s+/g, '-') // Substitui espaços por hífens
      .replace(/-+/g, '-') // Remove hífens duplicados
      .trim();

    return slug;
  }

  /**
   * Verifica se um slug já existe e gera um único
   */
  static async gerarSlugUnico(nome) {
    const baseSlug = this.gerarSlug(nome);
    let slug = baseSlug;
    let counter = 0;

    while (true) {
      const { data } = await supabase
        .from('pousadas')
        .select('id')
        .eq('slug', slug)
        .single();

      if (!data) break;

      counter++;
      slug = `${baseSlug}-${counter}`;
    }

    return slug;
  }

  /**
   * Cria uma nova pousada
   */
  static async criar(pousadaData) {
    const {
      nome,
      num_quartos,
      endereco,
      cidade,
      estado,
      cep,
      telefone,
      email,
      logo_url,
      descricao,
      configuracoes
    } = pousadaData;

    const slug = await this.gerarSlugUnico(nome);

    const { data, error } = await supabase
      .from('pousadas')
      .insert([{
        nome,
        slug,
        num_quartos,
        endereco,
        cidade: cidade || null,
        estado: estado || null,
        cep: cep || null,
        telefone,
        email,
        logo_url: logo_url || null,
        descricao: descricao || null,
        configuracoes: configuracoes || {}
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Cria pousada e associa um usuário como owner
   */
  static async criarComOwner(pousadaData, userId) {
    // Criar pousada
    const pousada = await this.criar(pousadaData);

    // Atualizar usuário como owner
    const { error: userError } = await supabase
      .from('usuarios')
      .update({
        pousada_id: pousada.id,
        is_owner: true,
        role: 'admin'
      })
      .eq('id', userId);

    if (userError) throw userError;

    return pousada;
  }

  /**
   * Busca pousada por ID
   */
  static async buscarPorId(id) {
    const { data, error } = await supabase
      .from('pousadas')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Busca pousada por slug
   */
  static async buscarPorSlug(slug) {
    const { data, error } = await supabase
      .from('pousadas')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Atualiza dados da pousada
   */
  static async atualizar(id, pousadaData) {
    const {
      nome,
      num_quartos,
      endereco,
      cidade,
      estado,
      cep,
      telefone,
      email,
      logo_url,
      descricao,
      configuracoes,
      ativa
    } = pousadaData;

    const updateData = {};

    if (nome !== undefined) {
      updateData.nome = nome;
      updateData.slug = await this.gerarSlugUnico(nome);
    }
    if (num_quartos !== undefined) updateData.num_quartos = num_quartos;
    if (endereco !== undefined) updateData.endereco = endereco;
    if (cidade !== undefined) updateData.cidade = cidade;
    if (estado !== undefined) updateData.estado = estado;
    if (cep !== undefined) updateData.cep = cep;
    if (telefone !== undefined) updateData.telefone = telefone;
    if (email !== undefined) updateData.email = email;
    if (logo_url !== undefined) updateData.logo_url = logo_url;
    if (descricao !== undefined) updateData.descricao = descricao;
    if (configuracoes !== undefined) updateData.configuracoes = configuracoes;
    if (ativa !== undefined) updateData.ativa = ativa;

    const { data, error } = await supabase
      .from('pousadas')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Lista todos os quartos disponíveis (1 até num_quartos)
   */
  static async listarQuartos(pousadaId) {
    const pousada = await this.buscarPorId(pousadaId);
    if (!pousada) throw new Error('Pousada não encontrada');

    const quartos = [];
    for (let i = 1; i <= pousada.num_quartos; i++) {
      quartos.push(i);
    }
    return quartos;
  }

  /**
   * Obtém estatísticas da pousada
   */
  static async obterEstatisticas(pousadaId) {
    const pousada = await this.buscarPorId(pousadaId);
    if (!pousada) throw new Error('Pousada não encontrada');

    const hoje = new Date().toISOString().split('T')[0];

    // Buscar reservas da pousada
    const { data: reservas, error } = await supabase
      .from('reservas')
      .select('*')
      .eq('pousada_id', pousadaId);

    if (error) throw error;

    const reservasArray = reservas || [];

    // Calcular estatísticas
    const totalReservas = reservasArray.length;
    const reservasAtivas = reservasArray.filter(r => r.status === 'ativa').length;
    const reservasHoje = reservasArray.filter(r =>
      r.status === 'ativa' && (r.data_entrada === hoje || r.data_saida === hoje)
    ).length;

    // Quartos ocupados hoje
    const quartosOcupadosSet = new Set();
    reservasArray
      .filter(r => r.status === 'ativa' && r.data_entrada <= hoje && r.data_saida >= hoje)
      .forEach(r => quartosOcupadosSet.add(r.quarto));
    const quartosOcupados = quartosOcupadosSet.size;

    // Taxa de ocupação
    const taxaOcupacao = pousada.num_quartos > 0
      ? Math.round((quartosOcupados / pousada.num_quartos) * 100)
      : 0;

    // Receitas
    const receitaTotal = reservasArray
      .filter(r => r.pago === true)
      .reduce((sum, r) => sum + (parseFloat(r.valor) || 0), 0);

    const receitaPendente = reservasArray
      .filter(r => r.pago === false && r.status === 'ativa')
      .reduce((sum, r) => sum + (parseFloat(r.valor) || 0), 0);

    // Quartos disponíveis
    const quartosDisponiveis = pousada.num_quartos - quartosOcupados;

    return {
      pousada: {
        id: pousada.id,
        nome: pousada.nome,
        num_quartos: pousada.num_quartos
      },
      estatisticas: {
        total_reservas: totalReservas,
        reservas_ativas: reservasAtivas,
        reservas_hoje: reservasHoje,
        quartos_ocupados: quartosOcupados,
        quartos_disponiveis: quartosDisponiveis,
        taxa_ocupacao: taxaOcupacao,
        receita_total: receitaTotal,
        receita_pendente: receitaPendente
      }
    };
  }

  /**
   * Lista usuários da pousada
   */
  static async listarUsuarios(pousadaId) {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, username, nome, email, role, is_owner, avatar_url, created_at')
      .eq('pousada_id', pousadaId);

    if (error) throw error;
    return data || [];
  }

  /**
   * Adiciona usuário à pousada
   */
  static async adicionarUsuario(pousadaId, userId, role = 'recepcao') {
    const { error } = await supabase
      .from('usuarios')
      .update({
        pousada_id: pousadaId,
        role
      })
      .eq('id', userId);

    if (error) throw error;
    return { success: true };
  }

  /**
   * Remove usuário da pousada
   */
  static async removerUsuario(pousadaId, userId) {
    // Verificar se não é o owner
    const { data: user } = await supabase
      .from('usuarios')
      .select('is_owner')
      .eq('id', userId)
      .eq('pousada_id', pousadaId)
      .single();

    if (user?.is_owner) {
      throw new Error('Não é possível remover o proprietário da pousada');
    }

    const { error } = await supabase
      .from('usuarios')
      .update({
        pousada_id: null
      })
      .eq('id', userId)
      .eq('pousada_id', pousadaId);

    if (error) throw error;
    return { success: true };
  }

  /**
   * Verifica se usuário pertence à pousada
   */
  static async verificarAcesso(pousadaId, userId) {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, role, is_owner')
      .eq('id', userId)
      .eq('pousada_id', pousadaId)
      .single();

    if (error || !data) return null;
    return data;
  }

  /**
   * Desativa uma pousada
   */
  static async desativar(id) {
    const { error } = await supabase
      .from('pousadas')
      .update({ ativa: false })
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  }

  /**
   * Reativa uma pousada
   */
  static async reativar(id) {
    const { error } = await supabase
      .from('pousadas')
      .update({ ativa: true })
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  }
}

module.exports = Pousada;
