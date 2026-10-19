import { auth } from '@/auth';
import { decryptCredentials } from '@/lib/encryption';
import { isCapabilityAvailable } from '@/lib/payment/provider-catalog';
import { getPaymentGateway, type PaymentProvider } from '@/lib/payment/gateway-adapter';
import { prisma } from '@/lib/prisma';
import { applyPaymentResult } from '@/lib/sales/payment-result';
import { createPaymentAttemptSchema } from '@/lib/validations/payment-attempt';
import { PaymentAttemptStatus, Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function serializeAttempt(attempt: {
  id: string;
  provider: string;
  method: string;
  channel: string;
  status: PaymentAttemptStatus;
  amount: Prisma.Decimal;
  external_order_id: string | null;
  failure_code: string | null;
  created_at: Date;
}) {
  return {
    id: attempt.id,
    provider: attempt.provider,
    method: attempt.method,
    channel: attempt.channel,
    status: attempt.status.toLowerCase(),
    amount: attempt.amount.toFixed(2),
    externalOrderId: attempt.external_order_id,
    failureCode: attempt.failure_code,
    createdAt: attempt.created_at,
  };
}

export async function POST(request: Request, context: { params: { id: string } }) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return NextResponse.json({ error: 'Entre na sua conta para iniciar o pagamento.' }, { status: 401 });
  const userId = session.user.id;

  const parsed = createPaymentAttemptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Dados do pagamento inválidos.', details: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  const sale = await prisma.sale.findFirst({
    where: { id: context.params.id, tenant_id: tenantId },
    select: { id: true, status: true, total_amount: true, expires_at: true, cash_register_session_id: true },
  });
  if (!sale) return NextResponse.json({ error: 'Venda não encontrada nesta loja.' }, { status: 404 });
  const existing = await prisma.paymentAttempt.findFirst({
    where: { tenant_id: tenantId, provider: input.provider, idempotency_key: input.idempotencyKey },
  });
  if (existing) {
    if (existing.sale_id !== sale.id || existing.method.toLowerCase() !== input.method || existing.channel.toLowerCase() !== input.channel) {
      return NextResponse.json({ error: 'Esta chave de idempotência já foi usada com outros dados.' }, { status: 409 });
    }
    return NextResponse.json({ attempt: serializeAttempt(existing), replayed: true });
  }

  if (sale.status !== 'pending' || (sale.expires_at && sale.expires_at <= new Date())) {
    return NextResponse.json({ error: 'A venda não está mais disponível para pagamento.' }, { status: 409 });
  }

  const openRegister = await prisma.cashRegisterSession.findFirst({
    where: { id: sale.cash_register_session_id ?? undefined, tenant_id: tenantId, user_id: userId, status: 'OPEN' },
    select: { id: true },
  });
  if (!openRegister) return NextResponse.json({ error: 'O caixa desta venda foi fechado. Abra um novo turno antes de cobrar.' }, { status: 409 });

  const pendingAttempt = await prisma.paymentAttempt.findFirst({
    where: { tenant_id: tenantId, sale_id: sale.id, status: { in: [PaymentAttemptStatus.CREATED, PaymentAttemptStatus.PENDING] } },
    select: { id: true },
  });
  if (pendingAttempt) return NextResponse.json({ error: 'Já existe uma cobrança pendente para esta venda.' }, { status: 409 });

  const approvedPayments = await prisma.paymentAttempt.aggregate({
    where: { tenant_id: tenantId, sale_id: sale.id, status: PaymentAttemptStatus.APPROVED },
    _sum: { amount: true },
  });
  const remainingAmount = sale.total_amount.sub(approvedPayments._sum.amount ?? 0).toDecimalPlaces(2);
  if (remainingAmount.lessThanOrEqualTo(0)) {
    return NextResponse.json({ error: 'A venda já recebeu o valor total.' }, { status: 409 });
  }

  if (!isCapabilityAvailable(input.provider, input.method, input.channel)) {
    return NextResponse.json({ error: 'Este método e canal ainda não estão disponíveis para o provedor.' }, { status: 409 });
  }

  const configuration = input.provider === 'external_terminal' ? null : await prisma.paymentGatewayConfig.findFirst({
    where: { tenant_id: tenantId, provider: input.provider, is_active: true, is_default: true },
  });
  if (input.provider !== 'external_terminal' && !configuration) {
    return NextResponse.json({ error: 'Configure e defina como padrão um gateway ativo antes de cobrar.' }, { status: 409 });
  }
  if (input.provider === 'mercadopago' && configuration?.environment === 'sandbox' &&
    !input.customerEmail?.toLowerCase().endsWith('@testuser.com')) {
    return NextResponse.json({ error: 'No Sandbox do Mercado Pago, use um e-mail de teste terminado em @testuser.com.' }, { status: 400 });
  }

  let terminalId: string | null = null;
  if (input.provider === 'external_terminal') {
    const terminal = await prisma.paymentTerminal.findFirst({
      where: { id: input.terminalId, tenant_id: tenantId, provider: input.provider, is_active: true, connection_status: 'paired' },
      select: { id: true },
    });
    if (!terminal) return NextResponse.json({ error: 'Maquininha não está pareada e ativa.' }, { status: 409 });
    terminalId = terminal.id;
  }

  let credentials: Record<string, unknown> = {};
  if (configuration?.encrypted_credentials) {
    try {
      credentials = decryptCredentials(configuration.encrypted_credentials);
    } catch {
      return NextResponse.json({ error: 'Não foi possível ler a credencial protegida do gateway.' }, { status: 503 });
    }
  }
  const pixKey = input.provider === 'pix_manual' ? credentials.pix_key : undefined;
  const gateway = getPaymentGateway(input.provider as PaymentProvider, credentials, {
    pixKey: typeof pixKey === 'string' ? pixKey : undefined,
  });

  let attempt;
  try {
    attempt = await prisma.paymentAttempt.create({
      data: {
        tenant_id: tenantId,
        sale_id: sale.id,
        gateway_config_id: configuration?.id,
        terminal_id: terminalId,
        provider: input.provider,
        method: input.method.toUpperCase() as 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD',
        channel: input.channel.toUpperCase() as 'ONLINE' | 'TERMINAL' | 'EXTERNAL_TERMINAL',
        status: 'CREATED',
        amount: remainingAmount,
        idempotency_key: input.idempotencyKey,
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      const replay = await prisma.paymentAttempt.findFirst({ where: { tenant_id: tenantId, provider: input.provider, idempotency_key: input.idempotencyKey } });
      if (replay?.sale_id === sale.id && replay.method.toLowerCase() === input.method && replay.channel.toLowerCase() === input.channel) {
        return NextResponse.json({ attempt: serializeAttempt(replay), replayed: true });
      }
      if (replay) return NextResponse.json({ error: 'Esta chave de idempotência já foi usada com outros dados.' }, { status: 409 });
    }
    console.error('Falha ao registrar tentativa de pagamento:', error);
    return NextResponse.json({ error: 'Não foi possível registrar a tentativa de pagamento.' }, { status: 500 });
  }

  try {
    const result = await gateway.charge({
      amount: Number(remainingAmount.mul(100).toDecimalPlaces(0).toString()),
      method: input.method,
      channel: input.channel,
      idempotencyKey: input.idempotencyKey,
      description: `Venda ${sale.id}`,
      customerEmail: input.customerEmail,
      customerName: input.customerName,
      customerDocument: input.customerDocument,
      customerPhone: input.customerPhone,
      customerAddress: input.customerAddress,
    });
    const update = await prisma.$transaction((tx) => applyPaymentResult(tx, {
      tenantId,
      saleId: sale.id,
      attemptId: attempt.id,
      method: input.method,
      result,
    }));
    return NextResponse.json({ attempt: serializeAttempt(update.attempt), saleCompleted: update.saleCompleted, payment: {
      pixQrCode: result.pixQrCode,
      pixQrCodeUrl: result.pixQrCodeUrl,
      pixCopyPaste: result.pixCopyPaste,
      paymentUrl: result.paymentUrl,
    } }, { status: 201 });
  } catch (error) {
    const failedAttempt = await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: { status: 'FAILED', failure_code: 'GATEWAY_ERROR' },
    });
    console.error('Falha no gateway ao iniciar pagamento:', error);
    const providerMessage = error instanceof Error ? error.message.slice(0, 300) : '';
    const publicMessage = input.provider === 'pagarme' && providerMessage
      ? providerMessage
      : 'O gateway não conseguiu iniciar a cobrança.';
    return NextResponse.json({ error: publicMessage, attempt: serializeAttempt(failedAttempt) }, { status: 502 });
  }
}
