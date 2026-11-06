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
import { lembretesDeChegada } from '../jobs/lembretes.js';

export const FILAS = {
  email: 'email',
  limpeza: 'limpeza',
  finalizarEstadias: 'finalizar-estadias',
  anonimizarHospedes: 'anonimizar-hospedes',
  conversao: 'conversao',
  expirarPreReservas: 'expirar-pre-reservas',
  sincronizarIcal: 'sincronizar-ical',
  lembretesWhatsapp: 'lembretes-whatsapp',
  whatsappEntrada: 'whatsapp-entrada',
  reconciliarStripe: 'reconciliar-stripe',
} as const;

type Trabalhador = (dados: Record<string, unknown>) => Promise<unknown>;

const SEGUNDOS_NA_DLQ = 7 * 24 * 60 * 60;

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

/** Import dinâmico: ver a nota em jobs/reconciliacaoStripe.ts. */
async function reconciliarStripe() {
  const { reconciliarAssinaturas } = await import('../jobs/reconciliacaoStripe.js');
  return reconciliarAssinaturas();
}

async function executarAgendado(nome: string, fn: () => Promise<unknown>) {
  try {
    const resultado = await fn();
    console.log(`[Fila] ${nome} concluído:`, JSON.stringify(resultado));
  } catch (err) {
    console.error(`[Fila] ${nome} falhou:`, err);
    throw err;
  }
}

/** Sem pg-boss não há retentativa: toda falha já é a última. */
function executarLocal(nome: string, fn: () => Promise<unknown>) {
  void executarAgendado(nome, fn).catch((err) => reportarErro(err, { job: nome }));
}

const nomeDaDlq = (fila: string) => `${fila}-dlq`;

type JobDaFila = { id: string; data: Record<string, unknown>; retryCount: number; retryLimit: number };

/**
 * Roda os jobs de um lote. A falha sempre volta ao pg-boss, que decide entre
 * tentar de novo e mandar para a fila de mortos. Só a última tentativa alerta:
 * falha transitória que a retentativa resolve não é incidente.
 */
export async function processarLote(
  fila: string,
  fn: Trabalhador,
  jobs: JobDaFila[],
  alertar: (erro: unknown, contexto: Record<string, unknown>) => void = reportarErro,
): Promise<void> {
  for (const job of jobs) {
    try {
      await fn(job.data);
    } catch (err) {
      if (job.retryCount >= job.retryLimit) {
        alertar(err, { fila, jobId: job.id, tentativas: job.retryCount + 1, dlq: nomeDaDlq(fila) });
      }
      throw err;
    }
  }
}

export async function iniciarFila(): Promise<void> {
  if (!filaHabilitada()) {
    console.warn('[Fila] desabilitada (FILA_HABILITADA=false) — usando agendamento local');
    intervaloLocal = setInterval(() => {
      executarLocal('limpeza', limpeza);
      executarLocal('finalizar-estadias', () => finalizarEstadiasVencidas());
      executarLocal('expirar-pre-reservas', expirarPreReservas);
      executarLocal('sincronizar-ical', sincronizarCalendarios);
      executarLocal('reconciliar-stripe', reconciliarStripe);
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

  const fila = boss;
  for (const nome of Object.values(FILAS)) {
    const dlq = nomeDaDlq(nome);
    // O job morto carrega o dado do original (e-mail com link, mensagem de
    // hóspede): sai sozinho depois de uma semana em vez de ficar guardado.
    await fila.createQueue(dlq, { retentionSeconds: SEGUNDOS_NA_DLQ, deleteAfterSeconds: SEGUNDOS_NA_DLQ });
    const opcoes = {
      deadLetter: dlq,
      retentionSeconds: SEGUNDOS_NA_DLQ,
      // E-mail leva link com token e WhatsApp leva a conversa do hóspede: o job
      // concluído é apagado em 1 dia em vez de ficar guardado por semanas.
      ...(nome === FILAS.email || nome === FILAS.whatsappEntrada ? { deleteAfterSeconds: 24 * 60 * 60 } : {}),
    };
    await fila.createQueue(nome, opcoes);
    // createQueue não mexe em fila que já existe, e as de produção nasceram sem DLQ.
    await fila.updateQueue(nome, opcoes);
  }

  const trabalhar = (nome: string, fn: Trabalhador) =>
    fila.work<Record<string, unknown>, void, { includeMetadata: true }>(nome, { includeMetadata: true }, (jobs) => processarLote(nome, fn, jobs));

  // Agendados: um disparo por cron no cluster inteiro, no fuso da operação.
  await boss.schedule(FILAS.limpeza, '17 * * * *', null, { tz: TIMEZONE });
  await boss.schedule(FILAS.finalizarEstadias, '30 3 * * *', null, { tz: TIMEZONE });
  await boss.schedule(FILAS.expirarPreReservas, '*/10 * * * *', null, { tz: TIMEZONE });
  await trabalhar(FILAS.expirarPreReservas, () => executarAgendado('expirar-pre-reservas', expirarPreReservas));
  // Calendários de Booking/Airbnb: a cada 30 min (a OTA atualiza o .ics com atraso parecido).
  await boss.schedule(FILAS.sincronizarIcal, '*/30 * * * *', null, { tz: TIMEZONE });
  await trabalhar(FILAS.sincronizarIcal, () => executarAgendado('sincronizar-ical', sincronizarCalendarios));
  // Lembrete de chegada (véspera, 10h) — só envia com a API oficial do WhatsApp configurada.
  await boss.schedule(FILAS.lembretesWhatsapp, '0 10 * * *', null, { tz: TIMEZONE });
  await trabalhar(FILAS.lembretesWhatsapp, () => executarAgendado('lembretes-whatsapp', () => lembretesDeChegada()));
  // Pega o que o webhook do Stripe perdeu. Fora do horário de pico, uma vez por dia.
  await boss.schedule(FILAS.reconciliarStripe, '15 5 * * *', null, { tz: TIMEZONE });
  await trabalhar(FILAS.reconciliarStripe, () => executarAgendado('reconciliar-stripe', reconciliarStripe));
  await boss.schedule(FILAS.anonimizarHospedes, '45 4 * * *', null, { tz: TIMEZONE });
  await trabalhar(FILAS.anonimizarHospedes, () => executarAgendado('anonimizar-hospedes', anonimizarHospedesAntigos));
  await trabalhar(FILAS.limpeza, () => executarAgendado('limpeza', limpeza));
  await trabalhar(FILAS.finalizarEstadias, () => executarAgendado('finalizar-estadias', () => finalizarEstadiasVencidas()));

  for (const [nome, fn] of trabalhadores) {
    await trabalhar(nome, fn);
  }

  console.log(`[Fila] pg-boss iniciado (${Object.keys(FILAS).length} filas, cada uma com DLQ)`);
}

/**
 * Enfileira um job com retentativa. Sem fila ativa, executa na hora — melhor
 * que perder o trabalho.
 */
export async function enfileirar(fila: string, dados: Record<string, unknown>, opcoes: { retryLimit?: number } = {}): Promise<void> {
  if (boss) {
    await boss.send(fila, dados, { retryLimit: opcoes.retryLimit ?? 5, retryDelay: 30, retryBackoff: true });
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
