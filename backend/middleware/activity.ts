import { Request, Response, NextFunction } from 'express';

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
    path: req.path,
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.get('User-Agent') || 'Unknown',
    userId: req.user?.id || 'anonymous',
  };

  // Log response after it's sent
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logMessage = `${logEntry.timestamp} | ${logEntry.method} ${logEntry.path} | ${res.statusCode} | ${duration}ms | User: ${logEntry.userId}`;

    if (process.env.NODE_ENV === 'development') {
      console.log(logMessage);
    }

    // In production, you could send this to a logging service
    if (process.env.NODE_ENV === 'production' && res.statusCode >= 400) {
      console.error(logMessage);
    }
  });

  next();
}
