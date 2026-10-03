/**
 * Fila de jobs no próprio Postgres (pg-boss).
 *
 * Por que no Postgres e não Redis: é o banco que já existe e tem backup; uma
 * peça a menos para operar. O pg-boss usa SKIP LOCKED, então várias réplicas
 * da API dividem os jobs sem processar o mesmo duas vezes, e agendamentos não
 * disparam em dobro.
 *
 * FILA_HABILITADA=false desliga (testes, ou emergência): os jobs agendados
 * caem num setInterval local e os e-mails são enviados na hora.
 */
import { PgBoss } from 'pg-boss';
import { TIMEZONE } from '../utils/datas.js';
import { reportarErro } from './observabilidade.js';
import { limpeza } from '../jobs/limpeza.js';
import { expirarPreReservas, finalizarEstadiasVencidas } from '../jobs/estadias.js';
import { anonimizarHospedesAntigos } from '../models/Conta.js';
import { sincronizarTodas as sincronizarCalendarios } from '../models/Ical.js';

export const FILAS = {
  email: 'email',
  limpeza: 'limpeza',
  finalizarEstadias: 'finalizar-estadias',
  anonimizarHospedes: 'anonimizar-hospedes',
  conversao: 'conversao',
  expirarPreReservas: 'expirar-pre-reservas',
  sincronizarIcal: 'sincronizar-ical',
} as const;

type Trabalhador = (dados: Record<string, unknown>) => Promise<unknown>;

let boss: PgBoss | null = null;
let intervaloLocal: NodeJS.Timeout | null = null;
const trabalhadores = new Map<string, Trabalhador>();

export function filaHabilitada(): boolean {
  return process.env.FILA_HABILITADA !== 'false';
}

export function filaAtiva(): boolean {
  return boss !== null;
}

/**
 * Registra o handler de uma fila. Chamado pelos módulos donos do trabalho
 * (ex.: lib/email.ts) antes de iniciarFila().
 */
export function registrarTrabalhador(fila: string, fn: Trabalhador): void {
  trabalhadores.set(fila, fn);
}

async function executarAgendado(nome: string, fn: () => Promise<unknown>) {
  try {
    const resultado = await fn();
    console.log(`[Fila] ${nome} concluído:`, JSON.stringify(resultado));
  } catch (err) {
    console.error(`[Fila] ${nome} falhou:`, err);
    reportarErro(err, { job: nome });
    throw err;
  }
}

export async function iniciarFila(): Promise<void> {
  if (!filaHabilitada()) {
    console.warn('[Fila] desabilitada (FILA_HABILITADA=false) — usando agendamento local');
    intervaloLocal = setInterval(() => {
      void executarAgendado('limpeza', limpeza).catch(() => {});
      void executarAgendado('finalizar-estadias', () => finalizarEstadiasVencidas()).catch(() => {});
      void executarAgendado('expirar-pre-reservas', expirarPreReservas).catch(() => {});
      void executarAgendado('sincronizar-ical', sincronizarCalendarios).catch(() => {});
    }, 6 * 60 * 60 * 1000);
    intervaloLocal.unref();
    return;
  }

  boss = new PgBoss({
    connectionString: process.env.DATABASE_URL!,
    schema: 'pgboss',
    max: Number(process.env.FILA_POOL_MAX) || 3,
    application_name: 'diaria-fila',
  } as ConstructorParameters<typeof PgBoss>[0]);
  boss.on('error', (err: unknown) => {
    console.error('[Fila] erro do pg-boss:', err);
    reportarErro(err, { origem: 'pg-boss' });
  });
  await boss.start();

  for (const nome of Object.values(FILAS)) {
    // E-mail carrega link com token (convite, redefinição de senha): o job
    // concluído é apagado em 1 dia em vez de ficar guardado por semanas.
    await boss.createQueue(nome, nome === FILAS.email ? { deleteAfterSeconds: 24 * 60 * 60 } : undefined);
  }

  // Agendados: um disparo por cron no cluster inteiro, no fuso da operação.
  await boss.schedule(FILAS.limpeza, '17 * * * *', null, { tz: TIMEZONE });
  await boss.schedule(FILAS.finalizarEstadias, '30 3 * * *', null, { tz: TIMEZONE });
  await boss.schedule(FILAS.expirarPreReservas, '*/10 * * * *', null, { tz: TIMEZONE });
  await boss.work(FILAS.expirarPreReservas, async () => executarAgendado('expirar-pre-reservas', expirarPreReservas));
  // Calendários de Booking/Airbnb: a cada 30 min (a OTA atualiza o .ics com atraso parecido).
  await boss.schedule(FILAS.sincronizarIcal, '*/30 * * * *', null, { tz: TIMEZONE });
  await boss.work(FILAS.sincronizarIcal, async () => executarAgendado('sincronizar-ical', sincronizarCalendarios));
  await boss.schedule(FILAS.anonimizarHospedes, '45 4 * * *', null, { tz: TIMEZONE });
  await boss.work(FILAS.anonimizarHospedes, async () =>
    executarAgendado('anonimizar-hospedes', anonimizarHospedesAntigos),
  );
  await boss.work(FILAS.limpeza, async () => executarAgendado('limpeza', limpeza));
  await boss.work(FILAS.finalizarEstadias, async () =>
    executarAgendado('finalizar-estadias', () => finalizarEstadiasVencidas()),
  );

  for (const [fila, fn] of trabalhadores) {
    await boss.work<Record<string, unknown>>(fila, async (jobs) => {
      for (const job of jobs) await fn(job.data);
    });
  }

  console.log(`[Fila] pg-boss iniciado (${trabalhadores.size + 4} filas)`);
}

/**
 * Enfileira um job com retentativa. Sem fila ativa, executa na hora — melhor
 * que perder o trabalho.
 */
export async function enfileirar(fila: string, dados: Record<string, unknown>): Promise<void> {
  if (boss) {
    await boss.send(fila, dados, { retryLimit: 5, retryDelay: 30, retryBackoff: true });
    return;
  }
  const fn = trabalhadores.get(fila);
  if (!fn) throw new Error(`fila sem trabalhador: ${fila}`);
  await fn(dados);
}

export async function pararFila(): Promise<void> {
  if (intervaloLocal) clearInterval(intervaloLocal);
  if (boss) {
    await boss.stop({ graceful: true, timeout: 10_000 }).catch((err: unknown) => {
      console.error('[Fila] erro ao parar:', err);
    });
    boss = null;
  }
}
