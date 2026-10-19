import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decryptCredentials } from '@/lib/encryption';
import { MercadoPagoGateway } from '@/lib/payment/gateway-adapter';
import { getPaymentSettingsAccess } from '@/lib/payment/settings-auth';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: { params: { paymentId: string } }) {
  if (process.env.NODE_ENV === 'production' || process.env.PAYMENTS_TEST_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Endpoint de teste desativado.' }, { status: 404 });
  }
  const access = await getPaymentSettingsAccess();
  if (!access.authorized) {
    return NextResponse.json({ error: 'Acesso não autorizado. Entre com uma conta administradora da loja.' }, { status: access.status });
  }
  const config = await prisma.paymentGatewayConfig.findUnique({
    where: { tenant_id_provider: { tenant_id: access.tenantId, provider: 'mercadopago' } },
    select: { is_active: true, environment: true, encrypted_credentials: true },
  });
  if (!config?.is_active || config.environment !== 'sandbox' || !config.encrypted_credentials) {
    return NextResponse.json({ error: 'Configure e ative o Mercado Pago em ambiente Sandbox nesta loja.' }, { status: 409 });
  }
  let accessToken: string;
  try {
    const credentials = decryptCredentials(config.encrypted_credentials);
    accessToken = typeof credentials.access_token === 'string' ? credentials.access_token.trim() : '';
  } catch {
    return NextResponse.json({ error: 'Não foi possível ler as credenciais salvas. Informe o token novamente nas configurações.' }, { status: 503 });
  }
  if (!accessToken) return NextResponse.json({ error: 'Configure um Access Token válido do Mercado Pago nesta loja.' }, { status: 409 });
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(context.params.paymentId)) {
    return NextResponse.json({ error: 'Identificador de pagamento inválido.' }, { status: 400 });
  }
  try {
    const status = await new MercadoPagoGateway(accessToken).checkStatus(context.params.paymentId);
    return NextResponse.json({ status });
  } catch (error) {
    console.error('Falha ao consultar pagamento de teste:', error);
    return NextResponse.json({ error: 'Não foi possível consultar o pagamento.' }, { status: 502 });
  }
}
