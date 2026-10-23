import type { Prisma } from '@prisma/client';

type Transaction = Prisma.TransactionClient;

async function restoreSaleItems(tx: Transaction, tenantId: string, saleId: string) {
  const items = await tx.saleItem.findMany({
    where: { sale_id: saleId },
    select: { product_id: true, quantity: true },
    orderBy: { product_id: 'asc' },
  });

  for (const item of items) {
    const restored = await tx.product.updateMany({
      where: { id: item.product_id, tenant_id: tenantId },
      data: { stock_quantity: { increment: item.quantity } },
    });
    if (restored.count !== 1) throw new Error('Não foi possível devolver o estoque reservado.');
  }
}

export async function releaseExpiredSales(tx: Transaction, tenantId: string, now: Date) {
  const expiredSales = await tx.sale.findMany({
    where: {
      tenant_id: tenantId,
      status: 'pending',
      expires_at: { lte: now },
      // Keep stock reserved while an external Order is active or already confirmed for reconciliation.
      payment_attempts: {
        none: {
          OR: [
            { provider: 'mercadopago', status: { in: ['CREATED', 'PENDING'] } },
            { provider: 'mercadopago', status: 'APPROVED', external_order_id: { not: null } },
            // Ajustado pela auditoria: pagarme incluído para manter estoque protegido enquanto houver cobrança Pix ativa
            { provider: 'pagarme', status: { in: ['CREATED', 'PENDING'] } },
            { provider: 'pagarme', status: 'APPROVED', external_order_id: { not: null } },
            { provider: 'pagbank', status: { in: ['CREATED', 'PENDING', 'APPROVED'] } },
            { provider: 'cash', status: 'APPROVED' },
          ],
        },
      },
    },
    select: { id: true },
    orderBy: { id: 'asc' },
  });

  let releasedCount = 0;
  for (const sale of expiredSales) {
    const cancelled = await tx.sale.updateMany({
      where: { id: sale.id, tenant_id: tenantId, status: 'pending', expires_at: { lte: now } },
      data: { status: 'cancelled' },
    });
    if (cancelled.count === 1) {
      await restoreSaleItems(tx, tenantId, sale.id);
      releasedCount += 1;
    }
  }
  return releasedCount;
}

export async function cancelSaleAndRestore(tx: Transaction, tenantId: string, saleId: string) {
  const sale = await tx.sale.findFirst({
    where: { id: saleId, tenant_id: tenantId },
    select: { id: true, status: true },
  });
  if (!sale) return { state: 'not_found' as const };
  if (sale.status === 'cancelled') return { state: 'cancelled' as const };
  if (sale.status !== 'pending') return { state: 'not_pending' as const };

  const cancelled = await tx.sale.updateMany({
    where: { id: sale.id, tenant_id: tenantId, status: 'pending' },
    data: { status: 'cancelled' },
  });
  if (cancelled.count === 0) {
    const current = await tx.sale.findFirst({
      where: { id: saleId, tenant_id: tenantId },
      select: { status: true },
    });
    return current?.status === 'cancelled'
      ? { state: 'cancelled' as const }
      : { state: 'not_pending' as const };
  }

  await restoreSaleItems(tx, tenantId, sale.id);
  return { state: 'cancelled' as const };
}
