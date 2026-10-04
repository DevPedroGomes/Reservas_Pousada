/**
 * Atendente virtual da pousada no WhatsApp.
 *
 * O modelo de linguagem conversa; os fatos vêm SEMPRE das ferramentas, que
 * rodam no servidor com o pousada_id e o telefone de quem escreve já
 * fixados — o modelo não escolhe de qual pousada lê nem de quem são as
 * reservas. Ele pode consultar e criar pré-reserva (que expira sozinha);
 * não confirma pagamento, não cancela, não altera reserva.
 */
import { pool } from '../db/index.js';
import { modeloDoAgente, type Ferramenta, type MensagemLLM } from '../lib/llm.js';
import { disponibilidade, lerPedido, PedidoRecusado, pousadaPorId, quartosPublicos, solicitarReserva, validarEstadia, type PousadaPublica } from './Motor.js';
import { gerarCobranca, situacaoPix } from './Pix.js';
import { TIMEZONE, hojeLocal } from '../utils/datas.js';

const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: 'informacoes_da_pousada',
    descricao: 'Dados da pousada: endereço, contato, descrição, políticas (cancelamento, horários), sinal exigido e os quartos com capacidade e preço a partir de.',
    parametros: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    nome: 'consultar_disponibilidade',
    descricao: 'Quartos livres e o preço total para as datas e o número de pessoas. Use sempre antes de falar de vaga ou preço.',
    parametros: {
      type: 'object',
      properties: {
        entrada: { type: 'string', description: 'Data de entrada, AAAA-MM-DD' },
        saida: { type: 'string', description: 'Data de saída, AAAA-MM-DD' },
        adultos: { type: 'integer', minimum: 1 },
        criancas: { type: 'integer', minimum: 0 },
      },
      required: ['entrada', 'saida', 'adultos'],
      additionalProperties: false,
    },
  },
  {
    nome: 'criar_pre_reserva',
    descricao: 'Cria a pré-reserva (segura o quarto por um prazo até o sinal) depois que o hóspede escolheu o quarto e confirmou datas, pessoas e nome. Devolve valor, sinal e o Pix (se a pousada tiver).',
    parametros: {
      type: 'object',
      properties: {
        quarto: { type: 'integer', description: 'Número do quarto escolhido (da consulta de disponibilidade)' },
        entrada: { type: 'string' },
        saida: { type: 'string' },
        adultos: { type: 'integer', minimum: 1 },
        criancas: { type: 'integer', minimum: 0 },
        nome_completo: { type: 'string' },
        cpf: { type: 'string', description: 'Opcional; algumas pousadas pedem para gerar o Pix' },
      },
      required: ['quarto', 'entrada', 'saida', 'adultos', 'nome_completo'],
      additionalProperties: false,
    },
  },
  {
    nome: 'minhas_reservas',
    descricao: 'Reservas futuras ou em andamento deste número de WhatsApp nesta pousada, com situação e saldo.',
    parametros: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    nome: 'chamar_atendente',
    descricao: 'Passa a conversa para uma pessoa da equipe. Use quando pedirem, quando não souber responder, para reclamação, cancelamento, alteração ou pagamento.',
    parametros: { type: 'object', properties: { motivo: { type: 'string' } }, required: ['motivo'], additionalProperties: false },
  },
];

export interface ContextoAgente {
  pousadaId: number;
  conversaId: number;
  contato: string; // wa_id: DDI + número, só dígitos
  nomeContato: string | null;
}

