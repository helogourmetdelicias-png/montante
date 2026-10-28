import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { PaymentAttemptStatus, Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { salesDetails } from '@/lib/reports/details';
import { parsePeriod } from '@/lib/reports/period';
import { canAccessAdvancedDashboard } from '@/lib/reports/dashboard-access';
import { previousDashboardPeriod } from '@/lib/reports/dashboard';

/** Management report API only exposes rows belonging to the authenticated tenant. */
export async function GET(request: Request) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return NextResponse.json({ error: 'Entre na sua conta para consultar relatórios.' }, { status: 401 });
  if (!['owner', 'admin'].includes(session.user.role)) return NextResponse.json({ error: 'Somente responsáveis e administradores podem acessar relatórios.' }, { status: 403 });

  const url = new URL(request.url);
  const advanced = url.searchParams.get('dashboard') === '1';
  if (advanced && !(await canAccessAdvancedDashboard(session.user.id, tenantId))) {
    return NextResponse.json({ error: 'O dashboard avançado está disponível para assinaturas pagas vigentes.' }, { status: 403 });
  }
  const period = parsePeriod(url);
  if (!period) return NextResponse.json({ error: 'Informe um intervalo de datas válido.' }, { status: 400 });
  if (advanced && period.endBefore.getTime() - period.startAt.getTime() > 366 * 86400000) {
    return NextResponse.json({ error: 'Selecione até 366 dias para o dashboard avançado.' }, { status: 400 });
  }
  const saleFilter: Prisma.SaleWhereInput = {
    tenant_id: tenantId,
    status: 'completed',
    sold_at: { gte: period.startAt, lt: period.endBefore },
  };

  const [salesSummary, paymentGroups, productRevenueGroups, productQuantityGroups, customerGroups, tenant] = await Promise.all([
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
    prisma.sale.groupBy({
      by: ['customer_id'], where: { ...saleFilter, customer_id: { not: null } },
      _sum: { total_amount: true }, _count: { _all: true },
      orderBy: [{ _sum: { total_amount: 'desc' } }, { customer_id: 'asc' }], take: 20,
    }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
  ]);

  const customers = await prisma.customer.findMany({ where: { tenant_id: tenantId, id: { in: customerGroups.flatMap(group => group.customer_id ? [group.customer_id] : []) } }, select: { id: true, name: true, isActive: true } });
  const customerById = new Map(customers.map(customer => [customer.id, customer]));
  const topCustomers = customerGroups.flatMap(group => {
    const customer = customerById.get(group.customer_id ?? '');
    return customer ? [{ customerId: customer.id, name: customer.name, isActive: customer.isActive, saleCount: group._count._all, revenue: group._sum.total_amount?.toFixed(2) ?? '0.00' }] : [];
  });

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

  const costSummary = await prisma.sale.aggregate({ where: { ...saleFilter, cost_total: { not: null } }, _count: { _all: true }, _sum: { total_amount: true, cost_total: true } });
  const knownCost = costSummary._sum.cost_total ?? new Prisma.Decimal(0);
  const coveredRevenue = costSummary._sum.total_amount ?? new Prisma.Decimal(0);
  const costCoverage = costSummary._count._all;
  const totalRevenue = salesSummary._sum.total_amount ?? new Prisma.Decimal(0);
  const saleCount = salesSummary._count._all;
  const paymentBreakdown = paymentGroups.map((group) => ({
    method: group.method.toLowerCase(),
    channel: group.channel.toLowerCase(),
    amount: (group._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
  }));
  let previous = null;
  if (advanced) {
    const previousPeriod = previousDashboardPeriod(period.startAt, period.endBefore);
    const totals = await prisma.sale.aggregate({ where: { tenant_id: tenantId, status: 'completed', sold_at: { gte: previousPeriod.startAt, lt: previousPeriod.endBefore } }, _count: { _all: true }, _sum: { total_amount: true } });
    const revenue = totals._sum.total_amount ?? new Prisma.Decimal(0);
    previous = { revenue: revenue.toFixed(2), saleCount: totals._count._all,
      averageTicket: totals._count._all ? revenue.div(totals._count._all).toFixed(2) : '0.00',
      startDate: new Date(previousPeriod.startAt.getTime() - 3 * 3600000).toISOString().slice(0, 10),
      endDate: new Date(previousPeriod.endBefore.getTime() - 3 * 3600000 - 1).toISOString().slice(0, 10) };
  }
  return NextResponse.json({
    ...(advanced ? { previous } : {}),
    details: await salesDetails(tenantId, period.startAt, period.endBefore),
    storeName: tenant?.name ?? 'Montante',
    period: { startDate: period.startDate, endDate: period.endDate },
    summary: {
      revenue: totalRevenue.toFixed(2),
      saleCount,
      averageTicket: saleCount ? totalRevenue.div(saleCount).toDecimalPlaces(2).toFixed(2) : '0.00',
    },
    costs: { total: knownCost.toFixed(2), revenue: coveredRevenue.toFixed(2), grossProfit: coveredRevenue.minus(knownCost).toFixed(2), coveredSales: costCoverage, missingSales: saleCount - costCoverage },
    paymentBreakdown,
    topProductsByRevenue: productsByRevenue,
    topProductsByQuantity: productsByQuantity,
    topCustomers,
  });
}
