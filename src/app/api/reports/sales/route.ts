import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { PaymentAttemptStatus, Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parsePeriod(url: URL) {
  const startInput = url.searchParams.get('startDate');
  const endInput = url.searchParams.get('endDate');
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if ((startInput && !datePattern.test(startInput)) || (endInput && !datePattern.test(endInput))) return null;

  const todayParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const today = `${todayParts.find(({ type }) => type === 'year')?.value}-${todayParts.find(({ type }) => type === 'month')?.value}-${todayParts.find(({ type }) => type === 'day')?.value}`;
  const startDate = startInput ?? today;
  const endDate = endInput ?? today;
  const startCalendarDate = new Date(`${startDate}T00:00:00.000Z`);
  const endCalendarDate = new Date(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(startCalendarDate.getTime()) || Number.isNaN(endCalendarDate.getTime()) || startDate !== startCalendarDate.toISOString().slice(0, 10) || endDate !== endCalendarDate.toISOString().slice(0, 10) || startDate > endDate) return null;
  const endExclusiveCalendarDate = new Date(endCalendarDate);
  endExclusiveCalendarDate.setUTCDate(endExclusiveCalendarDate.getUTCDate() + 1);
  // Store reporting dates use the Brazilian business timezone (UTC−3).
  return {
    startDate,
    endDate,
    startAt: new Date(`${startDate}T00:00:00-03:00`),
    endBefore: new Date(`${endExclusiveCalendarDate.toISOString().slice(0, 10)}T00:00:00-03:00`),
  };
}

/** Management report API only exposes rows belonging to the authenticated tenant. */
export async function GET(request: Request) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return NextResponse.json({ error: 'Entre na sua conta para consultar relatórios.' }, { status: 401 });
  if (!['owner', 'admin'].includes(session.user.role)) return NextResponse.json({ error: 'Somente responsáveis e administradores podem acessar relatórios.' }, { status: 403 });

  const period = parsePeriod(new URL(request.url));
  if (!period) return NextResponse.json({ error: 'Informe um intervalo de datas válido.' }, { status: 400 });
  const saleFilter: Prisma.SaleWhereInput = {
    tenant_id: tenantId,
    status: 'completed',
    sold_at: { gte: period.startAt, lt: period.endBefore },
  };

  const [salesSummary, paymentGroups, productRevenueGroups, productQuantityGroups] = await Promise.all([
    prisma.sale.aggregate({ where: saleFilter, _count: { _all: true }, _sum: { total_amount: true } }),
    prisma.paymentAttempt.groupBy({
      by: ['method', 'channel'],
      where: {
        tenant_id: tenantId,
        status: PaymentAttemptStatus.APPROVED,
        sale: { is: saleFilter },
      },
      _sum: { amount: true },
    }),
    prisma.saleItem.groupBy({
      by: ['product_id'],
      where: { sale: { is: saleFilter } },
      _sum: { quantity: true, total_price: true },
      orderBy: { _sum: { total_price: 'desc' } },
      take: 100,
    }),
    prisma.saleItem.groupBy({
      by: ['product_id'],
      where: { sale: { is: saleFilter } },
      _sum: { quantity: true, total_price: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 100,
    }),
  ]);

  const productIds = [...new Set([...productRevenueGroups, ...productQuantityGroups].map(({ product_id }) => product_id))];
  const products = productIds.length ? await prisma.product.findMany({
    where: { tenant_id: tenantId, id: { in: productIds } },
    select: { id: true, name: true, sku: true, unit_of_measure: true },
  }) : [];
  const productById = new Map(products.map((product) => [product.id, product]));
  const mapProductRanks = (groups: typeof productRevenueGroups) => groups.flatMap((group) => {
    const product = productById.get(group.product_id);
    return product ? [{
      productId: product.id,
      name: product.name,
      sku: product.sku,
      unit: product.unit_of_measure,
      quantity: group._sum.quantity?.toFixed(3) ?? '0.000',
      revenue: group._sum.total_price?.toFixed(2) ?? '0.00',
    }] : [];
  });
  const productsByRevenue = mapProductRanks(productRevenueGroups);
  const productsByQuantity = mapProductRanks(productQuantityGroups);

  const totalRevenue = salesSummary._sum.total_amount ?? new Prisma.Decimal(0);
  const saleCount = salesSummary._count._all;
  const paymentBreakdown = paymentGroups.map((group) => ({
    method: group.method.toLowerCase(),
    channel: group.channel.toLowerCase(),
    amount: (group._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
  }));
  return NextResponse.json({
    period: { startDate: period.startDate, endDate: period.endDate },
    summary: {
      revenue: totalRevenue.toFixed(2),
      saleCount,
      averageTicket: saleCount ? totalRevenue.div(saleCount).toDecimalPlaces(2).toFixed(2) : '0.00',
    },
    paymentBreakdown,
    topProductsByRevenue: productsByRevenue,
    topProductsByQuantity: productsByQuantity,
  });
}
