import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { customerAccess } from '@/lib/customers';
import { parsePeriod } from '@/lib/reports/period';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const access = await customerAccess(true);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const url = new URL(request.url);
  const page = Number(url.searchParams.get('page') ?? '1');
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) return NextResponse.json({ error: 'Página inválida.' }, { status: 400 });
  const hasPeriod = url.searchParams.has('startDate') || url.searchParams.has('endDate');
  const period = hasPeriod ? parsePeriod(url) : null;
  if (hasPeriod && (!url.searchParams.get('startDate') || !url.searchParams.get('endDate') || !period)) return NextResponse.json({ error: 'Informe as duas datas de um período válido.' }, { status: 400 });
  const customer = await prisma.customer.findFirst({ where: { id: params.id, tenant_id: access.tenantId }, select: { id: true, name: true, phone: true, isActive: true } });
  if (!customer) return NextResponse.json({ error: 'Cliente não encontrado nesta loja.' }, { status: 404 });
  const where: Prisma.SaleWhereInput = { tenant_id: access.tenantId, customer_id: customer.id, ...(period ? { sold_at: { gte: period.startAt, lt: period.endBefore } } : {}) };
  const [sales, total, summary, tenant] = await prisma.$transaction([
    prisma.sale.findMany({ where, orderBy: [{ sold_at: 'desc' }, { sale_number: 'desc' }], skip: (page - 1) * 25, take: 25, select: { id: true, sale_number: true, sold_at: true, status: true, total_amount: true, discount_amount: true } }),
    prisma.sale.count({ where }),
    prisma.sale.aggregate({ where: { ...where, status: 'completed' }, _sum: { total_amount: true }, _count: { _all: true }, _max: { sold_at: true } }),
    prisma.tenant.findUnique({ where: { id: access.tenantId }, select: { name: true } }),
  ]);
  const revenue = summary._sum.total_amount ?? new Prisma.Decimal(0);
  return NextResponse.json({ customer, storeName: tenant?.name ?? 'Montante',
    period: period ? { startDate: period.startDate, endDate: period.endDate } : null,
    summary: { revenue: revenue.toFixed(2), saleCount: summary._count._all, averageTicket: summary._count._all ? revenue.div(summary._count._all).toFixed(2) : '0.00', lastPurchase: summary._max.sold_at },
    sales: sales.map(sale => ({ id: sale.id, saleNumber: sale.sale_number, soldAt: sale.sold_at, status: sale.status, totalAmount: sale.total_amount.toFixed(2), discountAmount: sale.discount_amount.toFixed(2) })), total, page, limit: 25,
  });
}
