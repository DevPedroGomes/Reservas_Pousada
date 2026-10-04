import { and, asc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { db, quartos, reservas, type Quarto } from '../db/index.js';
import { STATUS_QUE_OCUPAM } from '../utils/status.js';

export interface DadosQuarto {
  numero?: number;
  nome?: string;
  tipo?: string | null;
  capacidade?: number;
  precoBaseCentavos?: number | null;
  descricao?: string | null;
  ativo?: boolean;
  ordem?: number;
}

/** Operação recusada por regra de negócio (a rota responde 409). */
export class QuartoRecusado extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'QuartoRecusado';
  }
}


export class QuartoModel {
  static async listar(pousadaId: number, incluirInativos = true): Promise<Quarto[]> {
    return db
      .select()
      .from(quartos)
      .where(incluirInativos ? eq(quartos.pousadaId, pousadaId) : and(eq(quartos.pousadaId, pousadaId), eq(quartos.ativo, true)))
      .orderBy(asc(quartos.ordem), asc(quartos.numero));
  }

  static async buscar(id: number, pousadaId: number): Promise<Quarto | null> {
    const [q] = await db.select().from(quartos).where(and(eq(quartos.id, id), eq(quartos.pousadaId, pousadaId))).limit(1);
    return q ?? null;
  }

  /** O quarto existe e está ativo nesta pousada? (para aceitar reserva) */
  static async existeAtivo(pousadaId: number, numero: number): Promise<boolean> {
    const [q] = await db
      .select({ id: quartos.id })
      .from(quartos)
      .where(and(eq(quartos.pousadaId, pousadaId), eq(quartos.numero, numero), eq(quartos.ativo, true)))
      .limit(1);
    return Boolean(q);
  }

  static async contarAtivos(pousadaId: number): Promise<number> {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(quartos)
      .where(and(eq(quartos.pousadaId, pousadaId), eq(quartos.ativo, true)));
    return Number(n) || 0;
  }

  /** Há reserva ocupando este quarto de hoje em diante? */
  static async temReservaVigente(pousadaId: number, numero: number, hoje: string): Promise<boolean> {
    const [r] = await db
      .select({ id: reservas.id })
      .from(reservas)
      .where(and(
        eq(reservas.pousadaId, pousadaId),
        eq(reservas.quarto, numero),
        inArray(reservas.status, [...STATUS_QUE_OCUPAM]),
        isNull(reservas.deletedAt),
        gt(reservas.dataSaida, hoje),
      ))
      .limit(1);
    return Boolean(r);
  }

  static async criar(pousadaId: number, dados: DadosQuarto): Promise<Quarto> {
    const numero = dados.numero ?? await this.proximoNumero(pousadaId);
    try {
      const [q] = await db
        .insert(quartos)
        .values({
          pousadaId,
          numero,
          nome: dados.nome?.trim() || `Quarto ${numero}`,
          tipo: dados.tipo ?? null,
          capacidade: dados.capacidade ?? 2,
          precoBaseCentavos: dados.precoBaseCentavos ?? null,
          descricao: dados.descricao ?? null,
          ativo: dados.ativo ?? true,
          ordem: dados.ordem ?? numero,
        })
        .returning();
      return q;
    } catch (err) {
      if ((err as { cause?: { code?: string } }).cause?.code === '23505' || (err as { code?: string }).code === '23505') {
        throw new QuartoRecusado(`Já existe um quarto com o número ${numero}.`);
      }
      throw err;
    }
  }

