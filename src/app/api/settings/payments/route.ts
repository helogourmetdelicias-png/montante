import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { decryptCredentials, encryptCredentials } from '@/lib/encryption';
import { PAYMENT_PROVIDER_CATALOG } from '@/lib/payment/provider-catalog';
import { getPaymentSettingsAccess } from '@/lib/payment/settings-auth';
import { ManualPixConfigurationError, resolveManualPixConfig } from '@/lib/payment/pix-manual';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const providerIds = PAYMENT_PROVIDER_CATALOG.map(({ id }) => id) as [string, ...string[]];
const credentialsSchema = z.record(z.string().trim().min(1).max(64), z.string().max(4096)).superRefine((values, context) => {
  if (Object.keys(values).length > 20) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Limite de 20 campos de credencial.' });
  }
}).transform(values => {
  const supplied = Object.fromEntries(Object.entries(values).filter(([, value]) => value.trim()));
  return Object.keys(supplied).length ? supplied : undefined;
});

const configSchema = z.object({
  provider: z.enum(providerIds),
  displayName: z.string().trim().max(80).optional(),
  environment: z.enum(['sandbox', 'production']).default('sandbox'),
  isActive: z.boolean().default(false),
  isDefault: z.boolean().default(false),
  credentials: credentialsSchema.optional(),
});

function publicConfig(config: {
  id: string;
  provider: string;
  display_name: string | null;
  environment: string;
  is_active: boolean;
  is_default: boolean;
  encrypted_credentials: string | null;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: config.id,
    provider: config.provider,
    displayName: config.display_name,
    environment: config.environment,
    isActive: config.is_active,
    isDefault: config.is_default,
    credentialsConfigured: Boolean(config.encrypted_credentials),
    createdAt: config.created_at,
    updatedAt: config.updated_at,
  };
}

export async function GET() {
  const access = await getPaymentSettingsAccess();
  if (!access.authorized) {
    return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: access.status });
  }

  const configurations = await prisma.paymentGatewayConfig.findMany({
    where: { tenant_id: access.tenantId },
    orderBy: [{ is_default: 'desc' }, { provider: 'asc' }],
  });

  return NextResponse.json({
    providers: PAYMENT_PROVIDER_CATALOG,
    configurations: configurations.map(publicConfig),
  });
}

export async function POST(request: Request) {
  const access = await getPaymentSettingsAccess();
  if (!access.authorized) {
    return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: access.status });
  }

  const parsed = configSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Configuração inválida.', details: parsed.error.flatten() }, { status: 400 });
  }

  const input = parsed.data;
  const definition = PAYMENT_PROVIDER_CATALOG.find(({ id }) => id === input.provider);
  if (!definition) return NextResponse.json({ error: 'Provedor não suportado.' }, { status: 400 });

  const currentConfig = await prisma.paymentGatewayConfig.findUnique({
    where: { tenant_id_provider: { tenant_id: access.tenantId, provider: input.provider } },
    select: { encrypted_credentials: true, environment: true, id: true },
  });
  let effectiveCredentials = input.credentials;
  if (input.provider === 'pagbank' && currentConfig && currentConfig.environment !== input.environment && await prisma.paymentAttempt.count({ where: { tenant_id: access.tenantId, gateway_config_id: currentConfig.id, status: { in: ['CREATED', 'PENDING'] } } })) {
    return NextResponse.json({ error: 'Concilie as cobranças PagBank pendentes antes de trocar o ambiente.' }, { status: 409 });
  }
  if ((!effectiveCredentials || input.provider === 'pix_manual') && currentConfig?.encrypted_credentials) {
    try {
      const savedCredentials = decryptCredentials(currentConfig.encrypted_credentials) as Record<string, string>;
      effectiveCredentials = input.provider === 'pix_manual' ? { ...savedCredentials, ...input.credentials } : savedCredentials;
    } catch {
      return NextResponse.json({ error: 'Não foi possível validar a credencial já salva. Informe-a novamente.' }, { status: 409 });
    }
  }

  if (input.isActive && definition.state !== 'available') {
    return NextResponse.json({ error: 'A integração deste provedor ainda não foi implementada.' }, { status: 409 });
  }
  if (input.isDefault && !input.isActive) {
    return NextResponse.json({ error: 'Ative a configuração antes de defini-la como padrão.' }, { status: 400 });
  }
  if (input.isActive && input.provider === 'mercadopago' && !effectiveCredentials?.access_token?.trim()) {
    return NextResponse.json({ error: 'Informe o Access Token do Mercado Pago.' }, { status: 400 });
  }
  if (input.isActive && input.provider === 'pagarme' && !effectiveCredentials?.api_key?.trim()) {
    return NextResponse.json({ error: 'Informe a chave secreta da API Pagar.me.' }, { status: 400 });
  }
  if (input.isActive && input.provider === 'pagbank' && !effectiveCredentials?.token?.trim()) {
    return NextResponse.json({ error: 'Informe o token da API de Pedidos PagBank correspondente ao ambiente selecionado.' }, { status: 400 });
  }
  if (input.isActive && input.provider === 'pix_manual') {
    try {
      const tenant = await prisma.tenant.findUnique({ where: { id: access.tenantId }, select: { name: true, address_city: true } });
      const manual = resolveManualPixConfig(effectiveCredentials ?? {}, tenant ?? undefined);
      effectiveCredentials = { pix_key: manual.pixKey, pix_key_type: manual.pixKeyType, merchant_name: manual.merchantName, merchant_city: manual.merchantCity };
    } catch (error) {
      if (error instanceof ManualPixConfigurationError) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ error: 'Não foi possível validar os dados do recebedor Pix.' }, { status: 503 });
    }
  }

  let encryptedCredentials: string | undefined;
  const credentialsToSave = input.provider === 'pix_manual' ? effectiveCredentials : input.credentials;
  if (credentialsToSave) {
    try {
      encryptedCredentials = encryptCredentials(credentialsToSave);
    } catch {
      console.error('Payment credential encryption is unavailable; check ENCRYPTION_KEY.');
      return NextResponse.json({ error: 'A chave de proteção das credenciais está ausente ou inválida. Configure ENCRYPTION_KEY e reinicie o servidor.' }, { status: 503 });
    }
  }

  const configuration = await prisma.$transaction(async (transaction) => {
    if (input.isDefault) {
      await transaction.paymentGatewayConfig.updateMany({
        where: { tenant_id: access.tenantId, is_default: true },
        data: { is_default: false },
      });
    }

    return transaction.paymentGatewayConfig.upsert({
      where: {
        tenant_id_provider: { tenant_id: access.tenantId, provider: input.provider },
      },
      create: {
        tenant_id: access.tenantId,
        provider: input.provider,
        display_name: input.displayName,
        environment: input.environment,
        is_active: input.isActive,
        is_default: input.isDefault,
        encrypted_credentials: encryptedCredentials ?? null,
        pix_key: null,
        pix_key_type: null,
      },
      update: {
        display_name: input.displayName,
        environment: input.environment,
        is_active: input.isActive,
        is_default: input.isDefault,
        ...(encryptedCredentials ? { encrypted_credentials: encryptedCredentials } : {}),
      },
    });
  });

  return NextResponse.json({ configuration: publicConfig(configuration) });
}
