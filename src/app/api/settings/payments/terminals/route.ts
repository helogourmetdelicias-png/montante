import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { PAYMENT_PROVIDER_CATALOG } from '@/lib/payment/provider-catalog';
import { getPaymentSettingsAccess } from '@/lib/payment/settings-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const providerIds = PAYMENT_PROVIDER_CATALOG.map(({ id }) => id) as [string, ...string[]];
const terminalSchema = z.object({
  provider: z.enum(providerIds),
  externalTerminalId: z.string().trim().min(1).max(100),
  externalStoreId: z.string().trim().max(100).optional(),
  name: z.string().trim().min(2).max(80),
  gatewayConfigId: z.string().cuid().optional(),
});

export async function GET() {
  const access = await getPaymentSettingsAccess();
  if (!access.authorized) {
    return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: access.status });
  }

  const terminals = await prisma.paymentTerminal.findMany({
    where: { tenant_id: access.tenantId },
    select: {
      id: true,
      provider: true,
      external_terminal_id: true,
      external_store_id: true,
      name: true,
      connection_status: true,
      is_active: true,
      last_seen_at: true,
      created_at: true,
      updated_at: true,
    },
    orderBy: { created_at: 'desc' },
  });

  return NextResponse.json({ terminals });
}

export async function POST(request: Request) {
  const access = await getPaymentSettingsAccess();
  if (!access.authorized) {
    return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: access.status });
  }

  const parsed = terminalSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Terminal inválido.', details: parsed.error.flatten() }, { status: 400 });
  }

  const { provider, externalTerminalId, externalStoreId, name, gatewayConfigId } = parsed.data;
  const definition = PAYMENT_PROVIDER_CATALOG.find((item) => item.id === provider);
  if (!definition || ![...definition.available.channels, ...definition.planned.channels].includes('terminal') &&
    ![...definition.available.channels, ...definition.planned.channels].includes('external_terminal')) {
    return NextResponse.json({ error: 'Este provedor não possui suporte a terminais.' }, { status: 400 });
  }

  if (gatewayConfigId) {
    const configuration = await prisma.paymentGatewayConfig.findFirst({
      where: { id: gatewayConfigId, tenant_id: access.tenantId, provider },
      select: { id: true },
    });
    if (!configuration) {
      return NextResponse.json({ error: 'Configuração do provedor não encontrada para esta loja.' }, { status: 404 });
    }
  }

  const terminal = await prisma.paymentTerminal.upsert({
    where: {
      tenant_id_provider_external_terminal_id: {
        tenant_id: access.tenantId,
        provider,
        external_terminal_id: externalTerminalId,
      },
    },
    create: {
      tenant_id: access.tenantId,
      provider,
      external_terminal_id: externalTerminalId,
      external_store_id: externalStoreId || null,
      name,
      gateway_config_id: gatewayConfigId,
      connection_status: 'unpaired',
      is_active: false,
    },
    update: {
      external_store_id: externalStoreId || null,
      name,
      gateway_config_id: gatewayConfigId,
      // Pairing and activation require a provider API handshake.
      connection_status: 'unpaired',
      is_active: false,
    },
    select: {
      id: true,
      provider: true,
      external_terminal_id: true,
      external_store_id: true,
      name: true,
      connection_status: true,
      is_active: true,
    },
  });

  return NextResponse.json({ terminal }, { status: 201 });
}
