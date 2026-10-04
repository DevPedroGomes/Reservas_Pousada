/**
 * Fábrica de limitadores de requisição.
 *
 * Todo limitador do app passa por aqui para usar o mesmo store (Postgres,
 * compartilhado entre réplicas e persistente entre deploys) com um prefixo
 * próprio — dois limitadores nunca somam no mesmo contador.
 *
 * RATE_LIMIT_STORE=memory volta ao contador em memória (testes, ou uma única
 * instância sem banco disponível).
 */
import rateLimit, { type Options } from 'express-rate-limit';
import { pool } from '../db/index.js';
import { StorePostgres } from './rateLimitStore.js';

export function criarLimitador(nome: string, opcoes: Partial<Options>) {
  const usarMemoria = process.env.RATE_LIMIT_STORE === 'memory';
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    // Banco indisponível não pode virar 500 em toda requisição só porque o
    // contador não pôde ser gravado: a requisição segue sem limite naquele
    // instante (e falha adiante, se depender do banco).
    passOnStoreError: true,
    ...(usarMemoria ? {} : { store: new StorePostgres(pool, nome) }),
    ...opcoes,
  });
}
