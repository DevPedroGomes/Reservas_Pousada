import { Request, Response, NextFunction } from 'express';

/**
 * Custom error class with status code
 */
export class AppError extends Error {
  statusCode: number;
  codigo: string;

  constructor(message: string, statusCode: number = 500, codigo: string = 'ERR_UNKNOWN') {
    super(message);
    this.statusCode = statusCode;
    this.codigo = codigo;
    this.name = 'AppError';
  }
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req: Request, res: Response, next: NextFunction) {
  res.status(404).json({
    sucesso: false,
    codigo: 'NOT_FOUND',
    mensagem: `Rota ${req.method} ${req.path} não encontrada`
  });
}

/**
 * Global error handler middleware
 */
export function errorHandler(err: Error | AppError, req: Request, res: Response, next: NextFunction) {
  // Log error for debugging
  console.error('Error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  // Determine status code
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const codigo = err instanceof AppError ? err.codigo : 'ERR_INTERNAL';

  // Send error response
  res.status(statusCode).json({
    sucesso: false,
    codigo,
    mensagem: statusCode === 500 ? 'Erro interno do servidor' : err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}
