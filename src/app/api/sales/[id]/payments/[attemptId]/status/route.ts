import { auth } from '@/auth';
import { decryptCredentials } from '@/lib/encryption';
import { MercadoPagoGateway } from '@/lib/payment/gateway-adapter';
import { prisma } from '@/lib/prisma';
import { applyPaymentResult } from '@/lib/sales/payment-result';
import { runSerializableTransaction } from '@/lib/database/transactions';
import { PaymentAttemptStatus, Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Reconciles a pending Pix attempt with Mercado Pago before the UI marks the sale complete. */
export async function GET(_request: Request, context: { params: { id: string; attemptId: string } }) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return NextResponse.json({ error: 'Entre na sua conta para consultar o pagamento.' }, { status: 401 });

  const attempt = await prisma.paymentAttempt.findFirst({
    where: { id: context.params.attemptId, sale_id: context.params.id, tenant_id: tenantId },
    include: {
      gateway_config: { select: { encrypted_credentials: true } },
      sale: { select: { status: true, total_amount: true } },
    },
  });
  if (!attempt) return NextResponse.json({ error: 'Tentativa de pagamento não encontrada nesta loja.' }, { status: 404 });

  let status = attempt.status.toLowerCase();
  if (attempt.provider === 'mercadopago' &&
    (attempt.status === PaymentAttemptStatus.CREATED || attempt.status === PaymentAttemptStatus.PENDING) &&
    attempt.external_order_id && attempt.gateway_config?.encrypted_credentials) {
    try {
      const credentials = decryptCredentials(attempt.gateway_config.encrypted_credentials);
      const accessToken = credentials.access_token;
      if (typeof accessToken !== 'string' || !accessToken) {
        return NextResponse.json({ error: 'A credencial do Mercado Pago não está disponível.' }, { status: 503 });
      }

      const providerStatus = await new MercadoPagoGateway(accessToken).checkStatus(attempt.external_order_id);
      if (providerStatus !== 'pending') {
        const updated = await runSerializableTransaction((tx) => applyPaymentResult(tx, {
          tenantId,
          saleId: attempt.sale_id,
          attemptId: attempt.id,
          method: attempt.method.toLowerCase(),
          result: { status: providerStatus, externalId: attempt.external_order_id! },
        }));
        status = updated.attempt.status.toLowerCase();
      }
    } catch (error) {
      console.error('Falha ao consultar status Pix:', error);
      return NextResponse.json({ error: 'Não foi possível confirmar o status com o Mercado Pago.' }, { status: 502 });
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
