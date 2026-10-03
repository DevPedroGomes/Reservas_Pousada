/**
 * iCalendar (RFC 5545) no mínimo que Booking, Airbnb e Google Agenda usam:
 * eventos de dia inteiro com início e fim.
 *
 * - `gerarIcal`: o calendário exportado de um quarto. Só "Reservado" — nome
 *   de hóspede nunca sai num link que a OTA (e quem tiver o link) lê.
 * - `lerIcal`: os eventos de um calendário importado.
 * - `buscarIcal`: baixa o calendário de uma URL informada pelo usuário,
 *   protegido contra SSRF: só https, nunca endereço interno (checado no
 *   momento da conexão, então DNS que muda de ideia não fura a regra),
 *   redirecionamentos limitados, tempo e tamanho máximos.
 */
import https from 'node:https';
import { lookup as dnsLookup } from 'node:dns';
import { isIP, type LookupFunction } from 'node:net';

export interface EventoIcal {
  uid: string;
  inicio: string; // YYYY-MM-DD
  fim: string; // YYYY-MM-DD (exclusivo, como DTEND de dia inteiro)
  resumo: string;
}

const CRLF = '\r\n';

/** Escapa texto de propriedade (vírgula, ponto e vírgula, barra, quebra). */
function escapar(texto: string): string {
  return texto.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Dobra linhas acima de 75 octetos (exigência da RFC; a OTA rejeita sem). */
function dobrar(linha: string): string {
  const partes: string[] = [];
  let atual = '';
  for (const ch of linha) {
    if (Buffer.byteLength(atual + ch) > 74) {
      partes.push(atual);
      atual = ' ';
    }
    atual += ch;
  }
  partes.push(atual);
  return partes.join(CRLF);
}

const dataIcal = (d: string) => d.replace(/-/g, '');

export function gerarIcal(nomeCalendario: string, eventos: { id: number; inicio: string; fim: string }[], dominio = 'diaria.app'): string {
  const agora = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const linhas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Diaria//Reservas//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapar(nomeCalendario)}`,
  ];
  for (const e of eventos) {
    linhas.push(
      'BEGIN:VEVENT',
      `UID:reserva-${e.id}@${dominio}`,
      `DTSTAMP:${agora}`,
      `DTSTART;VALUE=DATE:${dataIcal(e.inicio)}`,
      `DTEND;VALUE=DATE:${dataIcal(e.fim)}`,
      'SUMMARY:Reservado',
      'TRANSP:OPAQUE',
      'END:VEVENT',
    );
  }
  linhas.push('END:VCALENDAR');
  return linhas.map(dobrar).join(CRLF) + CRLF;
}

/** "20261120" ou "20261120T140000Z" → "2026-11-20". */
function dataDe(valor: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(valor.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function desescapar(texto: string): string {
  return texto.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1');
}

/** Eventos do calendário (ignora cancelados e os sem data válida). */
export function lerIcal(conteudo: string, limite = 2000): EventoIcal[] {
  // Desdobra: linha que começa com espaço/tab continua a anterior.
  const linhas = conteudo.replace(/\r\n|\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const eventos: EventoIcal[] = [];
  let atual: Record<string, string> | null = null;
  for (const linha of linhas) {
    if (linha === 'BEGIN:VEVENT') { atual = {}; continue; }
    if (linha === 'END:VEVENT') {
      if (atual) {
        const inicio = atual.DTSTART ? dataDe(atual.DTSTART) : null;
        let fim = atual.DTEND ? dataDe(atual.DTEND) : null;
        if (inicio && (!fim || fim <= inicio)) {
          fim = new Date(Date.parse(`${inicio}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);
        }
        if (inicio && fim && (atual.STATUS ?? '').toUpperCase() !== 'CANCELLED') {
          eventos.push({
            uid: (atual.UID || `${inicio}-${fim}`).slice(0, 255),
            inicio,
            fim,
            resumo: desescapar(atual.SUMMARY ?? '').slice(0, 80),
          });
        }
        if (eventos.length >= limite) break;
      }
      atual = null;
      continue;
    }
    if (!atual) continue;
    const i = linha.indexOf(':');
    if (i <= 0) continue;
    const nome = linha.slice(0, i).split(';')[0].toUpperCase();
    if (['DTSTART', 'DTEND', 'UID', 'SUMMARY', 'STATUS'].includes(nome)) atual[nome] = linha.slice(i + 1);
  }
  return eventos;
}

// ---------------------------------------------------------------------------
// Busca protegida

export class IcalRecusado extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'IcalRecusado';
  }
}

/** Endereço que não pode ser alvo: loopback, rede privada, link-local, etc. */
export function enderecoInterno(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return enderecoInterno(v6.slice(7));
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
}

/** DNS que recusa endereço interno — usado na conexão, não antes dela. */
export const lookupSeguro: LookupFunction = (hostname, opcoes, callback) => {
  dnsLookup(hostname, { ...opcoes, all: true }, (err, enderecos) => {
    if (err) return callback(err, '', 0);
    const lista = (enderecos as unknown as { address: string; family: number }[]);
    const proibido = lista.find((e) => enderecoInterno(e.address));
    if (proibido || lista.length === 0) {
      return callback(new IcalRecusado('Endereço não permitido para calendário.'), '', 0);
    }
    if ((opcoes as { all?: boolean }).all) return (callback as unknown as (e: null, a: typeof lista) => void)(null, lista);
    callback(null, lista[0].address, lista[0].family);
  });
};

/** Valida a URL antes de salvar: https e host que não seja IP interno. */
export function validarUrlIcal(texto: string): string | null {
  let url: URL;
  try {
    url = new URL(texto.trim());
  } catch {
    return 'Endereço do calendário inválido.';
  }
  if (url.protocol !== 'https:') return 'Use o link https do calendário (Booking e Airbnb fornecem assim).';
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || (isIP(host) && enderecoInterno(host))) {
    return 'Endereço não permitido para calendário.';
  }
  if (texto.length > 2000) return 'Endereço longo demais.';
  return null;
}

export async function buscarIcal(endereco: string, saltos = 3): Promise<string> {
  const erro = validarUrlIcal(endereco);
  if (erro) throw new IcalRecusado(erro);
  return new Promise((resolve, reject) => {
    const req = https.get(endereco, {
      lookup: lookupSeguro,
      timeout: 10_000,
      headers: { 'User-Agent': 'Diaria-iCal/1.0', Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.1' },
    }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        if (saltos <= 0) return reject(new IcalRecusado('Redirecionamentos demais.'));
        const proximo = new URL(res.headers.location, endereco).toString();
        return buscarIcal(proximo, saltos - 1).then(resolve, reject);
      }
      if (status !== 200) {
        res.resume();
        return reject(new IcalRecusado(`O calendário respondeu ${status}.`));
      }
      const partes: Buffer[] = [];
      let tamanho = 0;
      res.on('data', (c: Buffer) => {
        tamanho += c.length;
        if (tamanho > 2 * 1024 * 1024) {
          req.destroy(new IcalRecusado('Calendário grande demais (máx. 2 MB).'));
          return;
        }
        partes.push(c);
      });
      res.on('end', () => {
        const texto = Buffer.concat(partes).toString('utf8');
        if (!texto.includes('BEGIN:VCALENDAR')) return reject(new IcalRecusado('O link não devolveu um calendário iCal.'));
        resolve(texto);
      });
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new IcalRecusado('O calendário demorou demais para responder.')));
    req.on('error', reject);
  });
}
