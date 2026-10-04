/**
 * Importação de reservas por planilha (CSV já convertido em linhas pelo
 * navegador, com as colunas mapeadas para os nomes abaixo).
 *
 * Feita para quem chega do Excel ou do caderno: aceita data dd/mm/aaaa,
 * valor "R$ 1.234,56", quarto por número ou nome, status e canal em
 * português. Estadia passada entra como finalizada. Sem documento nem
 * telefone, a reserva entra só com o nome (sem cadastro de hóspede).
 *
 * `simular`: valida tudo e aponta conflitos (com o que já existe e entre as
 * próprias linhas) sem gravar — é a prévia que a tela mostra.
 */
import { pool } from '../db/index.js';
import HospedeModel, { type DadosHospede } from './Hospede.js';
import QuartoModel from './Quarto.js';
import ReservaModel from './Reserva.js';
import { normalizarDocumento } from '../utils/crypto.js';
import { CANAIS_RESERVA, sanitizarNome, sanitizarString, validarCPF, validarEmail } from '../utils/validation.js';
import { ehStatusReserva } from '../utils/status.js';
import { hojeLocal } from '../utils/datas.js';

export const MAX_LINHAS = 2000;

export type LinhaBruta = Record<string, unknown>;

export interface ResultadoLinha {
  linha: number;
  ok: boolean;
  erro?: string;
  aviso?: string;
  /** Na simulação, o que seria gravado (para a prévia). */
  resumo?: { nome: string; quarto: number; entrada: string; saida: string; status: string; valor: number | null };
  reservaId?: number;
}

const texto = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

/** "2026-11-20", "20/11/2026" ou "20/11/26" → "2026-11-20" (ou null). */
export function lerData(v: unknown): string | null {
  const t = texto(v);
  let a: number, m: number, d: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (r) [a, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t))) {
    [d, m, a] = [Number(r[1]), Number(r[2]), Number(r[3])];
    if (a < 100) a += 2000;
  } else return null;
  const data = new Date(Date.UTC(a, m - 1, d));
  if (data.getUTCFullYear() !== a || data.getUTCMonth() !== m - 1 || data.getUTCDate() !== d) return null;
  return data.toISOString().slice(0, 10);
}

