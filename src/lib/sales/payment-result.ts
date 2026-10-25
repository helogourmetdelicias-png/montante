import { PaymentAttemptStatus, Prisma } from '@prisma/client';
import { completeServiceOrder } from '../service-orders/complete.ts';

type Transaction = Prisma.TransactionClient;

type PaymentResult = {
  status: 'pending' | 'approved' | 'declined' | 'cancelled' | 'error';
  externalId?: string;
};

type ApplyPaymentResultInput = {
  tenantId: string;
  provider?: string;
  saleId: string;
  attemptId: string;
  method: string;
  result: PaymentResult;
  now?: Date;
};

const ATTEMPT_STATUS_BY_RESULT: Record<PaymentResult['status'], PaymentAttemptStatus> = {
  pending: PaymentAttemptStatus.PENDING,
  approved: PaymentAttemptStatus.APPROVED,
  declined: PaymentAttemptStatus.DECLINED,
  cancelled: PaymentAttemptStatus.CANCELLED,
  error: PaymentAttemptStatus.FAILED,
};

/** Applies a provider result and completes the sale only after approved payments cover its full total. */
export async function applyPaymentResult(tx: Transaction, input: ApplyPaymentResultInput) {
  if (input.provider === 'pagbank') {
    const approved = await tx.paymentAttempt.findFirst({ where: { id: input.attemptId, tenant_id: input.tenantId, sale_id: input.saleId, provider: 'pagbank', status: 'APPROVED' } });
    if (approved && await tx.sale.findFirst({ where: { id: input.saleId, tenant_id: input.tenantId, status: 'completed' }, select: { id: true } })) return { attempt: approved, saleCompleted: true };
  }
  const now = input.now ?? new Date();
  const approved = input.result.status === 'approved';
  const attempt = await tx.paymentAttempt.update({
    where: { id: input.attemptId },
    data: {
      status: ATTEMPT_STATUS_BY_RESULT[input.result.status],
      external_order_id: input.result.externalId,
      external_transaction_id: input.result.externalId,
      failure_code: input.result.status === 'error' ? 'GATEWAY_ERROR' : null,
      ...(approved ? { confirmed_at: now } : {}),
    },
  });

  let saleCompleted = false;
  if (approved) {
    const [sale, approvedPayments, cashPayment] = await Promise.all([
      tx.sale.findFirst({
        where: { id: input.saleId, tenant_id: input.tenantId, status: 'pending' },
        select: { total_amount: true, service_order_id: true, sold_at: true },
      }),
      tx.paymentAttempt.aggregate({
        where: { tenant_id: input.tenantId, sale_id: input.saleId, status: PaymentAttemptStatus.APPROVED },
        _sum: { amount: true },
      }),
      tx.paymentAttempt.findFirst({
        where: { tenant_id: input.tenantId, sale_id: input.saleId, provider: 'cash', status: PaymentAttemptStatus.APPROVED },
        select: { id: true },
      }),
    ]);

    const paidAmount = approvedPayments._sum.amount ?? new Prisma.Decimal(0);
    if (sale && paidAmount.greaterThanOrEqualTo(sale.total_amount)) {
      const completion = await tx.sale.updateMany({
        where: {
          id: input.saleId,
          tenant_id: input.tenantId,
          status: 'pending',
        },
        data: {
          status: 'completed',
          payment_method: cashPayment ? 'cash+pix' : input.method,
          expires_at: null,
          sold_at: now,
        },
      });
      saleCompleted = completion.count === 1;
      if (saleCompleted && sale.service_order_id) {
        const delivered = await completeServiceOrder(tx, input.tenantId, sale.service_order_id, input.saleId, now, true);
        if (!delivered) {
          await tx.sale.updateMany({ where: { id: input.saleId, tenant_id: input.tenantId, status: 'completed' }, data: { status: 'pending', sold_at: sale.sold_at, payment_method: null, expires_at: null } });
          saleCompleted = false;
        }
      }
    }
  }

  return { attempt, saleCompleted };
}
