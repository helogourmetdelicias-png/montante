import { auth } from '@/auth';
import { decryptCredentials } from '@/lib/encryption';
import { getPaymentGateway, PagBankGateway, type PaymentProvider } from '@/lib/payment/gateway-adapter';
import { prisma } from '@/lib/prisma';
import { applyPaymentResult } from '@/lib/sales/payment-result';
import { runSerializableTransaction } from '@/lib/database/transactions';
import { PaymentAttemptStatus, Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Reconciles pending online payments with their provider before completing the sale. */
export async function GET(_request: Request, context: { params: Promise<{ id: string; attemptId: string }> }) {
  const params = await context.params;
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return NextResponse.json({ error: 'Entre na sua conta para consultar o pagamento.' }, { status: 401 });


  const attempt = await prisma.paymentAttempt.findFirst({
    where: { id: params.attemptId, sale_id: params.id, tenant_id: tenantId },
    include: {
      gateway_config: { select: { encrypted_credentials: true, environment: true } },
      sale: { select: { status: true, total_amount: true, cash_register_session_id: true } },
    },
  });
  if (!attempt) return NextResponse.json({ error: 'Tentativa de pagamento não encontrada nesta loja.' }, { status: 404 });

  const openRegister = attempt.sale.cash_register_session_id ? await prisma.cashRegisterSession.findFirst({
    where: { id: attempt.sale.cash_register_session_id, tenant_id: tenantId, user_id: session.user.id, status: 'OPEN' },
    select: { id: true },
  }) : null;
  if (!openRegister && attempt.status !== PaymentAttemptStatus.APPROVED) return NextResponse.json({ error: 'O caixa desta venda foi fechado. Abra um novo turno para acompanhar a cobrança.' }, { status: 409 });

  let status = attempt.status.toLowerCase();
  if (['mercadopago', 'pagarme', 'pagbank'].includes(attempt.provider) &&
    (attempt.status === PaymentAttemptStatus.CREATED || attempt.status === PaymentAttemptStatus.PENDING) &&
    attempt.external_order_id && attempt.gateway_config?.encrypted_credentials) {
    try {
      const credentials = decryptCredentials(attempt.gateway_config.encrypted_credentials);
      const providerCredential = attempt.provider === 'mercadopago' ? credentials.access_token : attempt.provider === 'pagbank' ? credentials.token : credentials.api_key;
      if (typeof providerCredential !== 'string' || !providerCredential) {
        return NextResponse.json({ error: 'A credencial de pagamento não está disponível.' }, { status: 503 });
      }

      const gateway = getPaymentGateway(attempt.provider as PaymentProvider, credentials, { environment: attempt.gateway_config.environment });
      const providerStatus = gateway instanceof PagBankGateway
        ? await gateway.checkStatus(attempt.external_order_id, Number(attempt.amount.mul(100).toString()))
        : await gateway.checkStatus(attempt.external_order_id);
      if (providerStatus !== 'pending') {
        const updated = await runSerializableTransaction((tx) => applyPaymentResult(tx, {
          tenantId,
          provider: attempt.provider,
          saleId: attempt.sale_id,
          attemptId: attempt.id,
          method: attempt.method.toLowerCase(),
          result: { status: providerStatus, externalId: attempt.external_order_id! },
        }));
        status = updated.attempt.status.toLowerCase();
      }
    } catch (error) {
      console.error('Falha ao consultar status de pagamento:', error);
      return NextResponse.json({ error: 'Não foi possível confirmar o status com o provedor.' }, { status: 502 });
    }
  }

  const [sale, approvedPayments] = await Promise.all([
    prisma.sale.findFirst({ where: { id: attempt.sale_id, tenant_id: tenantId }, select: { status: true, total_amount: true } }),
    prisma.paymentAttempt.aggregate({
      where: { tenant_id: tenantId, sale_id: attempt.sale_id, status: PaymentAttemptStatus.APPROVED },
      _sum: { amount: true },
    }),
  ]);
  const amountPaid = approvedPayments._sum.amount ?? new Prisma.Decimal(0);
  const remainingBalance = sale ? sale.total_amount.sub(amountPaid) : new Prisma.Decimal(0);
  const remaining = remainingBalance.greaterThan(0) ? remainingBalance : new Prisma.Decimal(0);

  return NextResponse.json({
    status,
    saleStatus: sale?.status ?? attempt.sale.status,
    saleCompleted: sale?.status === 'completed',
    remainingAmount: remaining.toFixed(2),
  });
}