/** "R$ 1.234,56", "1234.56", "350" → número em reais (null se vazio/inválido). */
export function lerValor(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let t = texto(v).replace(/R\$|\s/gi, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function lerPago(v: unknown): boolean {
  return ['sim', 's', 'yes', 'y', 'true', '1', 'x', 'pago', 'paga', 'ok', 'quitado'].includes(semAcento(texto(v)));
}

function lerStatus(v: unknown): string | null {
  const t = semAcento(texto(v)).replace(/[\s-]+/g, '_');
  if (!t) return null;
  if (ehStatusReserva(t)) return t;
  const mapa: Record<string, string> = {
    ativa: 'confirmada', reservada: 'confirmada', confirmado: 'confirmada', reserva: 'confirmada',
    pre: 'pre_reserva', prereserva: 'pre_reserva', pendente: 'pre_reserva', aguardando: 'pre_reserva',
    hospedado: 'hospedada', check_in: 'hospedada', checkin: 'hospedada',
    finalizado: 'finalizada', concluida: 'finalizada', concluido: 'finalizada', check_out: 'finalizada', checkout: 'finalizada', encerrada: 'finalizada',
    cancelado: 'cancelada', noshow: 'no_show', nao_compareceu: 'no_show', no_show: 'no_show',
  };
  return mapa[t] ?? null;
}

function lerCanal(v: unknown): string {
  const t = semAcento(texto(v)).replace(/\.com$/, '').replace(/\s+/g, '');
  if (!t) return 'direto';
  if ((CANAIS_RESERVA as readonly string[]).includes(t)) return t;
  if (t.includes('booking')) return 'booking';
  if (t.includes('airbnb')) return 'airbnb';
  if (t.includes('zap') || t.includes('whats')) return 'whatsapp';
  if (t.includes('insta')) return 'instagram';
  if (t.includes('fone') || t.includes('ligacao')) return 'telefone';
  if (t.includes('balcao') || t.includes('direto') || t.includes('walk')) return 'direto';
  return 'outro';
}

/** Documento: CPF (11 dígitos) ou passaporte/outro. Devolve erro se CPF inválido. */
function lerDocumento(v: unknown): { tipo: 'cpf' | 'passaporte' | 'outro'; valor: string } | { erro: string } | null {
  const t = texto(v);
  if (!t) return null;
  const digitos = t.replace(/\D/g, '');
  if (/^[\d.\-\s/]+$/.test(t) && digitos.length === 11) {
    return validarCPF(digitos) ? { tipo: 'cpf', valor: digitos } : { erro: 'CPF inválido' };
  }
  const alfanum = normalizarDocumento('outro', t);
  if (alfanum.length < 5 || alfanum.length > 20) return { erro: 'Documento inválido' };
  return { tipo: /[A-Z]/.test(alfanum) ? 'passaporte' : 'outro', valor: alfanum };
}

interface LinhaNormalizada {
  nome: string;
  hospede: DadosHospede | null;
  quarto: number;
  entrada: string;
  saida: string;
  status: string;
  valor: number | null;
  pago: boolean;
  adultos: number;
  criancas: number;
  canal: string;
  observacoes: string | null;
}

export async function importarPlanilha(
  pousadaId: number,
  userId: string,
  linhas: LinhaBruta[],
  simular: boolean,
): Promise<{ resultados: ResultadoLinha[]; criadas: number; comErro: number }> {
  const hoje = hojeLocal();
  const quartos = await QuartoModel.listar(pousadaId);
  const porNome = new Map(quartos.map((q) => [semAcento(q.nome), q.numero]));
  const numeros = new Set(quartos.map((q) => q.numero));
  // Intervalos já aceitos nesta planilha, para pegar choque entre linhas.
  const ocupadoNaPlanilha = new Map<number, { entrada: string; saida: string; linha: number }[]>();
  const resultados: ResultadoLinha[] = [];
  let criadas = 0;

  for (const [i, bruta] of linhas.entries()) {
    const linha = i + 2; // linha 1 da planilha é o cabeçalho
    const erro = (mensagem: string) => resultados.push({ linha, ok: false, erro: mensagem });

    const nome = sanitizarNome(texto(bruta.nome));
    if (nome.length < 2) { erro('Nome do hóspede ausente'); continue; }

    const qTexto = texto(bruta.quarto);
    const qNumero = /^\d+$/.test(qTexto) ? Number(qTexto) : porNome.get(semAcento(qTexto)) ?? Number(/(\d+)\s*$/.exec(qTexto)?.[1]);
    if (!qNumero || !numeros.has(qNumero)) { erro(`Quarto "${qTexto}" não existe — cadastre em Quartos ou corrija a planilha`); continue; }

    const entrada = lerData(bruta.data_entrada);
    const saida = lerData(bruta.data_saida);
    if (!entrada || !saida) { erro('Data de entrada ou saída inválida (use dd/mm/aaaa)'); continue; }
    if (saida <= entrada) { erro('Saída precisa ser depois da entrada'); continue; }

    const doc = lerDocumento(bruta.documento ?? bruta.cpf);
    if (doc && 'erro' in doc) { erro(doc.erro); continue; }
    const telefoneBruto = texto(bruta.telefone);
    const telDigitos = telefoneBruto.replace(/\D/g, '');
    const telefone = telDigitos.length >= 10 && telDigitos.length <= 15 ? (telefoneBruto.startsWith('+') ? `+${telDigitos}` : telDigitos) : null;
    const email = texto(bruta.email).toLowerCase();

    const statusInformado = lerStatus(bruta.status);
    if (texto(bruta.status) && !statusInformado) { erro(`Status "${texto(bruta.status)}" não reconhecido`); continue; }
    // Sem status: estadia que já acabou entra como finalizada.
    const status = statusInformado ?? (saida <= hoje ? 'finalizada' : 'confirmada');

    const valor = lerValor(bruta.valor);
    if (texto(bruta.valor) && valor === null) { erro(`Valor "${texto(bruta.valor)}" inválido`); continue; }
    const adultos = Number(texto(bruta.adultos) || 1);
    const criancas = Number(texto(bruta.criancas) || 0);
    if (!Number.isInteger(adultos) || adultos < 1 || adultos > 50 || !Number.isInteger(criancas) || criancas < 0 || criancas > 50) {
      erro('Adultos/crianças inválidos'); continue;
    }

    const n: LinhaNormalizada = {
      nome,
      hospede: doc || telefone
        ? {
            nome,
            ...(doc ? { tipoDocumento: doc.tipo, documento: doc.valor } : { tipoDocumento: 'cpf' as const }),
            ...(telefone ? { telefone: telefone.startsWith('+') ? telefone.slice(1) : telDigitos.length <= 11 ? `55${telDigitos}` : telDigitos } : {}),
            ...(email && validarEmail(email) ? { email } : {}),
          }
        : null,
      quarto: qNumero, entrada, saida, status, valor, pago: lerPago(bruta.pago), adultos, criancas,
      canal: lerCanal(bruta.canal),
      observacoes: sanitizarString(texto(bruta.observacoes), 2000, true) || null,
    };

    // Já importada antes (mesmo nome, quarto e datas)? Pula sem erro.
    const { rows: [existe] } = await pool.query(
      `SELECT id FROM reservas WHERE pousada_id = $1 AND quarto = $2 AND data_entrada = $3 AND data_saida = $4
          AND lower(nome) = lower($5) AND deleted_at IS NULL LIMIT 1`,
      [pousadaId, n.quarto, n.entrada, n.saida, n.nome],
    );
    if (existe) { resultados.push({ linha, ok: true, aviso: 'Já existe — não será duplicada', reservaId: existe.id }); continue; }

    const ocupa = ['pre_reserva', 'confirmada', 'hospedada'].includes(n.status);
    if (ocupa) {
      const choque = (ocupadoNaPlanilha.get(n.quarto) ?? []).find((o) => o.entrada < n.saida && o.saida > n.entrada);
      if (choque) { erro(`Choca com a linha ${choque.linha} (mesmo quarto e datas)`); continue; }
      const { disponivel, conflitos } = await ReservaModel.verificarDisponibilidade(n.quarto, n.entrada, n.saida, null, pousadaId);
      if (!disponivel) { erro(`Quarto ${n.quarto} já ocupado nessas datas (${conflitos[0]?.nome ?? 'outra reserva'})`); continue; }
    }

    const resumo = { nome: n.nome, quarto: n.quarto, entrada: n.entrada, saida: n.saida, status: n.status, valor: n.valor };
    if (simular) {
      if (ocupa) ocupadoNaPlanilha.set(n.quarto, [...(ocupadoNaPlanilha.get(n.quarto) ?? []), { entrada: n.entrada, saida: n.saida, linha }]);
      resultados.push({ linha, ok: true, resumo });
      continue;
    }

    try {
      const hospede = n.hospede ? await HospedeModel.resolver(pousadaId, n.hospede) : null;
      const { rows: [criada] } = await pool.query(
        `INSERT INTO reservas (pousada_id, nome, hospede_id, quarto, data_entrada, data_saida, status, valor, pago,
                               adultos, criancas, canal, observacoes, criado_por,
                               check_in_em, check_out_em, cancelada_em)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                 CASE WHEN $7 IN ('hospedada', 'finalizada') THEN $5::date + time '14:00' END,
                 CASE WHEN $7 = 'finalizada' THEN $6::date + time '11:00' END,
                 CASE WHEN $7 = 'cancelada' THEN now() END)
         RETURNING id`,
        [pousadaId, hospede?.nome ?? n.nome, hospede?.id ?? null, n.quarto, n.entrada, n.saida, n.status, n.valor,
          n.pago, n.adultos, n.criancas, n.canal, n.observacoes, userId],
      );
      // "Pago" da planilha vira pagamento, para a conta e os relatórios baterem.
      if (n.pago && n.valor && n.valor > 0) {
        await pool.query(
          `INSERT INTO pagamentos (pousada_id, reserva_id, valor_centavos, forma, tipo, recebido_em, observacao, criado_por)
           VALUES ($1, $2, $3, 'outro', 'pagamento', $4, 'Importado da planilha', $5)`,
          [pousadaId, criada.id, Math.round(n.valor * 100), n.entrada, userId],
        );
      }
      if (ocupa) ocupadoNaPlanilha.set(n.quarto, [...(ocupadoNaPlanilha.get(n.quarto) ?? []), { entrada: n.entrada, saida: n.saida, linha }]);
      criadas++;
      resultados.push({ linha, ok: true, resumo, reservaId: criada.id });
    } catch (err) {
      const e = err as { code?: string; cause?: { code?: string }; message?: string };
      if (e.code === '23P01' || e.cause?.code === '23P01') erro(`Quarto ${n.quarto} já ocupado nessas datas`);
      else erro(e.message ? `Não foi possível gravar: ${e.message}` : 'Não foi possível gravar');
    }
  }

  return { resultados, criadas, comErro: resultados.filter((r) => !r.ok).length };
}
