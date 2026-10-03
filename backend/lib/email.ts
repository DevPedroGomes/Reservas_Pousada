import { Resend } from 'resend';
import { enfileirar, FILAS, registrarTrabalhador } from './fila.js';

/**
 * E-mails transacionais (Resend), enviados pela fila com retentativa.
 *
 * Antes: envio direto, erro engolido num catch. Se o Resend oscilasse, o
 * convite/confirmação simplesmente não chegava e a tela dizia "enviado".
 * Agora cada e-mail é um job: falha do provedor = nova tentativa com backoff,
 * e a falha definitiva fica no log (e no Sentry, se configurado).
 */

const resendApiKey = process.env.RESEND_API_KEY;
const producao = process.env.NODE_ENV === 'production';

// Remetente e resposta configuráveis: o domínio de envio é da marca, e
// responder a um e-mail transacional deve cair numa caixa que alguém lê.
const FROM_EMAIL = process.env.EMAIL_FROM?.trim()
  || (producao && resendApiKey ? 'Diária <noreply@pgdev.com.br>' : 'Diária <onboarding@resend.dev>');
const REPLY_TO = process.env.EMAIL_REPLY_TO?.trim() || undefined;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let resend: Resend | null = null;

if (resendApiKey) {
  resend = new Resend(resendApiKey);
  console.log('[Email] Resend configurado com sucesso');
} else {
  console.warn('[Email] RESEND_API_KEY não definida - emails serão logados no console');
}

export function isEmailConfigured(): boolean {
  return !!resend;
}

// ==========================================
// Template
// ==========================================

