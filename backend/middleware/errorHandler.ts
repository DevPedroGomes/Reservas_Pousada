import { Request, Response, NextFunction } from 'express';
import { reportarErro } from '../lib/observabilidade.js';

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
    requestId: req.id,
    message: err.message,
    // Stack sempre no log do servidor (é onde se investiga um 500); só a
    // resposta ao cliente é que nunca o carrega fora de desenvolvimento.
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  // Erros do próprio Express/body-parser (JSON malformado, corpo grande demais)
  // trazem `status` 4xx. Antes viravam 500 "erro interno" — o cliente mandou
  // algo errado e o servidor assumia a culpa, sujando o alerta de 5xx.
  const statusDoExpress = (err as { status?: unknown; statusCode?: unknown }).status
    ?? (err as { statusCode?: unknown }).statusCode;
  const erroDoCliente = typeof statusDoExpress === 'number' && statusDoExpress >= 400 && statusDoExpress < 500;

  const statusCode = err instanceof AppError ? err.statusCode : erroDoCliente ? (statusDoExpress as number) : 500;
  const codigo = err instanceof AppError ? err.codigo : erroDoCliente ? 'ERR_REQUEST' : 'ERR_INTERNAL';

  if (statusCode >= 500) {
    reportarErro(err, { requestId: req.id, rota: `${req.method} ${req.path}` });
  }

  // Send error response
  res.status(statusCode).json({
    sucesso: false,
    codigo,
    // Número para o suporte achar este erro no log.
    requestId: req.id,
    mensagem: statusCode >= 500
      ? 'Erro interno do servidor'
      : erroDoCliente && !(err instanceof AppError)
        ? 'Requisição inválida'
        : err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}
