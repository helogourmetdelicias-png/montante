import { auth } from '@/auth';
import { isCurrentBusinessDay } from '@/lib/cash-register/business-day';
import { PAYMENT_PROVIDER_CATALOG } from '@/lib/payment/provider-catalog';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Provides cashiers only the enabled payment methods, never gateway credentials. */
export async function GET() {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return NextResponse.json({ error: 'Entre na sua conta para abrir o PDV.' }, { status: 401 });

  const [configuration, terminals, openRegister] = await Promise.all([
    prisma.paymentGatewayConfig.findFirst({
      where: { tenant_id: tenantId, is_active: true, is_default: true },
      select: { provider: true, display_name: true, environment: true },
    }),
    prisma.paymentTerminal.findMany({
      where: { tenant_id: tenantId, provider: 'external_terminal', is_active: true, connection_status: 'paired' },
      select: { id: true, name: true, provider: true },
      orderBy: { name: 'asc' },
    }),
    prisma.cashRegisterSession.findFirst({
      where: { tenant_id: tenantId, user_id: session.user.id, status: 'OPEN' },
      select: { id: true, opened_at: true },
    }),
  ]);

  const selectedProvider = configuration && PAYMENT_PROVIDER_CATALOG.find(({ id }) => id === configuration.provider);
  const methods = selectedProvider?.state === 'available'
    ? selectedProvider.available.methods.map((method) => ({ provider: selectedProvider.id, label: configuration?.display_name || selectedProvider.label, method, channel: 'online', environment: configuration?.environment }))
    : [];
  const terminalMethods = terminals.flatMap((terminal) => ['credit_card', 'debit_card'].map((method) => ({
    provider: 'external_terminal',
    label: terminal.name,
    method,
    channel: 'external_terminal',
    terminalId: terminal.id,
  })));

  const cashOption = { provider: 'cash', label: 'Dinheiro no caixa', method: 'cash', channel: 'in_person' };
  const splitOption = methods.some(({ provider, method }) => ['mercadopago', 'pagarme'].includes(provider) && method === 'pix')
    ? { provider: 'split', label: 'Pix + dinheiro', method: 'mixed', channel: 'in_person', environment: configuration?.environment, pixProvider: configuration?.provider }
    : null;
  const canSimulatePixApproval = process.env.NODE_ENV !== 'production' &&
    process.env.PAYMENTS_TEST_ENABLED === 'true' &&
    configuration?.environment === 'sandbox' &&
    ['owner', 'admin'].includes(session.user.role);

  return NextResponse.json({
    options: [...methods, cashOption, { provider: 'fiado', label: 'Fiado', method: 'fiado', channel: 'in_person' }, ...(splitOption ? [splitOption] : []), ...terminalMethods],
    canSimulatePixApproval,
    cashRegister: openRegister ? { isOpen: isCurrentBusinessDay(openRegister.opened_at), needsClosing: !isCurrentBusinessDay(openRegister.opened_at), openedAt: openRegister.opened_at } : { isOpen: false, needsClosing: false },
  });
}