/** Resultado de uma ferramenta, ou o pedido de passar a conversa para a equipe. */
async function executar(nome: string, args: Record<string, any>, ctx: ContextoAgente, p: PousadaPublica): Promise<{ resultado: unknown; transferir?: string }> {
  switch (nome) {
    case 'informacoes_da_pousada': {
      const { rows: [extra] } = await pool.query(`SELECT endereco, cep FROM pousadas WHERE id = $1`, [p.id]);
      return {
        resultado: {
          nome: p.nome, endereco: [extra?.endereco, p.cidade, p.estado].filter(Boolean).join(', ') || null, telefone: p.telefone,
          descricao: p.descricao, politicas: p.motor.politicas || null, sinal_percentual: p.motor.sinalPercentual,
          prazo_pre_reserva_horas: p.motor.prazoHoras,
          quartos: (await quartosPublicos(p.id)).map((q) => ({
            numero: q.numero, nome: q.nome, tipo: q.tipo, capacidade: q.capacidade,
            a_partir_de: q.aPartirDeCentavos !== null ? reais(q.aPartirDeCentavos) : 'sob consulta',
          })),
        },
      };
    }
    case 'consultar_disponibilidade': {
      const erro = validarEstadia(String(args.entrada), String(args.saida));
      if (erro) return { resultado: { erro } };
      const pessoas = Math.max(Number(args.adultos) || 1, 1) + Math.max(Number(args.criancas) || 0, 0);
      const livres = await disponibilidade(p.id, String(args.entrada), String(args.saida), pessoas);
      return {
        resultado: livres.length
          ? livres.map((q) => ({
              quarto: q.numero, nome: q.nome, capacidade: q.capacidade, noites: q.noites, total: reais(q.totalCentavos ?? 0),
              ...(q.atendeMinimo ? {} : { indisponivel: `mínimo de ${q.minimoNoites} noites neste período` }),
            }))
          : { mensagem: 'Nenhum quarto livre para essas datas e número de pessoas.' },
      };
    }
    case 'criar_pre_reserva': {
      const { pedido, erros } = lerPedido({
        quarto: args.quarto, entrada: args.entrada, saida: args.saida, adultos: args.adultos ?? 1, criancas: args.criancas ?? 0,
        nome: args.nome_completo, telefone: `+${ctx.contato}`, documento: args.cpf ?? '', aceite: true,
      });
      if (erros.length) return { resultado: { erro: erros.join(' ') } };
      try {
        const r = await solicitarReserva(p, pedido, 'whatsapp');
        let pix: { copia_e_cola: string; valor: string } | null = null;
        if (r.sinalCentavos > 0 && (await situacaoPix(p.id)).disponivel) {
          pix = await gerarCobranca(p.id, r.reservaId, r.sinalCentavos)
            .then((c) => ({ copia_e_cola: c.copiaECola, valor: reais(c.valorCentavos) }))
            .catch(() => null);
        }
        return {
          resultado: {
            reserva: r.reservaId, quarto: r.quarto, total: reais(r.totalCentavos), sinal: reais(r.sinalCentavos),
            segura_ate: r.expiraEm.toLocaleString('pt-BR', { timeZone: TIMEZONE, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
            pix,
            observacao: pix ? 'Envie o código Pix ao hóspede exatamente como está.' : 'A equipe vai combinar o sinal com o hóspede.',
          },
        };
      } catch (err) {
        if (err instanceof PedidoRecusado) return { resultado: { erro: err.message } };
        throw err;
      }
    }
    case 'minhas_reservas': {
      const { rows } = await pool.query(
        `SELECT r.id, q.nome AS quarto, r.data_entrada::text AS entrada, r.data_saida::text AS saida, r.status,
                COALESCE(round(r.valor * 100), 0)::int
                  + COALESCE((SELECT sum(c.quantidade * c.valor_unitario_centavos) FROM consumos c WHERE c.reserva_id = r.id), 0)::int
                  - COALESCE((SELECT sum(pg.valor_centavos) FROM pagamentos pg WHERE pg.reserva_id = r.id), 0)::int AS saldo
           FROM reservas r JOIN hospedes h ON h.id = r.hospede_id
           LEFT JOIN quartos q ON q.pousada_id = r.pousada_id AND q.numero = r.quarto
          WHERE r.pousada_id = $1 AND h.telefone = $2 AND r.deleted_at IS NULL
            AND r.status IN ('pre_reserva', 'confirmada', 'hospedada') AND r.data_saida >= $3
          ORDER BY r.data_entrada LIMIT 5`,
        [p.id, ctx.contato, hojeLocal()],
      );
      const rotulo: Record<string, string> = { pre_reserva: 'pré-reserva (aguardando sinal)', confirmada: 'confirmada', hospedada: 'hospedado(a)' };
      return {
        resultado: rows.length
          ? rows.map((r) => ({ reserva: r.id, quarto: r.quarto, entrada: r.entrada, saida: r.saida, situacao: rotulo[r.status], saldo: reais(Math.max(r.saldo, 0)) }))
          : { mensagem: 'Nenhuma reserva ativa neste número.' },
      };
    }
    case 'chamar_atendente':
      return { resultado: { ok: true }, transferir: String(args.motivo ?? 'pedido do hóspede').slice(0, 200) };
    default:
      return { resultado: { erro: 'ferramenta desconhecida' } };
  }
}

function instrucoes(p: PousadaPublica, contato: string | null): string {
  const agora = new Date();
  const hoje = agora.toLocaleDateString('pt-BR', { timeZone: TIMEZONE, weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  return [
    `Você é o atendente virtual da ${p.nome}, uma pousada, conversando pelo WhatsApp em português do Brasil.`,
    `Hoje é ${hoje} (${hojeLocal()}). Converta datas como "sexta que vem" para AAAA-MM-DD a partir de hoje.`,
    // Nome do perfil é texto livre de quem escreve: uma linha, curto.
    contato ? `O hóspede se chama ${contato.replace(/[\r\n]+/g, ' ').slice(0, 60)} (nome do perfil do WhatsApp; confirme o nome completo antes de reservar).` : '',
    'Regras:',
    '- Fale só sobre esta pousada, hospedagem e as reservas deste hóspede. Recuse outros assuntos com gentileza.',
    '- Nunca invente disponibilidade, preço, regra ou endereço: consulte as ferramentas. Se a ferramenta não trouxer, diga que vai verificar e chame um atendente.',
    '- Para reservar: consulte a disponibilidade, apresente as opções com o total, confirme quarto, datas, pessoas e nome completo, e só então crie a pré-reserva.',
    '- Depois da pré-reserva, informe o total, o sinal, até quando o quarto fica reservado e, se houver, envie o código Pix copia e cola exatamente como veio.',
    '- Você NÃO confirma pagamento, não cancela, não muda reserva, não dá desconto: para isso, chame um atendente.',
    '- Nunca peça cartão de crédito nem senhas. CPF só se for preciso para o Pix.',
    '- Não fale de outros hóspedes. Respostas curtas, cordiais, sem markdown, como numa conversa de WhatsApp.',
  ].filter(Boolean).join('\n');
}

const MAX_RODADAS = 4;

/**
 * Responde à última mensagem do hóspede. Devolve o texto a enviar e, se for
 * o caso, o motivo para passar a conversa à equipe.
 */
export async function responder(ctx: ContextoAgente, historico: MensagemLLM[]): Promise<{ texto: string; transferir?: string }> {
  const p = await pousadaPorId(ctx.pousadaId);
  if (!p) return { texto: 'No momento não consigo atender por aqui. Vou chamar alguém da equipe.', transferir: 'pousada indisponível para o agente' };
  const modelo = modeloDoAgente();
  const sistema = instrucoes(p, ctx.nomeContato);
  const mensagens = [...historico];
  let transferir: string | undefined;

  for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
    const r = await modelo.responder(sistema, mensagens, FERRAMENTAS);
    if (!r.chamadas.length) return { texto: r.texto || 'Desculpe, não entendi. Pode repetir?', transferir };
    mensagens.push({ papel: 'assistente', texto: r.texto, chamadas: r.chamadas });
    for (const c of r.chamadas) {
      const { resultado, transferir: t } = await executar(c.nome, c.argumentos, ctx, p).catch((err) => {
        console.error('[Agente] ferramenta falhou:', c.nome, err);
        return { resultado: { erro: 'falha interna; ofereça chamar um atendente' }, transferir: undefined };
      });
      if (t) transferir = t;
      mensagens.push({ papel: 'ferramenta', id: c.id, nome: c.nome, resultado: JSON.stringify(resultado) });
    }
    if (transferir) {
      return { texto: 'Certo! Vou chamar alguém da equipe para continuar com você. Em instantes alguém responde por aqui.', transferir };
    }
  }
  return { texto: 'Vou pedir para alguém da equipe confirmar isso com você.', transferir: 'agente não concluiu em poucas etapas' };
}
