import type { Prisma } from '@prisma/client';

export function isAbandonedManualCharge(saleStatus: string, provider: string) {
  return saleStatus === 'cancelled' && ['pix_manual', 'external_terminal'].includes(provider);
}

/** Manual attempts on cancelled sales are abandoned records, not active gateway orders. */
export async function getClosingIssues(db: Pick<Prisma.TransactionClient, 'sale'>, tenantId: string, registerId: string) {
  const sales = await db.sale.findMany({
    where: {
      tenant_id: tenantId,
      cash_register_session_id: registerId,
      OR: [{ status: 'pending' }, { payment_attempts: { some: { status: { in: ['CREATED', 'PENDING'] } } } }],
    },
    select: {
      id: true, sale_number: true, status: true, total_amount: true,
      payment_attempts: {
        where: { tenant_id: tenantId, status: { in: ['CREATED', 'PENDING'] } },
        select: { provider: true },
      },
    },
    orderBy: { sale_number: 'asc' },
  });
  return sales.flatMap(sale => {
    const attempts = sale.payment_attempts.filter(attempt =>
      !isAbandonedManualCharge(sale.status, attempt.provider));
    if (sale.status !== 'pending' && attempts.length === 0) return [];
    return [{ id: sale.id, number: sale.sale_number, amount: sale.total_amount.toFixed(2),
      pendingSale: sale.status === 'pending', pendingCharges: attempts.length }];
  });
}
