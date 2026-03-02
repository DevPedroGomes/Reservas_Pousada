import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY;
const FRONTEND_URL = process.env.CORS_ORIGIN || 'http://localhost:3000';
const FROM_EMAIL = process.env.NODE_ENV === 'production' && resendApiKey
  ? 'Reservas Pousada <noreply@pgdev.com.br>'
  : 'Reservas Pousada <onboarding@resend.dev>';

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
// Base HTML Template
// ==========================================

function baseTemplate(content: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#4f46e5,#3b82f6);padding:32px;text-align:center;">
              <div style="display:inline-block;width:48px;height:48px;line-height:48px;background-color:rgba(255,255,255,0.2);border-radius:12px;color:#ffffff;font-size:18px;font-weight:700;text-align:center;">RP</div>
              <h1 style="color:#ffffff;font-size:20px;font-weight:700;margin:12px 0 0;">Reservas Pousada</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:32px 40px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="color:#94a3b8;font-size:12px;margin:0;">Reservas Pousada - Sistema de Gestao Hoteleira</p>
              <p style="color:#94a3b8;font-size:12px;margin:4px 0 0;">Este email foi enviado automaticamente, nao responda.</p>
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
      <td style="background:linear-gradient(135deg,#4f46e5,#3b82f6);border-radius:8px;text-align:center;">
        <a href="${url}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;">${text}</a>
      </td>
    </tr>
  </table>`;
}

// ==========================================
// Email Functions
// ==========================================

export async function sendPasswordResetEmail(
  email: string,
  name: string,
  resetUrl: string
): Promise<void> {
  const html = baseTemplate(`
    <h2 style="color:#1e293b;font-size:22px;font-weight:700;margin:0 0 16px;">Redefinir sua senha</h2>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 8px;">Ola, <strong>${name}</strong>!</p>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;">Recebemos uma solicitacao para redefinir a senha da sua conta. Clique no botao abaixo para criar uma nova senha:</p>
    ${ctaButton(resetUrl, 'Redefinir Senha')}
    <p style="color:#94a3b8;font-size:13px;line-height:1.5;margin:0 0 8px;">Este link expira em <strong>1 hora</strong>.</p>
    <p style="color:#94a3b8;font-size:13px;line-height:1.5;margin:0;">Se voce nao solicitou esta alteracao, ignore este email. Sua senha permanecera inalterada.</p>
  `, 'Redefinir Senha');

  await sendEmail(email, 'Redefinir sua senha - Reservas Pousada', html);
}

export async function sendVerificationEmail(
  email: string,
  name: string,
  verificationUrl: string
): Promise<void> {
  const html = baseTemplate(`
    <h2 style="color:#1e293b;font-size:22px;font-weight:700;margin:0 0 16px;">Verificar seu email</h2>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 8px;">Ola, <strong>${name}</strong>!</p>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;">Obrigado por criar sua conta. Para garantir a seguranca da sua conta, verifique seu email clicando no botao abaixo:</p>
    ${ctaButton(verificationUrl, 'Verificar Email')}
    <p style="color:#94a3b8;font-size:13px;line-height:1.5;margin:0;">Se voce nao criou uma conta, ignore este email.</p>
  `, 'Verificar Email');

  await sendEmail(email, 'Verificar seu email - Reservas Pousada', html);
}

export async function sendStaffInviteEmail(
  email: string,
  pousadaNome: string,
  role: string,
  inviterName: string,
  inviteUrl: string
): Promise<void> {
  const roleLabels: Record<string, string> = {
    admin: 'Administrador',
    recepcao: 'Recepcionista',
    auditoria: 'Auditor',
    operacao: 'Operacional',
  };
  const roleLabel = roleLabels[role] || role;

  const html = baseTemplate(`
    <h2 style="color:#1e293b;font-size:22px;font-weight:700;margin:0 0 16px;">Voce foi convidado!</h2>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;">
      <strong>${inviterName}</strong> convidou voce para fazer parte da equipe da pousada <strong>${pousadaNome}</strong> como <strong>${roleLabel}</strong>.
    </p>
    ${ctaButton(inviteUrl, 'Aceitar Convite')}
    <div style="background-color:#f1f5f9;border-radius:8px;padding:16px;margin:16px 0 0;">
      <p style="color:#64748b;font-size:13px;margin:0 0 4px;"><strong>Pousada:</strong> ${pousadaNome}</p>
      <p style="color:#64748b;font-size:13px;margin:0 0 4px;"><strong>Funcao:</strong> ${roleLabel}</p>
      <p style="color:#64748b;font-size:13px;margin:0;"><strong>Validade:</strong> 7 dias</p>
    </div>
    <p style="color:#94a3b8;font-size:13px;line-height:1.5;margin:16px 0 0;">Se voce nao reconhece este convite, ignore este email.</p>
  `, 'Convite para Equipe');

  await sendEmail(email, `Convite para ${pousadaNome} - Reservas Pousada`, html);
}

// ==========================================
// Core Send Function
// ==========================================

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!resend) {
    console.log(`[Email] (sem RESEND_API_KEY) Para: ${to} | Assunto: ${subject}`);
    return;
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });

    if (error) {
      console.error(`[Email] Erro ao enviar para ${to}:`, error);
    } else {
      console.log(`[Email] Enviado para ${to}: ${subject}`);
    }
  } catch (err) {
    console.error(`[Email] Falha ao enviar para ${to}:`, err);
  }
}
