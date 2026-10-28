import { RequestError } from './request';

export function assertEmailConfigured() {
  if (!process.env.BREVO_API_KEY || !process.env.AUTH_EMAIL_FROM) throw new RequestError('O envio de códigos ainda precisa ser configurado pelo responsável do sistema.', 503);
}

export async function sendSecurityCode(email: string, code: string, purpose: 'login' | 'reset') {
  assertEmailConfigured();
  const title = purpose === 'reset' ? 'Redefinição de senha' : 'Verificação de segurança';
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST', signal: AbortSignal.timeout(12000),
    headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY! },
    body: JSON.stringify({ sender: { name: 'Montante', email: process.env.AUTH_EMAIL_FROM }, to: [{ email }], subject: `${title} — Montante`,
      textContent: `${title}\n\nSeu código Montante é: ${code}\n\nEle expira em 10 minutos e só pode ser usado uma vez. Não compartilhe este código. Se você não solicitou, ignore este e-mail.` }),
  });
  if (!response.ok) throw new RequestError('Não foi possível enviar o código agora. Tente novamente em alguns instantes.', 503);
}
