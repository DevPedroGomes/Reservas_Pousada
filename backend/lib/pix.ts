/**
 * Pix "copia e cola" (BR Code, padrão EMV do Banco Central) a partir da
 * chave Pix da pousada — sem gateway, sem contrato: qualquer app de banco
 * lê. O valor e o identificador (txid) vão no código; a confirmação do
 * recebimento é manual (a pousada vê o Pix entrar e confirma).
 */
import QRCode from 'qrcode';

export type TipoChavePix = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria';

/** CRC16-CCITT (polinômio 0x1021, inicial 0xFFFF), como o BR Code exige. */
export function crc16(texto: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(texto, 'utf8')) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

const campo = (id: string, valor: string) => `${id}${String(Buffer.byteLength(valor, 'utf8')).padStart(2, '0')}${valor}`;

/** Sem acento e só o que o padrão aceita nos campos de nome/cidade. */
function limpar(texto: string, max: number): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 .-]/g, '').trim().slice(0, max);
}

/** Chave no formato que o DICT espera (telefone com +55, CPF/CNPJ só dígitos). */
export function normalizarChavePix(tipo: TipoChavePix, chave: string): string | null {
  const t = chave.trim();
  const digitos = t.replace(/\D/g, '');
  switch (tipo) {
    case 'cpf': return digitos.length === 11 ? digitos : null;
    case 'cnpj': return digitos.length === 14 ? digitos : null;
    case 'telefone': {
      const d = t.startsWith('+') ? digitos : digitos.length <= 11 ? `55${digitos}` : digitos;
      return d.length >= 12 && d.length <= 13 ? `+${d}` : null;
    }
    case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) && t.length <= 77 ? t.toLowerCase() : null;
    case 'aleatoria': return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t) ? t.toLowerCase() : null;
    default: return null;
  }
}

export interface DadosPixEstatico {
  chave: string;
  nome: string;
  cidade: string;
  valorCentavos?: number;
  /** Identificador que aparece no extrato (até 25 letras/números). */
  txid?: string;
  descricao?: string;
}

export function payloadPix(d: DadosPixEstatico): string {
  const conta = campo('00', 'br.gov.bcb.pix') + campo('01', d.chave) + (d.descricao ? campo('02', limpar(d.descricao, 40)) : '');
  const txid = (d.txid ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  const semCrc =
    campo('00', '01') +
    campo('26', conta) +
    campo('52', '0000') +
    campo('53', '986') +
    (d.valorCentavos ? campo('54', (d.valorCentavos / 100).toFixed(2)) : '') +
    campo('58', 'BR') +
    campo('59', limpar(d.nome, 25) || 'RECEBEDOR') +
    campo('60', limpar(d.cidade, 15) || 'BRASIL') +
    campo('62', campo('05', txid)) +
    '6304';
  return semCrc + crc16(semCrc);
}

/** QR Code do código, como imagem PNG em data URL. */
export function qrCodeDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 1, width: 320 });
}