function baseTemplate(content: string, title: string): string {
  const rodape = REPLY_TO
    ? 'Dúvidas? É só responder este e-mail.'
    : 'Este e-mail foi enviado automaticamente.';
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
          <tr>
            <td style="background:linear-gradient(135deg,#c2410c,#ea580c);padding:28px 32px;text-align:center;">
              <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.2px;">Diária</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="color:#94a3b8;font-size:12px;margin:0;">Diária — gestão de reservas para pousadas</p>
              <p style="color:#94a3b8;font-size:12px;margin:4px 0 0;">${rodape}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ctaButton(url: string, text: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0;">
    <tr>
      <td style="background:#ea580c;border-radius:8px;text-align:center;">
        <a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;">${text}</a>
      </td>
    </tr>
  </table>
  <p style="color:#94a3b8;font-size:12px;line-height:1.5;margin:0 0 16px;word-break:break-all;">Se o botão não funcionar, copie e cole no navegador:<br>${escapeHtml(url)}</p>`;
}

const p = (texto: string) =>
  `<p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 12px;">${texto}</p>`;
const pequeno = (texto: string) =>
  `<p style="color:#94a3b8;font-size:13px;line-height:1.5;margin:0 0 8px;">${texto}</p>`;
const titulo = (texto: string) =>
  `<h2 style="color:#1e293b;font-size:22px;font-weight:700;margin:0 0 16px;">${texto}</h2>`;

// ==========================================
// E-mails
// ==========================================

export async function sendPasswordResetEmail(email: string, name: string, resetUrl: string): Promise<void> {
  const html = baseTemplate(`
    ${titulo('Redefinir sua senha')}
    ${p(`Olá, <strong>${escapeHtml(name)}</strong>!`)}
    ${p('Recebemos um pedido para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha:')}
    ${ctaButton(resetUrl, 'Redefinir senha')}
    ${pequeno('Este link expira em <strong>1 hora</strong>.')}
    ${pequeno('Se você não pediu isso, ignore este e-mail — sua senha continua a mesma.')}
  `, 'Redefinir senha');

  await enfileirarEmail(email, 'Redefinir sua senha — Diária', html, resetUrl);
}

export async function sendVerificationEmail(email: string, name: string, verificationUrl: string): Promise<void> {
  const html = baseTemplate(`
    ${titulo('Confirme seu e-mail')}
    ${p(`Olá, <strong>${escapeHtml(name)}</strong>!`)}
    ${p('Falta só um passo: confirme seu e-mail para ativar a conta e configurar sua pousada.')}
    ${ctaButton(verificationUrl, 'Confirmar e-mail')}
    ${pequeno('Se você não criou uma conta no Diária, ignore este e-mail.')}
  `, 'Confirme seu e-mail');

  await enfileirarEmail(email, 'Confirme seu e-mail — Diária', html, verificationUrl);
}

const ROTULOS_PAPEL: Record<string, string> = {
  admin: 'Administrador(a)',
  recepcao: 'Recepção',
  auditoria: 'Auditoria',
};

export async function sendStaffInviteEmail(
  email: string,
  pousadaNome: string,
  role: string,
  inviterName: string,
  inviteUrl: string,
): Promise<void> {
  const papel = ROTULOS_PAPEL[role] || role;
  const pousada = escapeHtml(pousadaNome);
  const html = baseTemplate(`
    ${titulo('Você foi convidado(a)!')}
    ${p(`<strong>${escapeHtml(inviterName)}</strong> convidou você para a equipe da <strong>${pousada}</strong>, como <strong>${papel}</strong>.`)}
    ${ctaButton(inviteUrl, 'Aceitar convite')}
    <div style="background-color:#f1f5f9;border-radius:8px;padding:16px;margin:16px 0 0;">
      <p style="color:#64748b;font-size:13px;margin:0 0 4px;"><strong>Pousada:</strong> ${pousada}</p>
      <p style="color:#64748b;font-size:13px;margin:0 0 4px;"><strong>Função:</strong> ${papel}</p>
      <p style="color:#64748b;font-size:13px;margin:0;"><strong>Validade:</strong> 7 dias</p>
    </div>
    ${pequeno('<br>Se você não reconhece este convite, ignore este e-mail.')}
  `, 'Convite para a equipe');

  await enfileirarEmail(email, `Convite para a equipe da ${pousadaNome} — Diária`, html, inviteUrl);
}

export interface DadosPedidoSite {
  pousada: string;
  reservaId: number;
  hospede: string;
  telefone: string;
  quarto: string;
  entrada: string; // dd/mm/aaaa
  saida: string;
  pessoas: number;
  total: string; // "R$ 1.234,00"
  sinal: string;
  prazo: string; // "04/10 às 14:00"
  linkReserva: string;
}

/** Aviso à pousada: chegou pedido pelo site, confirme antes do prazo. */
export async function enviarPedidoParaPousada(para: string[], d: DadosPedidoSite): Promise<void> {
  const linha = (rotulo: string, valor: string) =>
    `<p style="color:#64748b;font-size:13px;margin:0 0 4px;"><strong>${rotulo}:</strong> ${escapeHtml(valor)}</p>`;
  const html = baseTemplate(`
    ${titulo('Novo pedido de reserva pelo site')}
    ${p(`<strong>${escapeHtml(d.hospede)}</strong> pediu uma reserva na <strong>${escapeHtml(d.pousada)}</strong>. Ela entrou como pré-reserva e segura o quarto até <strong>${escapeHtml(d.prazo)}</strong>.`)}
    <div style="background-color:#f1f5f9;border-radius:8px;padding:16px;margin:16px 0;">
      ${linha('Quarto', d.quarto)}
      ${linha('Datas', `${d.entrada} a ${d.saida}`)}
      ${linha('Pessoas', String(d.pessoas))}
      ${linha('Total pelo tarifário', d.total)}
      ${linha('Sinal sugerido', d.sinal)}
      ${linha('WhatsApp', d.telefone)}
    </div>
    ${ctaButton(d.linkReserva, 'Abrir a reserva')}
    ${pequeno('Combine o sinal com o hóspede e confirme a reserva. Sem confirmação até o prazo, ela é cancelada e o quarto volta a ficar livre.')}
  `, 'Novo pedido de reserva');
  for (const email of para) {
    await enfileirarEmail(email, `Pedido de reserva #${d.reservaId} — ${d.hospede}`, html);
  }
}

/** Recibo ao hóspede: pedido recebido, a pousada vai confirmar. */
export async function enviarPedidoRecebido(para: string, d: DadosPedidoSite): Promise<void> {
  const html = baseTemplate(`
    ${titulo('Recebemos seu pedido de reserva')}
    ${p(`Olá, ${escapeHtml(d.hospede.split(' ')[0])}! Seu pedido na <strong>${escapeHtml(d.pousada)}</strong> foi recebido e o quarto está reservado para você até <strong>${escapeHtml(d.prazo)}</strong>, enquanto a pousada confirma.`)}
    <div style="background-color:#f1f5f9;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="color:#64748b;font-size:13px;margin:0 0 4px;"><strong>Pedido:</strong> #${d.reservaId}</p>
      <p style="color:#64748b;font-size:13px;margin:0 0 4px;"><strong>Quarto:</strong> ${escapeHtml(d.quarto)}</p>
      <p style="color:#64748b;font-size:13px;margin:0 0 4px;"><strong>Datas:</strong> ${escapeHtml(d.entrada)} a ${escapeHtml(d.saida)}</p>
      <p style="color:#64748b;font-size:13px;margin:0;"><strong>Total:</strong> ${escapeHtml(d.total)}</p>
    </div>
    ${p('A pousada vai falar com você pelo WhatsApp para combinar o sinal e confirmar.')}
    ${pequeno('Você recebeu este e-mail porque fez um pedido de reserva. Se não foi você, ignore.')}
  `, 'Pedido de reserva recebido');
  await enfileirarEmail(para, `Pedido de reserva #${d.reservaId} recebido — ${d.pousada}`, html);
}

// ==========================================
// Fila
// ==========================================

interface JobDeEmail {
  para: string;
  assunto: string;
  html: string;
  link?: string;
}

async function enfileirarEmail(para: string, assunto: string, html: string, link?: string): Promise<void> {
  await enfileirar(FILAS.email, { para, assunto, html, link } satisfies JobDeEmail);
}

/**
 * Entrega de fato. LANÇA em falha — é o que faz a fila tentar de novo.
 * Exportado para os testes.
 */
export async function entregarEmail(job: JobDeEmail): Promise<void> {
  if (!resend) {
    console.log(`[Email] (sem RESEND_API_KEY) Para: ${job.para} | Assunto: ${job.assunto}`);
    // Sem provedor, o link só existe aqui. Em desenvolvimento é o que permite
    // testar confirmação de e-mail e convite; em produção nunca vai para o log.
    if (job.link && !producao) console.log(`[Email] link: ${job.link}`);
    return;
  }

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: job.para,
    subject: job.assunto,
    html: job.html,
    ...(REPLY_TO ? { replyTo: REPLY_TO } : {}),
  });
  if (error) {
    throw new Error(`Resend recusou o envio para ${job.para}: ${error.message ?? JSON.stringify(error)}`);
  }
  console.log(`[Email] Enviado para ${job.para}: ${job.assunto}`);
}

registrarTrabalhador(FILAS.email, (dados) => entregarEmail(dados as unknown as JobDeEmail));
