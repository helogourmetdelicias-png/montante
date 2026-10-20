import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const base = process.env.OPERATORS_TEST_URL || 'http://localhost:3100';
function browser() {
  const cookies = new Map();
  return async (url, options = {}) => {
    const response = await fetch(new URL(url, base), { ...options, redirect: 'manual', headers: { ...options.headers, cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') } });
    for (const value of response.headers.getSetCookie()) {
      const pair = value.split(';')[0];
      const separator = pair.indexOf('=');
      cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    return response;
  };
}
async function login(client, provider, credentials) {
  const { csrfToken } = await (await client('/api/auth/csrf')).json();
  return client(`/api/auth/callback/${provider}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1' }, body: new URLSearchParams({ ...credentials, csrfToken, callbackUrl: `${base}/caixa` }) });
}
const tenants = [];
try {
  for (let i = 0; i < 2; i++) tenants.push(await prisma.tenant.create({ data: { name: 'QA auth operators', slug: `qa-auth-${randomUUID()}` } }));
  const password_hash = await bcrypt.hash('QaPassword123', 4);
  const pin_hash = await bcrypt.hash('123456', 4);
  const owner = await prisma.user.create({ data: { tenant_id: tenants[0].id, name: 'QA owner', email: 'owner@example.invalid', role: 'owner', password_hash, pin_hash } });
  const operator = await prisma.user.create({ data: { tenant_id: tenants[0].id, name: 'QA staff', email: 'staff@example.invalid', role: 'staff', password_hash, pin_hash } });
  const other = await prisma.user.create({ data: { tenant_id: tenants[1].id, name: 'QA other', email: 'other@example.invalid', role: 'owner', password_hash, pin_hash } });
  const ownerDrawer = await prisma.cashRegisterSession.create({ data: { tenant_id: tenants[0].id, user_id: owner.id, initial_amount: '10' } });
  const staffDrawer = await prisma.cashRegisterSession.create({ data: { tenant_id: tenants[0].id, user_id: operator.id, initial_amount: '20' } });
  const client = browser();
  await login(client, 'operator-pin', { userId: operator.id, pin: '123456' });
  assert.equal((await (await client('/api/auth/session')).json())?.user, undefined, 'PIN cannot start an unauthenticated session');
  await login(client, 'credentials', { email: owner.email, password: 'QaPassword123', tenantSlug: tenants[0].slug });
  assert.equal((await (await client('/api/auth/session')).json()).user.id, owner.id);
  assert.equal((await client('/perfil')).status, 200, 'middleware and profile must allow owner');
  await login(client, 'operator-pin', { userId: other.id, pin: '123456' });
  assert.equal((await (await client('/api/auth/session')).json()).user.id, owner.id, 'foreign tenant PIN must not replace session');
  await login(client, 'operator-pin', { userId: operator.id, pin: '000000' });
  assert.equal((await (await client('/api/auth/session')).json()).user.id, owner.id, 'invalid PIN preserves source session');
  await login(client, 'operator-pin', { userId: operator.id, pin: '123456' });
  const switched = (await (await client('/api/auth/session')).json()).user;
  assert.equal(switched.id, operator.id);
  assert.equal(switched.role, 'staff');
  assert.equal(switched.tenantId, tenants[0].id);
  assert.equal((await client('/caixa')).status, 200);
  assert.equal((await (await client('/api/cash-register/session')).json()).session.id, staffDrawer.id, 'switch uses the target operator drawer');
  assert.equal((await prisma.cashRegisterSession.findUniqueOrThrow({ where: { id: ownerDrawer.id } })).status, 'OPEN', 'switch never closes or transfers source drawer');
  assert.equal((await client('/api/reports/sales')).status, 403, 'switch must drop administrative permissions');
  await login(client, 'operator-pin', { userId: owner.id, pin: '123456' });
  assert.equal((await (await client('/api/auth/session')).json()).user.id, owner.id, 'owner can return with own configured PIN');
  assert.equal((await (await client('/api/cash-register/session')).json()).session.id, ownerDrawer.id);
  const staffClient = browser();
  await login(staffClient, 'credentials', { email: operator.email, password: 'QaPassword123', tenantSlug: tenants[0].slug });
  assert.equal((await (await staffClient('/api/auth/session')).json()).user.id, operator.id, 'operator has independent password login');
  await prisma.user.update({ where: { id: operator.id }, data: { is_active: false } });
  assert.equal((await (await staffClient('/api/auth/session')).json())?.user, undefined, 'deactivation revokes existing session');
  const { csrfToken } = await (await client('/api/auth/csrf')).json();
  await client('/api/auth/signout', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrfToken, callbackUrl: `${base}/login` }) });
  assert.equal((await (await client('/api/auth/session')).json())?.user, undefined);
  console.log('PASS real password login, PIN switching, tenant isolation, role changes, inactive session revocation and logout');
} finally {
  for (const tenant of tenants) await prisma.tenant.delete({ where: { id: tenant.id } });
  await prisma.$disconnect();
}