  static async atualizar(id: number, pousadaId: number, dados: DadosQuarto, hoje: string): Promise<Quarto | null> {
    const atual = await this.buscar(id, pousadaId);
    if (!atual) return null;

    if (dados.ativo === false && atual.ativo && await this.temReservaVigente(pousadaId, atual.numero, hoje)) {
      throw new QuartoRecusado(`O quarto ${atual.numero} tem reservas a partir de hoje. Mova-as antes de desativá-lo.`);
    }

    try {
      const [q] = await db
        .update(quartos)
        .set({
          ...(dados.numero !== undefined ? { numero: dados.numero } : {}),
          ...(dados.nome !== undefined ? { nome: dados.nome.trim() || `Quarto ${dados.numero ?? atual.numero}` } : {}),
          ...(dados.tipo !== undefined ? { tipo: dados.tipo } : {}),
          ...(dados.capacidade !== undefined ? { capacidade: dados.capacidade } : {}),
          ...(dados.precoBaseCentavos !== undefined ? { precoBaseCentavos: dados.precoBaseCentavos } : {}),
          ...(dados.descricao !== undefined ? { descricao: dados.descricao } : {}),
          ...(dados.ativo !== undefined ? { ativo: dados.ativo } : {}),
          ...(dados.ordem !== undefined ? { ordem: dados.ordem } : {}),
        })
        .where(and(eq(quartos.id, id), eq(quartos.pousadaId, pousadaId)))
        .returning();
      return q ?? null;
    } catch (err) {
      const codigo = (err as { cause?: { code?: string } }).cause?.code ?? (err as { code?: string }).code;
      if (codigo === '23505') throw new QuartoRecusado(`Já existe um quarto com o número ${dados.numero}.`);
      if (codigo === '23P01') throw new QuartoRecusado('Renumerar este quarto criaria choque de datas com outro quarto.');
      throw err;
    }
  }

  /**
   * Remove o quarto. Com histórico de reservas ele é só desativado (a reserva
   * antiga precisa continuar apontando para algo); sem histórico, sai de vez.
   */
  static async remover(id: number, pousadaId: number, hoje: string): Promise<'removido' | 'desativado' | null> {
    const atual = await this.buscar(id, pousadaId);
    if (!atual) return null;
    if (await this.temReservaVigente(pousadaId, atual.numero, hoje)) {
      throw new QuartoRecusado(`O quarto ${atual.numero} tem reservas a partir de hoje. Mova-as antes de removê-lo.`);
    }
    const [historico] = await db
      .select({ id: reservas.id })
      .from(reservas)
      .where(and(eq(reservas.pousadaId, pousadaId), eq(reservas.quarto, atual.numero)))
      .limit(1);
    if (historico) {
      await db.update(quartos).set({ ativo: false }).where(eq(quartos.id, id));
      return 'desativado';
    }
    await db.delete(quartos).where(eq(quartos.id, id));
    return 'removido';
  }

  static async proximoNumero(pousadaId: number): Promise<number> {
    const [{ max }] = await db
      .select({ max: sql<number>`COALESCE(MAX(${quartos.numero}), 0)::int` })
      .from(quartos)
      .where(eq(quartos.pousadaId, pousadaId));
    return (Number(max) || 0) + 1;
  }

  /**
   * Ajusta a quantidade de quartos ativos a partir do campo "número de
   * quartos" (atalho da tela de configurações e do onboarding). Aumentar
   * reativa os inativos de menor número e depois cria novos; diminuir
   * desativa os de maior número — recusando se algum tiver reserva vigente.
   */
  static async ajustarQuantidade(pousadaId: number, alvo: number, hoje: string): Promise<void> {
    const todos = await this.listar(pousadaId, true);
    const ativos = todos.filter((q) => q.ativo).sort((a, b) => a.numero - b.numero);
    if (alvo > ativos.length) {
      let faltam = alvo - ativos.length;
      for (const q of todos.filter((x) => !x.ativo).sort((a, b) => a.numero - b.numero)) {
        if (faltam === 0) break;
        await db.update(quartos).set({ ativo: true }).where(eq(quartos.id, q.id));
        faltam--;
      }
      for (; faltam > 0; faltam--) await this.criar(pousadaId, {});
    } else if (alvo < ativos.length) {
      const sair = ativos.slice(alvo);
      const ocupados: number[] = [];
      for (const q of sair) if (await this.temReservaVigente(pousadaId, q.numero, hoje)) ocupados.push(q.numero);
      if (ocupados.length > 0) {
        throw new QuartoRecusado(
          `Há reservas a partir de hoje nos quartos ${ocupados.join(', ')}. Mova-as antes de reduzir para ${alvo} quartos.`,
        );
      }
      for (const q of sair) await db.update(quartos).set({ ativo: false }).where(eq(quartos.id, q.id));
    }
  }
}

export default QuartoModel;
