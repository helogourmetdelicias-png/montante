import { Prisma } from '@prisma/client';
import type { Prisma as PrismaTypes } from '@prisma/client';

type Database = PrismaTypes.TransactionClient | typeof import('@/lib/prisma').prisma;

/** Computes drawer cash from the opening float, approved cash tenders and recorded movements. */
export async function getCashRegisterSummary(db: Database, tenantId: string, sessionId: string) {
  const [cashPayments, movements, creditReceipts] = await Promise.all([
    db.paymentAttempt.aggregate({
      where: {
        tenant_id: tenantId,
        method: 'CASH',
        status: 'APPROVED',
        sale: { is: { cash_register_session_id: sessionId, tenant_id: tenantId } },
      },
      _sum: { amount: true },
    }),
    db.cashRegisterMovement.groupBy({
      by: ['type'],
      where: { tenant_id: tenantId, session_id: sessionId },
      _sum: { amount: true },
    }),
    db.creditPayment.aggregate({ where: { tenant_id: tenantId, session_id: sessionId, method: 'CASH' }, _sum: { amount: true } }),
  ]);
  const supplies = movements.find(({ type }) => type === 'SUPPLY')?._sum.amount ?? new Prisma.Decimal(0);
  const withdrawals = movements.find(({ type }) => type === 'WITHDRAWAL')?._sum.amount ?? new Prisma.Decimal(0);

  return {
    cashSales: cashPayments._sum.amount ?? new Prisma.Decimal(0),
    cashCreditReceipts: creditReceipts._sum.amount ?? new Prisma.Decimal(0),
    supplies,
    withdrawals,
  };
}

export function expectedDrawerAmount(initial: Prisma.Decimal, totals: { cashSales: Prisma.Decimal; supplies: Prisma.Decimal; withdrawals: Prisma.Decimal; cashCreditReceipts?: Prisma.Decimal }) {
  return initial.add(totals.cashCreditReceipts ?? 0).add(totals.cashSales).add(totals.supplies).sub(totals.withdrawals).toDecimalPlaces(2);
}
