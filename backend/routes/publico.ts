/**
 * Motor de reservas público (sem login): vitrine, disponibilidade e pedido.
 */
import { Router, Request, Response, NextFunction } from 'express';
import AuditoriaModel from '../models/Auditoria.js';
import {
  disponibilidade, emailsDaPousada, lerPedido, PedidoRecusado, pousadaPublica, quartosPublicos, solicitarReserva, validarEstadia,
} from '../models/Motor.js';
import { enviarPedidoParaPousada, enviarPedidoRecebido } from '../lib/email.js';
import { criarLimitador } from '../utils/limitadores.js';
import { chaveDeRateLimit } from '../utils/rede.js';
import { AppError } from '../middleware/errorHandler.js';
import { param } from '../utils/http.js';
import { TIMEZONE } from '../utils/datas.js';

const router = Router();

const consultaLimiter = criarLimitador('publico-consulta', {
  windowMs: 60 * 1000, max: 60, keyGenerator: (req) => chaveDeRateLimit(req.ip),
  message: { sucesso: false, mensagem: 'Muitas consultas seguidas. Aguarde um minuto.' },
});
// Pedido segura quarto: poucos por hora por IP.
const pedidoLimiter = criarLimitador('publico-pedido', {
  windowMs: 60 * 60 * 1000, max: 5, keyGenerator: (req) => chaveDeRateLimit(req.ip),
  message: { sucesso: false, mensagem: 'Muitos pedidos deste aparelho. Fale com a pousada pelo WhatsApp.' },
});

const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

router.get('/:slug', consultaLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const p = await pousadaPublica(param(req, 'slug'));
    if (!p) return res.status(404).json({ sucesso: false, mensagem: 'Página de reservas não encontrada' });
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json({
      sucesso: true,
      pousada: {
        nome: p.nome, slug: p.slug, cidade: p.cidade, estado: p.estado, telefone: p.telefone, descricao: p.descricao, logoUrl: p.logoUrl,
        prazoHoras: p.motor.prazoHoras, sinalPercentual: p.motor.sinalPercentual, politicas: p.motor.politicas,
      },
      quartos: await quartosPublicos(p.id),
    });
  } catch (err) {
    next(new AppError('Erro ao carregar a página', 500, 'PUB_001'));
  }
});

router.get('/:slug/disponibilidade', consultaLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const p = await pousadaPublica(param(req, 'slug'));
    if (!p) return res.status(404).json({ sucesso: false, mensagem: 'Página de reservas não encontrada' });
    const entrada = String(req.query.entrada ?? '');
    const saida = String(req.query.saida ?? '');
    const pessoas = Math.min(Math.max(Number(req.query.pessoas) || 1, 1), 40);
    const erro = validarEstadia(entrada, saida);
    if (erro) return res.status(400).json({ sucesso: false, mensagem: erro });
    res.json({ sucesso: true, quartos: await disponibilidade(p.id, entrada, saida, pessoas) });
  } catch (err) {
    next(new AppError('Erro ao consultar disponibilidade', 500, 'PUB_002'));
  }
});

router.post('/:slug/reservas', pedidoLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Campo isca: invisível para gente, preenchido por robô.
    if (req.body?.site) return res.status(400).json({ sucesso: false, mensagem: 'Pedido inválido' });
    const p = await pousadaPublica(param(req, 'slug'));
    if (!p) return res.status(404).json({ sucesso: false, mensagem: 'Página de reservas não encontrada' });
    const { pedido, erros } = lerPedido(req.body ?? {});
    if (erros.length) return res.status(400).json({ sucesso: false, mensagem: erros[0], erros });

    const r = await solicitarReserva(p, pedido);
    AuditoriaModel.log(null, 'pedido_site', 'reserva', r.reservaId, { ip: req.ip, canal: 'site' }, req.ip || null).catch(() => {});

    const prazo = r.expiraEm.toLocaleString('pt-BR', { timeZone: TIMEZONE, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const dados = {
      pousada: p.nome, reservaId: r.reservaId, hospede: pedido.nome, telefone: `+${pedido.telefone}`, quarto: r.quarto,
      entrada: br(pedido.entrada), saida: br(pedido.saida), pessoas: pedido.adultos + pedido.criancas,
      total: reais(r.totalCentavos), sinal: reais(r.sinalCentavos), prazo,
      linkReserva: `${(process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '')}/reservas/${r.reservaId}`,
    };
    // Avisos não seguram a resposta (a fila tenta de novo se o provedor falhar).
    void emailsDaPousada(p.id).then((emails) => enviarPedidoParaPousada(emails, dados)).catch((e) => console.error('[Motor] aviso à pousada:', e));
    if (pedido.email) void enviarPedidoRecebido(pedido.email, dados).catch((e) => console.error('[Motor] recibo ao hóspede:', e));

    res.status(201).json({
      sucesso: true,
      pedido: {
        id: r.reservaId, quarto: r.quarto, entrada: pedido.entrada, saida: pedido.saida,
        totalCentavos: r.totalCentavos, sinalCentavos: r.sinalCentavos, expiraEm: r.expiraEm, prazo,
      },
      whatsappPousada: p.telefone,
    });
  } catch (err) {
    if (err instanceof PedidoRecusado) return res.status(err.status).json({ sucesso: false, mensagem: err.message });
    next(new AppError('Erro ao enviar o pedido', 500, 'PUB_003'));
  }
});

export default router;
