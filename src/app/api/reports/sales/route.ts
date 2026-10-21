import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { PaymentAttemptStatus, Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { salesDetails } from '@/lib/reports/details';
import { parsePeriod } from '@/lib/reports/period';

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

  const totalRevenue = salesSummary._sum.total_amount ?? new Prisma.Decimal(0);
  const saleCount = salesSummary._count._all;
  const paymentBreakdown = paymentGroups.map((group) => ({
    method: group.method.toLowerCase(),
    channel: group.channel.toLowerCase(),
    amount: (group._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
  }));
  return NextResponse.json({
    details: await salesDetails(tenantId, period.startAt, period.endBefore),
    storeName: tenant?.name ?? 'Montante',
    period: { startDate: period.startDate, endDate: period.endDate },
    summary: {
      revenue: totalRevenue.toFixed(2),
      saleCount,
      averageTicket: saleCount ? totalRevenue.div(saleCount).toDecimalPlaces(2).toFixed(2) : '0.00',
    },
    paymentBreakdown,
    topProductsByRevenue: productsByRevenue,
    topProductsByQuantity: productsByQuantity,
    topCustomers,
  });
}
