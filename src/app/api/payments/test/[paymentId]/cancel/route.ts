import { NextResponse } from 'next/server';
import { decryptCredentials } from '@/lib/encryption';
import { MercadoPagoGateway } from '@/lib/payment/gateway-adapter';
import { prisma } from '@/lib/prisma';
import { getPaymentSettingsAccess } from '@/lib/payment/settings-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Cancels a disposable Sandbox Order without touching local sales or stock. */
export async function POST(_request: Request, context: { params: Promise<{ paymentId: string }> }) {
  const params = await context.params;
  if (process.env.NODE_ENV === 'production' || process.env.PAYMENTS_TEST_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Endpoint de teste desativado.' }, { status: 404 });
  }

  const access = await getPaymentSettingsAccess();
  if (!access.authorized) {
    return NextResponse.json({ error: 'Acesso não autorizado. Entre com uma conta administradora da loja.' }, { status: access.status });
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(params.paymentId)) {
    return NextResponse.json({ error: 'Identificador de pagamento inválido.' }, { status: 400 });
  }

  const config = await prisma.paymentGatewayConfig.findUnique({
    where: { tenant_id_provider: { tenant_id: access.tenantId, provider: 'mercadopago' } },
    select: { is_active: true, environment: true, encrypted_credentials: true },
  });
  if (!config?.is_active || config.environment !== 'sandbox' || !config.encrypted_credentials) {
    return NextResponse.json({ error: 'Configure e ative o Mercado Pago em ambiente Sandbox nesta loja.' }, { status: 409 });
  }

  try {
    const credentials = decryptCredentials(config.encrypted_credentials);
    const accessToken = typeof credentials.access_token === 'string' ? credentials.access_token.trim() : '';
    if (!accessToken) return NextResponse.json({ error: 'Configure um Access Token válido do Mercado Pago nesta loja.' }, { status: 409 });

    const status = await new MercadoPagoGateway(accessToken).cancelOrder(params.paymentId);
    return NextResponse.json({ status });
  } catch (error) {
    console.error('Falha ao cancelar cobrança de teste no Mercado Pago:', error);
    return NextResponse.json({ error: 'Não foi possível cancelar a cobrança de teste.' }, { status: 502 });
  }
}
