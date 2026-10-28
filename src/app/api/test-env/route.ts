import { NextResponse } from 'next/server';

export async function GET() {
  // Esta rota só funciona em desenvolvimento para debug
  if (process.env.NODE_ENV !== 'production') {
    return NextResponse.json({
      hasResendKey: !!process.env.RESEND_API_KEY,
      hasEmailFrom: !!process.env.AUTH_EMAIL_FROM,
      resendKeyStart: process.env.RESEND_API_KEY?.substring(0, 5),
      emailFrom: process.env.AUTH_EMAIL_FROM,
    });
  }
  
  // Em produção, só retorna se as variáveis existem (sem expor valores)
  return NextResponse.json({
    hasResendKey: !!process.env.RESEND_API_KEY,
    hasEmailFrom: !!process.env.AUTH_EMAIL_FROM,
  });
}
