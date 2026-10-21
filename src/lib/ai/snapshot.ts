import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { parsePeriod } from '@/lib/reports/period';

export async function financialSnapshot(tenantId: string, period: NonNullable<ReturnType<typeof parsePeriod>>) {
  const date = { gte: period.startAt, lt: period.endBefore };
  const [sales, payments, creditSales, receipts, outstanding, movements, latest] = await Promise.all([
    prisma.sale.aggregate({ where: { tenant_id: tenantId, status: 'completed', sold_at: date }, _sum: { total_amount: true }, _count: { _all: true } }),
    prisma.paymentAttempt.groupBy({ by: ['method', 'is_simulated'], where: { tenant_id: tenantId, status: 'APPROVED', confirmed_at: date }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.creditSale.aggregate({ where: { tenant_id: tenantId, sale: { is: { status: 'completed', sold_at: date } } }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.creditPayment.groupBy({ by: ['method'], where: { tenant_id: tenantId, created_at: date }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.$queryRaw<Array<{ balance: Prisma.Decimal; open_count: bigint }>>(Prisma.sql`
      SELECT COALESCE(SUM(c.amount - COALESCE(p.paid, 0)), 0) AS balance,
        COUNT(*) FILTER (WHERE c.amount > COALESCE(p.paid, 0)) AS open_count
      FROM "CreditSale" c LEFT JOIN (
        SELECT credit_sale_id, SUM(amount) AS paid FROM "CreditPayment"
        WHERE tenant_id = ${tenantId} GROUP BY credit_sale_id
      ) p ON p.credit_sale_id = c.id WHERE c.tenant_id = ${tenantId}
    `),
    prisma.cashRegisterMovement.groupBy({ by: ['type'], where: { tenant_id: tenantId, created_at: date }, _sum: { amount: true } }),
    prisma.sale.findMany({ where: { tenant_id: tenantId, status: 'completed', sold_at: date }, orderBy: [{ sold_at: 'desc' }, { id: 'desc' }], take: 20, select: { sale_number: true, total_amount: true, payment_method: true, sold_at: true } }),
  ]);
  const amount = (value: Prisma.Decimal | null | undefined) => value?.toFixed(2) ?? '0.00';
  const now = new Date();
  return {
    consultedAt: now.toISOString(), consultedAtLocal: now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }), timezone: 'America/Sao_Paulo', currency: 'BRL',
    period: { startDate: period.startDate, endDate: period.endDate },
    completedSales: { count: sales._count._all, revenue: amount(sales._sum.total_amount), averageTicket: sales._count._all ? sales._sum.total_amount!.div(sales._count._all).toFixed(2) : '0.00' },
    approvedPaymentsByConfirmationDate: payments.map(row => ({ method: row.method, simulated: row.is_simulated, count: row._count._all, amount: amount(row._sum.amount) })),
    creditSalesInPeriod: { count: creditSales._count._all, amount: amount(creditSales._sum.amount) },
    creditReceiptsInPeriod: receipts.map(row => ({ method: row.method, count: row._count._all, amount: amount(row._sum.amount) })),
    creditReceiptTotalsInPeriod: { amount: receipts.reduce((total, row) => total.add(row._sum.amount ?? 0), new Prisma.Decimal(0)).toFixed(2), count: receipts.reduce((total, row) => total + row._count._all, 0) },
    currentOutstandingCreditsAllTime: { amount: amount(outstanding[0]?.balance), openCount: Number(outstanding[0]?.open_count ?? 0) },
    cashMovementsInPeriod: movements.map(row => ({ type: row.type, amount: amount(row._sum.amount) })),
    latestCompletedSalesSample: latest.map(row => ({ number: row.sale_number, amount: amount(row.total_amount), method: row.payment_method, soldAt: row.sold_at.toISOString() })),
  };
}
