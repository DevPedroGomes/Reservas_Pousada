import { Router, Request, Response } from 'express';
import StaffInviteModel from '../models/StaffInvite.js';
import { authMiddleware } from '../middleware/auth.js';
import { auth } from '../lib/auth.js';
import { excedeLimiteDeUsuarios } from '../middleware/assinatura.js';
import { param } from '../utils/http.js';

const router = Router();

/**
 * GET /api/convites/:token
 * Validate invite and return info (public - no auth required)
 */
router.get('/:token', async (req: Request, res: Response) => {
  try {
    const token = param(req, 'token');

    if (!token || token.length < 32) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Token inválido',
      });
    }

    const result = await StaffInviteModel.buscarPorToken(token);

    if (!result) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Convite não encontrado',
      });
    }

    const { invite, pousadaNome } = result;

    if (invite.status !== 'pending') {
      return res.status(410).json({
        sucesso: false,
        mensagem: 'Este convite já foi utilizado ou revogado',
      });
    }

    if (new Date(invite.expiresAt) < new Date()) {
      return res.status(410).json({
        sucesso: false,
        mensagem: 'Este convite expirou',
      });
    }

    res.json({
      sucesso: true,
      convite: {
        pousadaNome,
        role: invite.role,
        email: invite.email,
        expiresAt: invite.expiresAt,
      },
    });
  } catch (error) {
    console.error('Erro ao validar convite:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao validar convite',
    });
  }
});

/**
 * POST /api/convites/:token/aceitar
 * Accept an invite (requires auth)
 */
router.post('/:token/aceitar', authMiddleware, async (req: Request, res: Response) => {
  try {
    const token = param(req, 'token');

    if (!token || token.length < 32) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Token inválido',
      });
    }

    if (!req.user?.id || !req.user?.email) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Você precisa estar autenticado para aceitar o convite',
      });
    }

    // O plano pode ter mudado desde o convite (downgrade): confere a vaga.
    const pousadaDoConvite = await StaffInviteModel.pousadaDoConvite(token);
    if (pousadaDoConvite) {
      const estouro = await excedeLimiteDeUsuarios(pousadaDoConvite, { noAceite: true });
      if (estouro) {
        return res.status(402).json({ sucesso: false, codigo: 'BILLING_003', mensagem: estouro });
      }
    }

    // Só e-mail confirmado aceita convite: o convite é para um endereço, e
    // quem não provou ser dono do endereço não pode ocupar a vaga dele.
    if (!req.user.emailVerified) {
      return res.status(403).json({ sucesso: false, mensagem: 'Confirme seu e-mail antes de aceitar o convite.' });
    }

    const result = await StaffInviteModel.aceitar(token, req.user.id, req.user.email);

    // Revoke all other active sessions for this user (session-pinning protection
    // after privilege change). The current session remains valid so the user
    // doesn't need to re-login.
    try {
      await auth.api.revokeOtherSessions({
        headers: req.headers as unknown as Headers,
      });
    } catch (revokeErr) {
      console.error('[convites] Falha ao revogar sessões anteriores:', revokeErr);
    }

    res.json({
      sucesso: true,
      mensagem: 'Convite aceito com sucesso! Você agora faz parte da equipe.',
      pousadaId: result.pousadaId,
      role: result.role,
    });
  } catch (error: any) {
    console.error('Erro ao aceitar convite:', error);
    res.status(400).json({
      sucesso: false,
      mensagem: error.message || 'Erro ao aceitar convite',
    });
  }
});

export default router;
