/**
 * Cliente HTTP dos testes de rota: guarda cookies e manda o X-Forwarded-For
 * próprio (o app confia no proxy), como clientes distintos na internet.
 */
export type Resposta = { status: number; json: any };

export class Cliente {
  private cookies = new Map<string, string>();
  pousada: number | null = null;
  constructor(private readonly base: string, private readonly ip: string) {}

  async req(metodo: string, caminho: string, corpo?: unknown, extra: Record<string, string> = {}): Promise<Resposta> {
    const headers: Record<string, string> = { Origin: 'http://localhost:3000', 'X-Forwarded-For': this.ip, ...extra };
    if (corpo !== undefined) headers['Content-Type'] = 'application/json';
    if (this.cookies.size) headers.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    if (this.pousada && !('X-Pousada-Id' in extra)) headers['X-Pousada-Id'] = String(this.pousada);
    const r = await fetch(this.base + caminho, {
      method: metodo,
      headers,
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      redirect: 'manual',
    });
    for (const c of r.headers.getSetCookie()) {
      const [par] = c.split(';');
      const i = par.indexOf('=');
      const [k, v] = [par.slice(0, i), par.slice(i + 1)];
      if (v) this.cookies.set(k, v);
      else this.cookies.delete(k);
    }
    const texto = await r.text();
    let json: any = texto;
    try { json = JSON.parse(texto); } catch { /* texto puro */ }
    return { status: r.status, json };
  }
}
