/**
 * Observabilidade: request-id e envio de erros ao Sentry (opcional).
 *
 * Sem SENTRY_DSN nada é carregado — o SDK nem é importado, para não gastar
 * memória num container de 256 MB. Com DSN, só erros 5xx e falhas fora do
 * fluxo de requisição são enviados; corpo da requisição, cookies e headers
 * nunca vão junto (CPF e sessão não podem sair para um terceiro).
 */
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

type SentryLike = {
  captureException: (erro: unknown, contexto?: Record<string, unknown>) => void;
  flush: (ms: number) => Promise<boolean>;
};

let sentry: SentryLike | null = null;

export async function iniciarObservabilidade(): Promise<void> {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;
  try {
    const Sentry = await import('@sentry/node');
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.APP_VERSION || undefined,
      sendDefaultPii: false,
      tracesSampleRate: 0,
      beforeSend(evento) {
        // Defesa em profundidade: nada da requisição além de método e rota.
        if (evento.request) {
          evento.request = { method: evento.request.method, url: evento.request.url };
        }
        delete evento.user;
        return evento;
      },
    });
    sentry = Sentry as unknown as SentryLike;
    console.log('[Observabilidade] Sentry habilitado');
  } catch (err) {
    console.error('[Observabilidade] falha ao iniciar o Sentry — seguindo sem ele:', err);
  }
}

/** Envia um erro ao Sentry, se configurado. Nunca lança. */
export function reportarErro(erro: unknown, contexto: Record<string, unknown> = {}): void {
  if (!sentry) return;
  try {
    sentry.captureException(erro, { extra: contexto });
  } catch {
    /* observabilidade nunca derruba a aplicação */
  }
}

/** Dá tempo de o SDK despachar o que está na fila antes de o processo sair. */
export async function descarregarErros(): Promise<void> {
  if (!sentry) return;
  await sentry.flush(2000).catch(() => false);
}

/**
 * Request-id: aceita o que veio do proxy (X-Request-Id) ou gera um. Volta no
 * header da resposta e no JSON de erro — é o número que o cliente passa ao
 * suporte e que se procura no log.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const recebido = req.get('x-request-id');
  const id = recebido && /^[A-Za-z0-9._-]{8,100}$/.test(recebido) ? recebido : randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
}
