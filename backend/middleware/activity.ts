import { Request, Response, NextFunction } from 'express';
import { rotaSegura } from '../utils/rotaSegura.js';

/**
 * Activity logger middleware
 * Logs all API requests for monitoring and debugging
 */
export function activityLogger(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();

  // Log request
  const logEntry = {
    timestamp: new Date().toISOString(),
    method: req.method,
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.get('User-Agent') || 'Unknown',
  };

  // Log response after it's sent
  res.on('finish', () => {
    const duration = Date.now() - startTime;

    // O usuário é lido AQUI, não na entrada. Este middleware é montado
    // globalmente antes do authMiddleware (que é por rota), então na entrada
    // `req.user` ainda não existe — capturá-lo ali fazia 100% dos logs de
    // produção dizerem `user: anonymous`, inclusive os 4xx/5xx, e a
    // rastreabilidade por usuário simplesmente não existia.
    const userId = req.user?.id || 'anonymous';
    // Também só aqui: o template da rota só existe depois que ela casou.
    const rota = rotaSegura(req);

    if (process.env.NODE_ENV === 'production') {
      // Structured JSON log - captured by Docker and queryable via `docker compose logs`
      const logData = {
        t: logEntry.timestamp,
        rid: req.id,
        method: logEntry.method,
        path: rota,
        status: res.statusCode,
        ms: duration,
        user: userId,
        ip: logEntry.ip,
      };
      if (res.statusCode >= 400) {
        console.error(JSON.stringify(logData));
      } else {
        console.log(JSON.stringify(logData));
      }
    } else {
      const logMessage = `${logEntry.timestamp} | ${logEntry.method} ${rota} | ${res.statusCode} | ${duration}ms | User: ${userId} | ${req.id ?? '-'}`;
      console.log(logMessage);
    }
  });

  next();
}
