import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { encode } from 'next-auth/jwt';

const prisma = new PrismaClient();
const base = process.env.TEST_BASE_URL ?? 'http://localhost:3001';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
const tenantIds = [];
async function tenant() {
  const result = await prisma.tenant.create({ data: { name: 'QA Relatórios', slug: `qa-reports-${randomUUID()}` } });
  tenantIds.push(result.id); return result;
}
async function cookie(tenantId, role = 'owner') {
  return `authjs.session-token=${await encode({ secret, salt: 'authjs.session-token', token: { sub: 'qa-reports', id: 'qa-reports', tenantId, role } })}`;
}
async function get(path, authCookie) {
  const response = await fetch(new URL(path, base), { redirect: 'manual', headers: { cookie: authCookie } });
  return { status: response.status, body: await response.json().catch(() => null) };
}
try {
  const a = await tenant(); const b = await tenant();
  const customerA = await prisma.customer.create({ data: { tenant_id: a.id, name: 'QA Cliente A', isActive: false } });
  const customerB = await prisma.customer.create({ data: { tenant_id: a.id, name: 'QA Melhor cliente' } });
  let number = 0;
  async function sale(customer, amount, status = 'completed', soldAt = '2026-10-19T12:00:00Z', tenantId = a.id) {
    await prisma.sale.create({ data: { tenant_id: tenantId, customer_id: customer, sale_number: ++number, total_amount: amount, status, sold_at: new Date(soldAt) } });
  }
  await sale(customerA.id, 100, 'completed', '2026-10-19T03:00:00Z');
  await sale(customerA.id, 50, 'completed', '2026-10-20T02:59:59Z');
  await sale(customerA.id, 700, 'completed', '2026-10-20T03:00:00Z');
  await sale(customerA.id, 888, 'pending');
  for (let i = 0; i < 26; i++) await sale(customerA.id, 999, 'cancelled');
  await sale(customerB.id, 200);
  await sale(null, 500);
  await sale(null, 99999, 'completed', '2026-10-19T12:00:00Z', b.id);
  const own = await cookie(a.id); const other = await cookie(b.id); const staff = await cookie(a.id, 'staff');
  const period = 'startDate=2026-10-19&endDate=2026-10-19';
  const report = await get(`/api/reports/sales?${period}`, own);
  assert.equal(report.status, 200);
  assert.equal(report.body.summary.revenue, '850.00');
  assert.deepEqual(report.body.topCustomers.map(c => [c.customerId, c.revenue, c.saleCount]), [[customerB.id, '200.00', 1], [customerA.id, '150.00', 2]]);
  assert.equal(report.body.topCustomers[1].isActive, false);
  const history = await get(`/api/customers/${customerA.id}/history?${period}`, own);
  assert.equal(history.status, 200);
  assert.equal(history.body.total, 29);
  assert.equal(history.body.sales.length, 25);
  assert.equal(history.body.summary.revenue, '150.00');
  assert.equal(history.body.summary.saleCount, 2);
  assert.ok(!('document' in history.body.customer));
  const next = await get(`/api/customers/${customerA.id}/history?${period}&page=2`, own);
  assert.equal(next.body.sales.length, 4);
  assert.equal(next.body.summary.revenue, '150.00');
  assert.equal((await get(`/api/customers/${customerA.id}/history`, own)).body.summary.revenue, '850.00');
  assert.equal((await get(`/api/customers/${customerA.id}/history`, other)).status, 404);
  assert.equal((await get(`/api/customers/${customerA.id}/history`, staff)).status, 403);
  assert.equal((await get(`/api/reports/sales?${period}`, staff)).status, 403);
  assert.equal((await get(`/api/customers/${customerA.id}/history?startDate=2026-02-30&endDate=2026-03-01`, own)).status, 400);
  assert.equal((await get(`/api/customers/${customerA.id}/history?startDate=2026-10-19`, own)).status, 400);
  console.log('PASS: customer revenue ranking, status/date boundaries, inactive customer, unassigned sales, history totals/pagination, roles and tenant isolation. No WhatsApp messages sent.');
} finally {
  await prisma.sale.deleteMany({ where: { tenant_id: { in: tenantIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.$disconnect();
}
