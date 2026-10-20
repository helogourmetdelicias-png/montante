import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { encode } from 'next-auth/jwt';

const prisma = new PrismaClient();
const base = process.env.TEST_BASE_URL ?? 'http://localhost:3001';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
assert.ok(secret);
const tenantIds = [];
async function identity(label, role = 'owner') {
  const tenant = await prisma.tenant.create({ data: { name: `QA Clientes ${label}`, slug: `qa-customers-${randomUUID()}` } });
  tenantIds.push(tenant.id);
  const user = await prisma.user.create({ data: { tenant_id: tenant.id, name: 'QA Clientes', email: `${randomUUID()}@example.invalid`, role } });
  const token = await encode({ secret, salt: 'authjs.session-token', token: { sub: user.id, id: user.id, tenantId: tenant.id, role, name: user.name } });
  return { tenant, user, cookie: `authjs.session-token=${token}` };
}
async function request(path, cookie, method = 'GET', body) {
  const response = await fetch(new URL(path, base), { redirect: 'manual', method, headers: { cookie, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json().catch(() => null) };
}
try {
  const a = await identity('A'); const b = await identity('B'); const staff = await identity('staff', 'staff');
  const page = await fetch(new URL('/clientes', base), { headers: { cookie: a.cookie }, redirect: 'manual' });
  assert.equal(page.status, 200);
  assert.ok((await page.text()).includes('Novo cliente'));
  assert.equal((await fetch(new URL('/clientes', base), { headers: { cookie: staff.cookie }, redirect: 'manual' })).status, 307);
  const create = await request('/api/customers', a.cookie, 'POST', { name: 'QA Cliente', document: '123.456.789-01', email: 'qa@example.invalid', phone: '+55 (11) 91234-5678' });
  assert.equal(create.status, 201);
  const id = create.body.customer.id;
  assert.equal(create.body.customer.phone, '11912345678');
  assert.equal((await request('/api/customers', a.cookie, 'POST', { name: 'QA Duplicado', document: '12345678901' })).status, 409);
  assert.equal((await request('/api/customers', b.cookie, 'POST', { name: 'QA Outra loja', document: '12345678901' })).status, 201);
  assert.equal((await request('/api/customers', staff.cookie, 'POST', { name: 'QA Bloqueado' })).status, 403);
  assert.equal((await request(`/api/customers/${id}`, staff.cookie, 'PATCH', { name: 'QA Bloqueado' })).status, 403);
  assert.equal((await request(`/api/customers/${id}`, staff.cookie, 'DELETE')).status, 403);
  assert.equal((await request(`/api/customers/${id}`, b.cookie, 'PATCH', { name: 'QA Cruzado' })).status, 404);
  assert.equal((await request(`/api/customers/${id}`, b.cookie, 'DELETE')).status, 404);
  assert.equal((await request(`/api/customers/${id}`, a.cookie, 'PATCH', { name: 'QA Cliente editado' })).status, 200);
  assert.equal((await request('/api/customers?q=123.456.789-01', a.cookie)).body.customers[0].id, id);
  assert.ok(!(await request('/api/customers', b.cookie)).body.customers.some(customer => customer.id === id));

  await prisma.cashRegisterSession.create({ data: { tenant_id: a.tenant.id, user_id: a.user.id, initial_amount: 0 } });
  const product = await prisma.product.create({ data: { tenant_id: a.tenant.id, name: 'QA Produto cliente', price: 10, stock_quantity: 10, unit_of_measure: 'un' } });
  const saleInput = { idempotencyKey: randomUUID(), customerId: id, items: [{ productId: product.id, quantity: 1 }] };
  const sale = await request('/api/sales', a.cookie, 'POST', saleInput);
  assert.equal(sale.status, 201);
  assert.equal(sale.body.sale.customerId, id);
  assert.equal((await request('/api/sales', a.cookie, 'POST', saleInput)).status, 200);
  assert.equal((await request('/api/sales', a.cookie, 'POST', { ...saleInput, customerId: undefined })).status, 409);
  const foreignCustomer = (await request('/api/customers', b.cookie)).body.customers[0].id;
  assert.equal((await request('/api/sales', a.cookie, 'POST', { ...saleInput, idempotencyKey: randomUUID(), customerId: foreignCustomer })).status, 404);
  assert.equal((await request(`/api/customers/${id}`, a.cookie, 'DELETE')).status, 200);
  assert.equal((await request('/api/customers', a.cookie)).body.customers.length, 0);
  assert.equal((await request('/api/customers?includeInactive=true', a.cookie)).body.customers[0].isActive, false);
  assert.equal((await request('/api/sales', a.cookie, 'POST', { ...saleInput, idempotencyKey: randomUUID() })).status, 404);
  assert.equal((await prisma.sale.findUnique({ where: { id: sale.body.sale.id } })).customer_id, id);
  assert.equal((await request(`/api/customers/${id}`, a.cookie, 'PATCH', { isActive: true })).status, 200);
  assert.equal((await request(`/api/products/${product.id}`, a.cookie, 'PATCH', { name: 'QA Produto editado' })).status, 200);
  assert.equal((await request(`/api/products/${product.id}`, a.cookie, 'DELETE')).status, 200);
  assert.equal((await prisma.product.findUnique({ where: { id: product.id } })).is_active, false);
  assert.equal(await prisma.saleItem.count({ where: { sale_id: sale.body.sale.id, product_id: product.id } }), 1);
  console.log('PASS: customer page/CRUD, normalization, duplicate document, roles, tenant isolation, sale association, idempotency, product editing/deletion and preserved history.');
} finally {
  await prisma.sale.deleteMany({ where: { tenant_id: { in: tenantIds } } });
  await prisma.cashRegisterSession.deleteMany({ where: { tenant_id: { in: tenantIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.$disconnect();
}
