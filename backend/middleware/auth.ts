import { Request, Response, NextFunction } from 'express';
import { auth } from '../lib/auth.js';
import { db, user } from '../db/index.js';
import { eq } from 'drizzle-orm';

// Extend Express Request to include user and session
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        name: string;
        email: string;
        image?: string | null;
        role: string;
        pousadaId: number | null;
        isOwner: boolean;
      };
      session?: {
        id: string;
        userId: string;
        token: string;
        expiresAt: Date;
      };
    }
  }
}

/**
 * Authentication middleware using Better Auth
 * Validates session and attaches user to request
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    // Get session from Better Auth
    const session = await auth.api.getSession({
      headers: req.headers as unknown as Headers,
    });

    if (!session || !session.user) {
      return res.status(401).json({
        sucesso: false,
        codigo: 'AUTH_001',
        mensagem: 'Token de acesso requerido'
      });
    }

    // Get full user data from database (including custom fields)
    const [userData] = await db
      .select()
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1);

    if (!userData) {
      return res.status(401).json({
        sucesso: false,
        codigo: 'AUTH_002',
        mensagem: 'Usuário não encontrado'
      });
    }

    // Attach user and session to request
    req.user = {
      id: userData.id,
      name: userData.name,
      email: userData.email,
      image: userData.image,
      role: userData.role || 'recepcao',
      pousadaId: userData.pousadaId,
      isOwner: userData.isOwner || false,
    };

    req.session = {
      id: session.session.id,
      userId: session.session.userId,
      token: session.session.token,
      expiresAt: session.session.expiresAt,
    };

    next();
  } catch (error) {
    console.error('Erro no middleware de autenticação:', error);
    return res.status(401).json({
      sucesso: false,
      codigo: 'AUTH_003',
      mensagem: 'Token inválido ou expirado'
    });
  }
}

/**
 * Middleware that requires user to have a pousada configured
 */
export function requirePousada(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !req.user.pousadaId) {
    return res.status(403).json({
      sucesso: false,
      codigo: 'AUTHZ_002',
      mensagem: 'Pousada não configurada. Complete o onboarding primeiro.',
      needsOnboarding: true
    });
  }
  next();
}

/**
 * Middleware that requires user to be owner of the pousada
 */
export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !req.user.isOwner) {
    return res.status(403).json({
      sucesso: false,
      codigo: 'AUTHZ_001',
      mensagem: 'Apenas o proprietário pode realizar esta ação'
    });
  }
  next();
}

/**
 * Factory for role-based authorization middleware
 * @param allowedRoles - Roles allowed to access the route
 */
export function authorize(allowedRoles: string[] = []) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        sucesso: false,
        codigo: 'AUTH_001',
        mensagem: 'Token de acesso requerido'
      });
    }

    // Owners have full access
    if (req.user.isOwner) {
      return next();
    }

    // Check if user role is in allowed roles
    if (allowedRoles.length === 0 || allowedRoles.includes(req.user.role)) {
      return next();
    }

    return res.status(403).json({
      sucesso: false,
      codigo: 'AUTHZ_001',
      mensagem: 'Acesso negado para este perfil'
    });
  };
}
