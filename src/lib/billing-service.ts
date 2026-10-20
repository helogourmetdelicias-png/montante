import { prisma } from '@/lib/prisma';
import { runSerializableTransaction } from '@/lib/database/transactions';
import { addBillingMonths, billingCycle, calculateBillingTier, completedSalesWhere, TRIAL_MONTHS } from '@/lib/billing';
export async function processTenantBilling(tenantId: string, now = new Date()) {
  return runSerializableTransaction(async (tx) => {
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const trialEnd = addBillingMonths(tenant.created_at, TRIAL_MONTHS);
    const sub = await tx.tenantSubscription.upsert({ where: { tenant_id: tenantId }, update: {},
      create: { tenant_id: tenantId, trial_ends_at: trialEnd, next_billing_at: trialEnd } });
    let next = sub.next_billing_at;
    let generated = 0;
    while (next <= now && generated < 12) {
      const index = billingCycle(tenant.created_at, next).index;
      const start = addBillingMonths(tenant.created_at, index - 1);
      const end = addBillingMonths(tenant.created_at, index);
      const billingEnd = addBillingMonths(tenant.created_at, index + 1);
      const count = await tx.sale.count({ where: completedSalesWhere(tenantId, start, end) });
      const tier = calculateBillingTier(count);
      await tx.billingRecord.upsert({
        where: { tenant_id_reference_month: { tenant_id: tenantId, reference_month: end.toISOString() } }, update: {},
        create: { tenant_id: tenantId, reference_month: end.toISOString(), cycle_start: start, cycle_end: end,
          billing_start: end, billing_end: billingEnd, due_at: new Date(end.getTime() + 7 * 86400000),
          total_sales: count, plan_tier: tier.label, amount_due: tier.amount },
      });
      await tx.tenant.update({ where: { id: tenantId }, data: { plan_tier: tier.label } });
      next = billingEnd;
      generated++;
    }
    const overdue = await tx.billingRecord.count({ where: { tenant_id: tenantId, status: { in: ['pending', 'overdue'] }, paid_at: null, due_at: { lt: now } } });
    await tx.tenantSubscription.update({ where: { tenant_id: tenantId }, data: { next_billing_at: next,
      status: now < sub.trial_ends_at ? 'TRIAL' : overdue > 0 ? 'OVERDUE' : 'ACTIVE' } });
    return generated;
  });
}
export async function getBillingSummary(tenantId: string, now = new Date()) {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, include: { subscription: true } });
  const cycle = billingCycle(tenant.created_at, now);
  const trialEnd = tenant.subscription?.trial_ends_at ?? addBillingMonths(tenant.created_at, TRIAL_MONTHS);
  const [count, overdue, records] = await Promise.all([
    prisma.sale.count({ where: completedSalesWhere(tenantId, cycle.start, cycle.end) }),
    prisma.billingRecord.count({ where: { tenant_id: tenantId, status: { in: ['pending', 'overdue'] }, paid_at: null, due_at: { lt: now } } }),
    prisma.billingRecord.findMany({ where: { tenant_id: tenantId }, orderBy: { created_at: 'desc' }, take: 12 }),
  ]);
  return { cycle, count, trialEnd, trialDays: Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / 86400000)),
    status: now < trialEnd ? 'TRIAL' : overdue ? 'OVERDUE' : 'ACTIVE', projection: calculateBillingTier(count), records };
}
