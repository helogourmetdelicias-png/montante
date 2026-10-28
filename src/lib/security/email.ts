import { Resend } from 'resend';
import { RequestError } from './request';

export function assertEmailConfigured() {
  const hasKey = !!process.env.RESEND_API_KEY;
  const hasFrom = !!process.env.AUTH_EMAIL_FROM;
  
  console.log('[Email Config]', {
    hasResendKey: hasKey,
    hasEmailFrom: hasFrom,
    keyPrefix: process.env.RESEND_API_KEY?.substring(0, 5),
    emailFrom: process.env.AUTH_EMAIL_FROM,
  });
  
  if (!hasKey || !hasFrom) {
    throw new RequestError('O envio de códigos ainda precisa ser configurado pelo responsável do sistema.', 503);
  }
}

export async function sendSecurityCode(email: string, code: string, purpose: 'login' | 'reset') {
  assertEmailConfigured();
  
  const resend = new Resend(process.env.RESEND_API_KEY);
  const title = purpose === 'reset' ? 'Redefinição de senha' : 'Verificação de segurança';
  
  try {
    const { error } = await resend.emails.send({
      from: `Montante <${process.env.AUTH_EMAIL_FROM}>`,
      to: [email],
      subject: `${title} — Montante`,
      html: `
        <!DOCTYPE html>
        <html lang="pt-BR">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${title}</title>
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
            <table role="presentation" style="width: 100%; border-collapse: collapse;">
              <tr>
                <td align="center" style="padding: 40px 20px;">
                  <table role="presentation" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                      <td style="padding: 40px 40px 20px; text-align: center;">
                        <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #1a1a1a;">
                          ${title}
                        </h1>
                      </td>
                    </tr>
                    
                    <!-- Body -->
                    <tr>
                      <td style="padding: 20px 40px;">
                        <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.5; color: #4a4a4a;">
                          Seu código de verificação Montante é:
                        </p>
                        
                        <!-- Code Display -->
                        <div style="background-color: #f8f9fa; border: 2px solid #e9ecef; border-radius: 8px; padding: 30px; text-align: center; margin: 20px 0;">
                          <div style="font-size: 48px; font-weight: 700; letter-spacing: 8px; color: #1a1a1a; font-family: 'Courier New', monospace;">
                            ${code}
                          </div>
                        </div>
                        
                        <p style="margin: 20px 0 0; font-size: 14px; line-height: 1.5; color: #6c757d;">
                          <strong>Atenção:</strong><br>
                          • Este código expira em <strong>10 minutos</strong><br>
                          • Só pode ser usado uma vez<br>
                          • Não compartilhe este código com ninguém
                        </p>
                      </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                      <td style="padding: 20px 40px 40px;">
                        <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #6c757d; border-top: 1px solid #e9ecef; padding-top: 20px;">
                          Se você não solicitou este código, ignore este e-mail. Sua conta permanece segura.
                        </p>
                      </td>
                    </tr>
                  </table>
                  
                  <!-- Email Footer -->
                  <table role="presentation" style="max-width: 600px; width: 100%; margin-top: 20px;">
                    <tr>
                      <td style="text-align: center; padding: 20px;">
                        <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                          © ${new Date().getFullYear()} Montante. Todos os direitos reservados.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
      text: `${title}\n\nSeu código Montante é: ${code}\n\nEle expira em 10 minutos e só pode ser usado uma vez. Não compartilhe este código. Se você não solicitou, ignore este e-mail.`,
    });

    if (error) {
      console.error('Erro ao enviar e-mail:', error);
      throw new RequestError('Não foi possível enviar o código agora. Tente novamente em alguns instantes.', 503);
    }
  } catch (error) {
    console.error('Erro ao enviar e-mail:', error);
    throw new RequestError('Não foi possível enviar o código agora. Tente novamente em alguns instantes.', 503);
  }
}
