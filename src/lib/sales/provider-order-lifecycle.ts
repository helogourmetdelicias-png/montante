import { PaymentAttemptStatus, Prisma } from '@prisma/client';
import { decryptCredentials } from '@/lib/encryption';
import { MercadoPagoGateway, PagBankGateway } from '@/lib/payment/gateway-adapter';
import { prisma } from '@/lib/prisma';
import { applyPaymentResult } from '@/lib/sales/payment-result';

type CancellationState = 'cancelled' | 'payment_received' | 'still_pending' | 'cash_refund_required' | 'not_found';

/** Confirms online Orders are no longer payable before local cancellation restores stock. */
export async function cancelProviderOrdersForSale(tenantId: string, saleId: string): Promise<CancellationState> {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, tenant_id: tenantId },
    select: { id: true, status: true, expires_at: true },
  });
  if (!sale) return 'not_found';

  const approvedAttempt = await prisma.paymentAttempt.findFirst({
    where: {
      tenant_id: tenantId,
      sale_id: saleId,
      provider: { in: ['mercadopago', 'pagbank'] },
      status: PaymentAttemptStatus.APPROVED,
      external_order_id: { not: null },
    },
    select: { id: true },
  });
  if (approvedAttempt) return 'payment_received';

  const attempts = await prisma.paymentAttempt.findMany({
    where: {
      tenant_id: tenantId,
      sale_id: saleId,
      provider: { in: ['mercadopago', 'pagbank'] },
      status: { in: [PaymentAttemptStatus.CREATED, PaymentAttemptStatus.PENDING] },
    },
    include: { gateway_config: { select: { encrypted_credentials: true, environment: true } } },
    orderBy: { created_at: 'asc' },
  });

  for (const attempt of attempts) {
    const encryptedCredentials = attempt.gateway_config?.encrypted_credentials;
    if (!encryptedCredentials || !attempt.external_order_id) return 'still_pending';

    const credentials = decryptCredentials(encryptedCredentials);
    const accessToken = attempt.provider === 'pagbank' ? credentials.token : credentials.access_token;
    if (typeof accessToken !== 'string' || !accessToken) return 'still_pending';

    const gateway = attempt.provider === 'pagbank'
      ? new PagBankGateway(accessToken, attempt.gateway_config?.environment === 'production' ? 'production' : 'sandbox')
      : new MercadoPagoGateway(accessToken);
    const providerState = gateway instanceof PagBankGateway
      ? await gateway.cancelOrder(attempt.external_order_id, Number(attempt.amount.mul(100).toString()))
      : await gateway.cancelOrder(attempt.external_order_id);
    if (providerState === 'pending') return 'still_pending';
    if (providerState === 'approved') {
      await prisma.$transaction((tx) => applyPaymentResult(tx, {
        tenantId,
        provider: attempt.provider,
        saleId,
        attemptId: attempt.id,
        method: attempt.method.toLowerCase(),
        result: { status: 'approved', externalId: attempt.external_order_id! },
      }));
      return 'payment_received';
    }

    const cancelled = await prisma.paymentAttempt.updateMany({
      where: {
        id: attempt.id,
        tenant_id: tenantId,
        status: { in: [PaymentAttemptStatus.CREATED, PaymentAttemptStatus.PENDING] },
      },
      data: { status: PaymentAttemptStatus.CANCELLED },
    });
    if (cancelled.count === 0) {
      const current = await prisma.paymentAttempt.findUnique({ where: { id: attempt.id }, select: { status: true } });
      if (current?.status === PaymentAttemptStatus.APPROVED) return 'payment_received';
      if (current?.status !== PaymentAttemptStatus.CANCELLED) return 'still_pending';
    }
  }

  return 'cancelled';
}

/** Releases one expired sale after its external Orders are confirmed cancelled. */
export async function releaseExpiredSaleWithProviderCheck(tenantId: string, saleId: string, now: Date) {
  const providerState = await cancelProviderOrdersForSale(tenantId, saleId);
  if (providerState !== 'cancelled') return { state: providerState, released: false };

  const unrefundedCash = await prisma.paymentAttempt.aggregate({
    where: { tenant_id: tenantId, sale_id: saleId, provider: 'cash', status: PaymentAttemptStatus.APPROVED },
    _sum: { amount: true },
  });
  if (unrefundedCash._sum.amount?.greaterThan(0)) {
    return { state: 'cash_refund_required' as const, released: false };
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const pendingPagBank = await tx.paymentAttempt.findFirst({ where: { tenant_id: tenantId, sale_id: saleId, provider: 'pagbank', status: { in: ['CREATED', 'PENDING', 'APPROVED'] } }, select: { id: true } });
        if (pendingPagBank) return { state: 'still_pending' as const, released: false };
        const cancelledAttempts = await tx.paymentAttempt.updateMany({
          where: {
            tenant_id: tenantId,
            sale_id: saleId,
            provider: { in: ['mercadopago', 'pagbank'] },
            status: { in: [PaymentAttemptStatus.CREATED, PaymentAttemptStatus.PENDING] },
            external_order_id: { not: null },
          },
          data: { status: PaymentAttemptStatus.CANCELLED },
        });
        const expired = await tx.sale.findFirst({
          where: { id: saleId, tenant_id: tenantId, status: 'pending', expires_at: { lte: now } },
          select: { id: true },
        });
        if (!expired) return { state: 'not_expired' as const, released: false };
        const cancelled = await tx.sale.updateMany({
          where: { id: saleId, tenant_id: tenantId, status: 'pending', expires_at: { lte: now } },
          data: { status: 'cancelled' },
        });
        if (cancelled.count !== 1) return { state: 'not_expired' as const, released: false };

        const items = await tx.saleItem.findMany({ where: { sale_id: saleId }, select: { product_id: true, quantity: true } });
        for (const item of items) {
          const restored = await tx.product.updateMany({
            where: { id: item.product_id, tenant_id: tenantId },
            data: { stock_quantity: { increment: item.quantity } },
          });
          if (restored.count !== 1) throw new Error('Não foi possível devolver o estoque reservado.');
        }
        return { state: 'cancelled' as const, released: true, cancelledAttempts: cancelledAttempts.count };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return result;
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2034' || attempt === 2) throw error;
    }
  }
  return { state: 'not_expired' as const, released: false };
}
