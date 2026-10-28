import { prisma } from '@/lib/prisma';

/** Grants only the dashboard; it never changes the account plan or billing. */
export async function canAccessAdvancedDashboard(userId: string, tenantId: string, now = new Date()) {
  const user = await prisma.user.findFirst({
    where: { id: userId, tenant_id: tenantId, is_active: true, role: { in: ['owner', 'admin'] }, tenant: { is_active: true } },
    select: { email: true },
  });
  if (!user) return false;
  // Bind the exception to the existing account and store, not just a reusable email.
  if (userId === 'cmvgl6kc60002o1diccbbqoh2' && tenantId === 'cmvgl6kc50000o1di5ees1q1e'
    && user.email.trim().toLowerCase() === 'tecnicorikardo@gmail.com') return true;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { billing_plan_override: true } });
  if (tenant?.billing_plan_override === 'standard' || tenant?.billing_plan_override === 'advanced') return true;
  if (tenant?.billing_plan_override === 'free') return false;
  const paid = await prisma.billingRecord.findFirst({
    where: { tenant_id: tenantId, status: 'paid', paid_at: { not: null }, amount_due: { gt: 0 },
      plan_tier: { in: ['Padrão', 'Avançado'] }, billing_start: { lte: now }, billing_end: { gt: now } },
    select: { id: true },
  });
  return paid !== null;
}
