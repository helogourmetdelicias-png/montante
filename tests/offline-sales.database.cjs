const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, ...args) { return resolve.call(this, name.startsWith('@/') ? path.join(process.cwd(), 'src', name.slice(2)) : name, ...args); };
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
let session = null;
require.cache[require.resolve('../src/auth.ts')] = { exports: { auth: async () => session } };
const { prisma } = require('../src/lib/prisma.ts');
const { signOffline, ticketValue, productValue } = require('../src/lib/offline/signing.ts');
const { businessDayRange } = require('../src/lib/cash-register/business-day.ts');
const { POST } = require('../src/app/api/pos/offline/sync/route.ts');
const send = data => POST(new Request('https://qa.example/api/pos/offline/sync', { method: 'POST', body: JSON.stringify(data) }));

(async () => {
  let tenant;
  try {
    tenant = await prisma.tenant.create({ data: { name: 'QA offline isolated', slug: `qa-offline-${randomUUID()}` } });
    const user = await prisma.user.create({ data: { tenant_id: tenant.id, name: 'QA Offline', email: 'offline@example.invalid', role: 'owner' } });
    session = { user: { id: user.id, tenantId: tenant.id, role: 'owner', name: user.name } };
    const yesterday = new Date(Date.now() - 86400_000);
    const historical = await prisma.cashRegisterSession.create({ data: { tenant_id: tenant.id, user_id: user.id, initial_amount: 50, declared_amount: 80, expected_amount: 50, difference_amount: 30, status: 'CLOSED', opened_at: yesterday, closed_at: new Date(yesterday.getTime() + 1000) } });
    const today = await prisma.cashRegisterSession.create({ data: { tenant_id: tenant.id, user_id: user.id, initial_amount: 0 } });
    const products = await Promise.all([10, 0].map((stock, index) => prisma.product.create({ data: { tenant_id: tenant.id, name: `QA offline ${index}`, price: 99, stock_quantity: stock, unit_of_measure: 'un' } })));
    const preparedAt = new Date(yesterday.getTime() - 60_000).toISOString();
    const ticket = signOffline(ticketValue(tenant.id, user.id, preparedAt));
    const item = product => ({ productId: product.id, quantityMilli: 1000, price: '10.00', sellByFraction: false, signature: signOffline(productValue(ticket, product.id, '10.00', false)) });
    const input = { id: randomUUID(), tenantId: tenant.id, userId: user.id, preparedAt, ticket, occurredAt: yesterday.toISOString(), mode: 'advanced', quickCents: 0, discountCents: 0, receivedCents: 2000, notes: 'QA offline', items: [item(products[0])] };
    const concurrent = await Promise.all([send(input), send(input)]);
    assert.deepEqual(concurrent.map(response => response.status), [200, 200]);
    assert.equal(await prisma.sale.count({ where: { tenant_id: tenant.id } }), 1);
    assert.equal(await prisma.paymentAttempt.count({ where: { tenant_id: tenant.id } }), 1);
    const saved = await prisma.sale.findFirstOrThrow({ where: { tenant_id: tenant.id }, include: { payment_attempts: true } });
    assert.equal(saved.status, 'completed'); assert.equal(saved.total_amount.toFixed(2), '10.00');
    assert.equal(saved.change_amount.toFixed(2), '10.00'); assert.equal(saved.sold_at.toISOString(), input.occurredAt);
    assert.equal(saved.cash_register_session_id, historical.id); assert.equal(saved.payment_attempts[0].cash_session_id, historical.id);
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: products[0].id } })).stock_quantity.toString(), '9');
    const drawer = await prisma.cashRegisterSession.findUniqueOrThrow({ where: { id: historical.id } });
    assert.equal(drawer.status, 'CLOSED'); assert.equal(drawer.expected_amount.toString(), '60'); assert.equal(drawer.difference_amount.toString(), '20');
    assert.equal((await prisma.cashRegisterSession.findUniqueOrThrow({ where: { id: today.id } })).initial_amount.toString(), '0');
    assert.equal(await prisma.sale.count({ where: { tenant_id: tenant.id, sold_at: businessDayRange(new Date()) } }), 0);
    const failed = await send({ ...input, id: randomUUID(), items: products.map(item) });
    assert.equal(failed.status, 409);
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: products[0].id } })).stock_quantity.toString(), '9', 'first debit must roll back when second item is unavailable');
    assert.equal(await prisma.sale.count({ where: { tenant_id: tenant.id } }), 1);
    const conflict = await send({ ...input, receivedCents: 2500 }); assert.equal(conflict.status, 409);
    const bootstrap = await require('../src/app/api/pos/offline/route.ts').GET();
    const cached = await bootstrap.json(); assert.equal(cached.products.length, 2); assert.equal(cached.products[0].price, '99.00'); assert.equal(cached.userId, user.id);
    assert.equal(bootstrap.headers.get('cache-control'), 'private, no-store');
    console.log('PASS: isolated DB concurrent idempotency, single stock debit/receipt, signed historical price, original day, closed drawer adjustment, today separation, atomic rollback, conflict retention and bootstrap.');
  } finally {
    if (tenant) {
      await prisma.sale.deleteMany({ where: { tenant_id: tenant.id } });
      await prisma.cashRegisterSession.deleteMany({ where: { tenant_id: tenant.id } });
      await prisma.tenant.delete({ where: { id: tenant.id } });
      assert.equal(await prisma.tenant.count({ where: { id: tenant.id } }), 0);
      console.log('QA offline data removed.');
    }
    await prisma.$disconnect();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
