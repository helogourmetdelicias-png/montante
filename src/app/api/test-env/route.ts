import { NextResponse } from 'next/server';

// Rota pública para debug de variáveis de ambiente
export async function GET() {
  // Retorna se as variáveis existem (sem expor valores sensíveis)
  return NextResponse.json({
    hasResendKey: !!process.env.RESEND_API_KEY,
    hasEmailFrom: !!process.env.AUTH_EMAIL_FROM,
    resendKeyPrefix: process.env.RESEND_API_KEY?.substring(0, 5) || 'not-found',
    emailFrom: process.env.AUTH_EMAIL_FROM || 'not-configured',
    nodeEnv: process.env.NODE_ENV,
  });
}

export const runtime = 'nodejs';
