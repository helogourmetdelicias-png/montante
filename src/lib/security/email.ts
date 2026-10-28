import { RequestError } from './request';
export function assertEmailConfigured() {
  if (!process.env.RESEND_API_KEY?.trim() || !process.env.AUTH_EMAIL_FROM?.trim()) throw new RequestError('A recuperação por e-mail ainda precisa ser configurada pelo responsável do sistema.', 503);
}
export async function sendSecurityCode(email: string, code: string, _purpose: 'reset') {
  assertEmailConfigured();
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(12000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}` },
    body: JSON.stringify({ from: `Montante <${process.env.AUTH_EMAIL_FROM!.trim()}>`, to: [email], subject: 'Redefinição de senha — Montante',
      text: `Seu código de recuperação Montante é: ${code}\n\nEle expira em 10 minutos e só pode ser usado uma vez. Não compartilhe este código. Se você não solicitou, ignore este e-mail.` }),
  });
  if (!response.ok) {
    console.error('auth.recovery_email_failed', { status: response.status });
    throw new RequestError('Não foi possível enviar o código agora. Tente novamente em alguns instantes.', 503);
  }
}
