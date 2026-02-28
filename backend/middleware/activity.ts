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

    if (process.env.NODE_ENV === 'production') {
      // Structured JSON log - captured by Docker and queryable via `docker compose logs`
      const logData = {
        t: logEntry.timestamp,
        method: logEntry.method,
        path: logEntry.path,
        status: res.statusCode,
        ms: duration,
        user: logEntry.userId,
        ip: logEntry.ip,
      };
      if (res.statusCode >= 400) {
        console.error(JSON.stringify(logData));
      } else {
        console.log(JSON.stringify(logData));
      }
    } else {
      const logMessage = `${logEntry.timestamp} | ${logEntry.method} ${logEntry.path} | ${res.statusCode} | ${duration}ms | User: ${logEntry.userId}`;
      console.log(logMessage);
    }
  });

  next();
}
