const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  return resolve.call(this, name.startsWith('@/') ? path.join(process.cwd(), 'src', name.slice(2)) : name, ...args);
};
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
};
let session = null;
require.cache[require.resolve('../src/auth.ts')] = { exports: { auth: async () => session } };
const { prisma } = require('../src/lib/prisma.ts');
const salesRoute = require('../src/app/api/sales/route.ts');
const cashRoute = require('../src/app/api/sales/[id]/cash-payment/route.ts');
const { cancelSaleAndRestore, releaseExpiredSales } = require('../src/lib/sales/reservations.ts');
const { completedSalesWhere } = require('../src/lib/billing.ts');
const request = data => new Request('https://qa.example/api/sales', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });

(async () => {
  const tenants = [];
  try {
    for (let index = 0; index < 2; index++) tenants.push(await prisma.tenant.create({ data: { name: 'QA quick sales', slug: `qa-quick-${randomUUID()}` } }));
    const tenantId = tenants[0].id;
    const operator = await prisma.user.create({ data: { tenant_id: tenantId, name: 'QA Operator', email: 'qa@example.invalid', role: 'staff' } });
    const product = await prisma.product.create({ data: { tenant_id: tenantId, name: 'QA stock', price: '2.50', unit_of_measure: 'un', stock_quantity: '10' } });
    const input = { idempotencyKey: randomUUID(), mode: 'quick', quickAmount: 12.34 };
    assert.equal((await salesRoute.POST(request(input))).status, 401);
    session = { user: { id: operator.id, tenantId, role: 'staff' } };
    assert.equal((await salesRoute.POST(request(input))).status, 409, 'closed register must block quick sales');
    await prisma.cashRegisterSession.create({ data: { tenant_id: tenantId, user_id: operator.id, initial_amount: '0' } });
    for (const patch of [{ quickAmount: 0 }, { quickAmount: 12.345 }, { items: [{ productId: product.id, quantity: 1 }] }]) {
      assert.equal((await salesRoute.POST(request({ ...input, ...patch }))).status, 400);
    }
    const response = await salesRoute.POST(request(input));
    assert.equal(response.status, 201);
    const { sale } = await response.json();
    assert.equal(sale.mode, 'quick');
    assert.equal(sale.totalAmount, '12.34');
    assert.equal(sale.customerId, null);
    assert.deepEqual(sale.items, []);
    assert.equal((await salesRoute.POST(request(input))).status, 200);
    assert.equal((await salesRoute.POST(request({ ...input, quickAmount: 12.35 }))).status, 409);
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stock_quantity.toString(), '10');
    session = { user: { id: operator.id, tenantId: tenants[1].id, role: 'staff' } };
    assert.notEqual((await cashRoute.POST(request({ idempotencyKey: randomUUID(), amountApplied: 12.34, amountReceived: 20 }), { params: { id: sale.id } })).status, 200);
    session = { user: { id: operator.id, tenantId, role: 'staff' } };
    const cashInput = { idempotencyKey: randomUUID(), amountApplied: 12.34, amountReceived: 20 };
    const paidResponse = await cashRoute.POST(request(cashInput), { params: { id: sale.id } });
    assert.equal(paidResponse.status, 200);
    const paid = await paidResponse.json();
    assert.equal(paid.changeAmount, '7.66');
    assert.equal((await cashRoute.POST(request(cashInput), { params: { id: sale.id } })).status, 200);
    assert.equal((await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })).status, 'completed');
    assert.equal(await prisma.paymentAttempt.count({ where: { sale_id: sale.id } }), 1);
    assert.equal(await prisma.sale.count({ where: completedSalesWhere(tenantId, new Date(0), new Date(Date.now() + 1000)) }), 1);
    const detail = require('../src/app/vendas/[id]/page.tsx').default;
    const { renderToStaticMarkup } = require('react-dom/server');
    const html = renderToStaticMarkup(await detail({ params: { id: sale.id }, searchParams: { embedded: '1' } }));
    assert.match(html, /Venda rápida/);
    assert.match(html, /12,34/);
    session.user.role = 'owner';
    const report = await require('../src/app/api/reports/sales/route.ts').GET(new Request('https://qa.example/api/reports/sales'));
    const reportBody = await report.json();
    assert.equal(reportBody.summary.revenue, '12.34');
    assert.equal(reportBody.summary.saleCount, 1);
    assert.deepEqual(reportBody.topProductsByRevenue, []);
    const cancelledResponse = await salesRoute.POST(request({ ...input, idempotencyKey: randomUUID(), quickAmount: 5 }));
    const cancelled = (await cancelledResponse.json()).sale;
    await prisma.$transaction(tx => cancelSaleAndRestore(tx, tenantId, cancelled.id));
    await prisma.$transaction(tx => cancelSaleAndRestore(tx, tenantId, cancelled.id));
    assert.equal((await prisma.sale.findUniqueOrThrow({ where: { id: cancelled.id } })).status, 'cancelled');
    const expiredResponse = await salesRoute.POST(request({ ...input, idempotencyKey: randomUUID(), quickAmount: 7 }));
    const expired = (await expiredResponse.json()).sale;
    await prisma.sale.update({ where: { id: expired.id }, data: { expires_at: new Date(Date.now() - 1000) } });
    await prisma.$transaction(tx => releaseExpiredSales(tx, tenantId, new Date()));
    assert.equal((await prisma.sale.findUniqueOrThrow({ where: { id: expired.id } })).status, 'cancelled');
    const advancedResponse = await salesRoute.POST(request({ idempotencyKey: randomUUID(), items: [{ productId: product.id, quantity: 2 }] }));
    assert.equal(advancedResponse.status, 201);
    assert.equal((await advancedResponse.json()).sale.mode, 'advanced');
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stock_quantity.toString(), '8');
    console.log('PASS: quick amount validation, no product/customer, register, tenant isolation, idempotency, cash/change, receipt, reports, billing count, cancellation/expiration and advanced stock reservation.');
  } finally {
    for (const tenant of tenants) {
      await prisma.sale.deleteMany({ where: { tenant_id: tenant.id } });
      await prisma.cashRegisterMovement.deleteMany({ where: { tenant_id: tenant.id } });
      await prisma.cashRegisterSession.deleteMany({ where: { tenant_id: tenant.id } });
      await prisma.tenant.delete({ where: { id: tenant.id } });
    }
    await prisma.$disconnect();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
