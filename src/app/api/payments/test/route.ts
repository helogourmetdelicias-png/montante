import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { decryptCredentials } from '@/lib/encryption';
import { MercadoPagoGateway } from '@/lib/payment/gateway-adapter';
import { getPaymentSettingsAccess } from '@/lib/payment/settings-auth';

export const runtime = 'nodejs';

const chargeSchema = z.object({
  amount: z.number().int().min(100).max(1000000),
  description: z.string().trim().min(3).max(200),
  customerEmail: z.string().email(),
  customerName: z.string().trim().min(2).max(100),
});

export async function POST(request: Request) {
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
  if (!config?.is_active) {
    return NextResponse.json({ error: 'Ative o Mercado Pago nas configurações de pagamento desta loja.' }, { status: 409 });
  }
  if (config.environment !== 'sandbox') {
    return NextResponse.json({ error: 'A página de teste aceita somente credenciais Sandbox.' }, { status: 409 });
  }
  if (!config.encrypted_credentials) {
    return NextResponse.json({ error: 'Configure as credenciais do Mercado Pago nesta loja.' }, { status: 409 });
  }

  let accessToken: string;
  try {
    const credentials = decryptCredentials(config.encrypted_credentials);
    accessToken = typeof credentials.access_token === 'string' ? credentials.access_token.trim() : '';
  } catch {
    return NextResponse.json({ error: 'Não foi possível ler as credenciais salvas. Informe o token novamente nas configurações.' }, { status: 503 });
  }
  if (!accessToken) {
    return NextResponse.json({ error: 'Configure um Access Token válido do Mercado Pago nesta loja.' }, { status: 409 });
  }

  const parsed = chargeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados da cobrança inválidos.', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const gateway = new MercadoPagoGateway(accessToken);
    const payment = await gateway.charge({
      ...parsed.data,
      method: 'pix',
      channel: 'online',
      idempotencyKey: crypto.randomUUID(),
    });
    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    console.error('Falha ao criar cobrança de teste no Mercado Pago:', error);
    return NextResponse.json({ error: 'Não foi possível criar a cobrança de teste.' }, { status: 502 });
  }
}
