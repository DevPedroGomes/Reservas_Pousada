/**
 * Datas no fuso da operação — NÃO em UTC.
 *
 * O container roda com TZ=UTC. Usar `new Date()` / `toISOString()` para descobrir
 * "que dia é hoje" fazia o sistema virar o dia às 21h de Brasília: entre 21h e
 * meia-noite, a recepção não conseguia lançar reserva com check-in para hoje
 * ("data no passado") e o dashboard já mostrava o dia seguinte.
 *
 * Todas as datas de reserva são DATE puro (sem hora) e são comparadas como
 * strings ISO `YYYY-MM-DD`, que ordenam lexicograficamente igual à ordem
 * cronológica. Isso evita completamente aritmética de Date/fuso.
 */

export const TIMEZONE = process.env.APP_TIMEZONE || 'America/Sao_Paulo';

// 'en-CA' formata como YYYY-MM-DD, que é exatamente o formato do DATE do Postgres.
const formatador = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Data de hoje no fuso da operação, como 'YYYY-MM-DD'.
 */
export function hojeLocal(referencia: Date = new Date()): string {
  return formatador.format(referencia);
}

/**
 * Compara duas datas ISO 'YYYY-MM-DD'. Retorna <0, 0 ou >0.
 * Comparação de string é suficiente e correta para este formato.
 */
export function compararDatas(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * A data é hoje ou futura, no fuso da operação?
 */
export function eHojeOuFuturo(data: string): boolean {
  return compararDatas(data, hojeLocal()) >= 0;
}
