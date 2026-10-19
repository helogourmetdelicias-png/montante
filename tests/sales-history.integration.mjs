import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { encode } from 'next-auth/jwt';

// Read-only smoke test against a local server and existing test-store sales.
const prisma = new PrismaClient();
const base = process.env.TEST_BASE_URL ?? 'http://localhost:3001';
assert.ok(new URL(base).hostname === 'localhost' || new URL(base).hostname === '127.0.0.1', 'Use a local server.');
const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
assert.ok(secret);

async function cookie(tenantId) {
  const token = await encode({ secret, salt: 'authjs.session-token', token: {
    sub: 'history-readonly-test', id: 'history-readonly-test', tenantId, role: 'cashier', name: 'QA',
  } });
  return `authjs.session-token=${token}`;
}
async function get(path, authCookie) {
  const response = await fetch(new URL(path, base), { headers: authCookie ? { cookie: authCookie } : {}, redirect: 'manual' });
  return { response, html: await response.text() };
}

try {
  const unauthenticated = await get('/vendas');
  assert.ok([302, 303, 307, 308].includes(unauthenticated.response.status));
  assert.match(unauthenticated.response.headers.get('location'), /login/);
  for (const status of ['completed', 'pending', 'cancelled']) {
    const sale = await prisma.sale.findFirst({ where: { status }, select: { id: true, tenant_id: true, sale_number: true } });
    assert.ok(sale, `A test sale with status ${status} is required.`);
    const own = await cookie(sale.tenant_id);
    const detail = await get(`/vendas/${sale.id}`, own);
    assert.equal(detail.response.status, 200);
    if (status === 'completed') assert.ok(detail.html.includes('Imprimir / salvar PDF'));
    else {
      assert.ok(!detail.html.includes('Imprimir / salvar PDF'));
      assert.ok(detail.html.includes('NÃO COMPROVA PAGAMENTO'));
    }
    assert.ok(!detail.html.includes('encrypted_credentials'));
    const list = await get(`/vendas?status=${status}&number=${sale.sale_number}`, own);
    assert.equal(list.response.status, 200);
    assert.ok(list.html.includes(`/vendas/${sale.id}`));
    const other = await get(`/vendas/${sale.id}`, await cookie('history-other-tenant'));
    assert.equal(other.response.status, 404);
    assert.ok(!other.html.includes('COMPROVANTE NÃO FISCAL'));
    const otherList = await get('/vendas', await cookie('history-other-tenant'));
    assert.ok(!otherList.html.includes(`/vendas/${sale.id}`));
  }
  const invalidPage = await get('/vendas?page=-2&status=invalid', await cookie('history-other-tenant'));
  assert.equal(invalidPage.response.status, 200);
  console.log('PASS: login, filters, details for three statuses, receipt gating, tenant isolation and invalid pagination. No data changed.');
} finally {
  await prisma.$disconnect();
}
