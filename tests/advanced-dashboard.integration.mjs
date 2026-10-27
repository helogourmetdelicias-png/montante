import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { encode } from 'next-auth/jwt';

const prisma = new PrismaClient();
const base = process.env.TEST_BASE_URL ?? 'http://localhost:3017';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Only run against a local app');
const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
assert.ok(secret);
const ids = [];
async function fixture() {
  const tenant = await prisma.tenant.create({ data: { name: 'QA dashboard', slug: `qa-dashboard-${randomUUID()}` } });
  ids.push(tenant.id);
  const user = await prisma.user.create({ data: { tenant_id: tenant.id, name: 'QA dashboard', email: `qa-${randomUUID()}@example.com`, role: 'owner' } });
  return { tenant, user };
}
async function cookie(user, tenant) {
  return `authjs.session-token=${await encode({ secret, salt: 'authjs.session-token', token: { sub: user.id, id: user.id, tenantId: tenant.id, tenantSlug: tenant.slug, role: user.role, email: user.email } })}`;
}
async function get(path, cookieValue = '') {
  const response = await fetch(new URL(path, base), { redirect: 'manual', headers: { cookie: cookieValue } });
  return { status: response.status, body: await response.json().catch(() => null) };
}
const reportPath = '/api/reports/sales?startDate=2026-10-01&endDate=2026-10-07';
try {
  const a = await fixture(); const b = await fixture();
  const aCookie = await cookie(a.user, a.tenant); const bCookie = await cookie(b.user, b.tenant);
  assert.ok([307, 401].includes((await get(`${reportPath}&dashboard=1`)).status));
  assert.equal((await get(`${reportPath}&dashboard=1`, aCookie)).status, 403);
  const now = new Date();
  const billing = await prisma.billingRecord.create({ data: { tenant_id: a.tenant.id, reference_month: `qa-${randomUUID()}`, plan_tier: 'Padrão', total_sales: 0, amount_due: '49.90', status: 'paid', paid_at: now, billing_start: new Date(now.getTime() - 86400000), billing_end: new Date(now.getTime() + 86400000) } });
  let sequence = 0;
  for (const [amount, status, soldAt] of [['100', 'completed', '2026-10-01T03:00:00Z'], ['200', 'completed', '2026-10-08T02:59:59Z'], ['999', 'cancelled', '2026-10-03T12:00:00Z'], ['888', 'pending', '2026-10-03T12:00:00Z'], ['50', 'completed', '2026-09-24T03:00:00Z']]) {
    await prisma.sale.create({ data: { tenant_id: a.tenant.id, sale_number: ++sequence, total_amount: amount, status, sold_at: new Date(soldAt) } });
  }
  await prisma.sale.create({ data: { tenant_id: b.tenant.id, sale_number: 1, total_amount: '90000', status: 'completed', sold_at: new Date('2026-10-02T12:00:00Z') } });
  const result = await get(`${reportPath}&dashboard=1`, aCookie);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.summary, { revenue: '300.00', saleCount: 2, averageTicket: '150.00' });
  assert.deepEqual(result.body.previous, { revenue: '50.00', saleCount: 1, averageTicket: '50.00', startDate: '2026-09-24', endDate: '2026-09-30' });
  assert.deepEqual(result.body.details.days.map(d => d.date).sort(), ['2026-10-01', '2026-10-07']);
  assert.equal((await get(`${reportPath}&dashboard=1&tenantId=${a.tenant.id}`, bCookie)).status, 403);
  const basic = await get(reportPath, bCookie);
  assert.equal(basic.status, 200);
  assert.equal(basic.body.summary.revenue, '90000.00');
  assert.equal('previous' in basic.body, false);
  await prisma.billingRecord.update({ where: { id: billing.id }, data: { billing_end: new Date(now.getTime() - 1) } });
  assert.equal((await get(`${reportPath}&dashboard=1`, aCookie)).status, 403);
  await prisma.billingRecord.update({ where: { id: billing.id }, data: { billing_end: new Date(now.getTime() + 86400000), status: 'pending', paid_at: null } });
  assert.equal((await get(`${reportPath}&dashboard=1`, aCookie)).status, 403);
  // Only reads the named account to verify its explicitly authorized exception.
  const exception = await prisma.user.findFirst({ where: { id: 'cmvgl6kc60002o1diccbbqoh2', tenant_id: 'cmvgl6kc50000o1di5ees1q1e', email: 'tecnicorikardo@gmail.com', is_active: true }, include: { tenant: true } });
  if (exception) assert.equal((await get(`${reportPath}&dashboard=1`, await cookie(exception, exception.tenant))).status, 200);
  console.log('PASS: paid/free/expired/pending access, registered account exception, exact totals and previous period, Sao Paulo boundaries, tenant isolation and unchanged basic reports.');
} finally {
  // Only remove fixtures whose generated tenant IDs were captured above.
  if (ids.length) {
    await prisma.sale.deleteMany({ where: { tenant_id: { in: ids } } });
    await prisma.tenant.deleteMany({ where: { id: { in: ids }, slug: { startsWith: 'qa-dashboard-' } } });
  }
  await prisma.$disconnect();
}
