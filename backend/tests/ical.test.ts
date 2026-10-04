/**
 * iCal: formato exportado, leitura de feeds reais e a guarda contra SSRF.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buscarIcal, enderecoInterno, gerarIcal, IcalRecusado, lerIcal, lookupSeguro, validarUrlIcal } from '../lib/ical.js';

// Recorte no formato que o Airbnb publica (linha dobrada, DTSTART de data).
const AIRBNB = [
  'BEGIN:VCALENDAR', 'PRODID:-//Airbnb Inc//Hosting Calendar 1.0//EN', 'VERSION:2.0',
  'BEGIN:VEVENT', 'DTEND;VALUE=DATE:20261123', 'DTSTART;VALUE=DATE:20261120', 'UID:1418fb94e984-abc@airbnb.com',
  'DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/details/HM',
  ' ABCDE12345', 'SUMMARY:Reserved', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTEND;VALUE=DATE:20261201', 'DTSTART;VALUE=DATE:20261128', 'UID:bloqueio-1@airbnb.com',
  'SUMMARY:Airbnb (Not available)', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART:20261210T140000Z', 'DTEND:20261212T110000Z', 'UID:x@booking.com', 'SUMMARY:CLOSED - Not available', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261215', 'UID:sem-fim', 'SUMMARY:Um dia', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261218', 'DTEND;VALUE=DATE:20261220', 'UID:cancelado', 'STATUS:CANCELLED', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('iCal — leitura', () => {
  it('lê eventos de data e de data-hora, completa fim ausente e ignora cancelados', () => {
    const ev = lerIcal(AIRBNB);
    assert.deepEqual(ev.map((e) => [e.uid, e.inicio, e.fim]), [
      ['1418fb94e984-abc@airbnb.com', '2026-11-20', '2026-11-23'],
      ['bloqueio-1@airbnb.com', '2026-11-28', '2026-12-01'],
      ['x@booking.com', '2026-12-10', '2026-12-12'],
      ['sem-fim', '2026-12-15', '2026-12-16'],
    ]);
    assert.equal(ev[1].resumo, 'Airbnb (Not available)');
  });
});

describe('iCal — exportação', () => {
  it('gera calendário válido, sem dado de hóspede, com CRLF e linhas dobradas', () => {
    const ics = gerarIcal('Pousada Sol, Suíte; Mar', [{ id: 7, inicio: '2026-11-20', fim: '2026-11-23' }], 'diaria.app');
    assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
    assert.ok(ics.includes('X-WR-CALNAME:Pousada Sol\\, Suíte\\; Mar'));
    assert.ok(ics.includes('UID:reserva-7@diaria.app'));
    assert.ok(ics.includes('DTSTART;VALUE=DATE:20261120\r\nDTEND;VALUE=DATE:20261123'));
    assert.ok(ics.includes('SUMMARY:Reservado'));
    assert.ok(ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75));
    // O que sai é lido de volta igual.
    assert.deepEqual(lerIcal(ics).map((e) => [e.inicio, e.fim]), [['2026-11-20', '2026-11-23']]);
  });
});

describe('iCal — guarda contra SSRF', () => {
  it('reconhece endereços internos', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.9', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      assert.equal(enderecoInterno(ip), true, ip);
    }
    for (const ip of ['8.8.8.8', '200.160.2.3', '2001:4860:4860::8888']) assert.equal(enderecoInterno(ip), false, ip);
  });

  it('recusa http, localhost e IP interno antes de qualquer conexão', () => {
    assert.match(validarUrlIcal('http://www.airbnb.com/calendar/ical/1.ics')!, /https/);
    assert.ok(validarUrlIcal('https://localhost/x.ics'));
    assert.ok(validarUrlIcal('https://169.254.169.254/latest/meta-data'));
    assert.ok(validarUrlIcal('https://[::1]/x'));
    assert.ok(validarUrlIcal('nada'));
    assert.equal(validarUrlIcal('https://www.airbnb.com.br/calendar/ical/123.ics?s=abc'), null);
  });

  it('nome que resolve para endereço interno é barrado na resolução usada pela conexão', async () => {
    // Um domínio qualquer pode apontar para 127.0.0.1; a checagem vale no DNS da conexão.
    const erro = await new Promise<Error | null>((ok) => lookupSeguro('localhost', {}, (e) => ok(e)));
    assert.ok(erro instanceof IcalRecusado, String(erro));
  });

  it('buscar recusa URL inválida sem abrir conexão', async () => {
    await assert.rejects(buscarIcal('http://exemplo.com/x.ics'), IcalRecusado);
  });
});
