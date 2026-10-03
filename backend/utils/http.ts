import type { Request } from 'express';

/**
 * Parâmetro de rota como string.
 *
 * No Express 5 o tipo de `req.params[x]` é `string | string[]` (curingas
 * podem casar vários segmentos). As rotas deste app só usam parâmetros
 * simples, então o primeiro valor é o que importa.
 */
export function param(req: Request, nome: string): string {
  const v = req.params[nome];
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}
