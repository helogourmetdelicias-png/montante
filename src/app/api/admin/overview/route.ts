import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { platformAdminAccess } from '@/lib/platform-admin';
import { parsePeriod } from '@/lib/reports/period';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const access = await platformAdminAccess();
  if (!access.ok) return NextResponse.json({ error: access.status === 401 ? 'Entre na sua conta.' : 'Acesso exclusivo da administração geral. Entre com e-mail e senha na conta autorizada.' }, { status: access.status, headers: { 'Cache-Control': 'private, no-store' } });
  const url = new URL(request.url);
  if (!url.searchParams.has('startDate') && !url.searchParams.has('endDate')) {
    const today = parsePeriod(url)!.startDate;
    url.searchParams.set('startDate', `${today.slice(0, 7)}-01`);
  }
  const period = parsePeriod(url);
  const page = Number(url.searchParams.get('page') ?? 1);
  const q = (url.searchParams.get('q') ?? '').trim();
  if (!period || !Number.isSafeInteger(page) || page < 1 || page > 100000 || q.length > 120) return NextResponse.json({ error: 'Confira período e filtros.' }, { status: 400 });
  const where: Prisma.TenantWhereInput = q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { slug: { contains: q, mode: 'insensitive' } }] } : {};
  const now = new Date();
  const salePeriod = { status: 'completed', sold_at: { gte: period.startAt, lt: period.endBefore } };
  const [stores, total, active, trials, overdue, sales, paid, pending, filtered] = await Promise.all([
    prisma.tenant.findMany({ where, orderBy: [{ created_at: 'desc' }, { id: 'asc' }], skip: (page - 1) * 50, take: 50,
      select: { id: true, name: true, slug: true, niche: true, is_active: true, created_at: true, billing_plan_override: true,
        users: { where: { is_platform_admin: true }, select: { id: true } },
        subscription: { select: { status: true, trial_ends_at: true, next_billing_at: true } },
        billing_records: { orderBy: { created_at: 'desc' }, take: 1, select: { plan_tier: true, amount_due: true, status: true, due_at: true } },
        _count: { select: { products: true, customers: true, users: true } },
      } }),
    prisma.tenant.count(), prisma.tenant.count({ where: { is_active: true } }),
    prisma.tenantSubscription.count({ where: { status: 'TRIAL', trial_ends_at: { gt: now } } }),
    prisma.tenantSubscription.count({ where: { status: 'OVERDUE' } }),
    prisma.sale.aggregate({ where: salePeriod, _count: { _all: true }, _sum: { total_amount: true } }),
    prisma.billingRecord.aggregate({ where: { status: 'paid', paid_at: { gte: period.startAt, lt: period.endBefore } }, _sum: { amount_due: true } }),
    prisma.billingRecord.aggregate({ where: { status: 'pending' }, _sum: { amount_due: true } }),
    prisma.tenant.count({ where }),
  ]);
  const ids = stores.map(store => store.id);
  const [storeSales, balances] = await Promise.all([
    ids.length ? prisma.sale.groupBy({ by: ['tenant_id'], where: { ...salePeriod, tenant_id: { in: ids } }, _count: { _all: true }, _sum: { total_amount: true } }) : [],
    ids.length ? prisma.$queryRaw<Array<{ tenant_id: string; balance: Prisma.Decimal }>>(Prisma.sql`
      SELECT c.tenant_id, SUM(c.amount - COALESCE(p.paid, 0)) AS balance FROM "CreditSale" c
      LEFT JOIN (SELECT tenant_id, credit_sale_id, SUM(amount) AS paid FROM "CreditPayment" GROUP BY tenant_id, credit_sale_id) p
        ON p.credit_sale_id = c.id AND p.tenant_id = c.tenant_id
      WHERE c.tenant_id IN (${Prisma.join(ids)}) GROUP BY c.tenant_id
    `) : [],
  ]);
  const saleMap = new Map(storeSales.map(sale => [sale.tenant_id, sale]));
  const balanceMap = new Map(balances.map(balance => [balance.tenant_id, balance.balance]));
  return NextResponse.json({
    period: { startDate: period.startDate, endDate: period.endDate }, page, filtered, operator: access.user.name,
    summary: { stores: total, activeStores: active, inactiveStores: total - active, trials, overdue,
      saleCount: sales._count._all, revenue: sales._sum.total_amount?.toFixed(2) ?? '0.00',
      saasReceived: paid._sum.amount_due?.toFixed(2) ?? '0.00', saasPending: pending._sum.amount_due?.toFixed(2) ?? '0.00' },
    stores: stores.map(store => {
      const volume = saleMap.get(store.id);
      const invoice = store.billing_records[0];
      return { id: store.id, name: store.name, slug: store.slug, niche: store.niche, active: store.is_active, createdAt: store.created_at, planOverride: store.billing_plan_override ?? 'automatic', protected: store.users.length > 0,
        subscription: store.subscription ? { status: store.subscription.status === 'TRIAL' && store.subscription.trial_ends_at <= now ? 'TRIAL_ENDED' : store.subscription.status, trialEnd: store.subscription.trial_ends_at, nextBilling: store.subscription.next_billing_at } : null,
        latestInvoice: invoice ? { plan: invoice.plan_tier, amount: invoice.amount_due.toFixed(2), status: invoice.status, dueAt: invoice.due_at } : null,
        saleCount: volume?._count._all ?? 0, revenue: volume?._sum.total_amount?.toFixed(2) ?? '0.00', creditBalance: balanceMap.get(store.id)?.toFixed(2) ?? '0.00',
        products: store._count.products, customers: store._count.customers, users: store._count.users,
      };
    }),
  }, { headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
}
