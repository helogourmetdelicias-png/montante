const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { PrismaClient, Prisma } = require('@prisma/client');
const originalUrl = process.env.DATABASE_URL;
assert.ok(originalUrl, 'Load the database environment first');
const schema = `qa_daily_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
const testUrl = new URL(originalUrl); testUrl.searchParams.set('schema', schema);
const admin = new PrismaClient({ datasources: { db: { url: originalUrl } } });
const db = new PrismaClient({ datasources: { db: { url: testUrl.toString() } } });
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) { return resolve.call(this, name.startsWith('@/') ? path.join(process.cwd(), 'src', name.slice(2)) : name, ...args); };
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
}).outputText, filename);
let session = null;
require.cache[require.resolve('../src/auth.ts')] = { exports: { auth: async () => session } };
require.cache[require.resolve('../src/lib/prisma.ts')] = { exports: { prisma: db } };
const sales = require('../src/app/api/sales/route.ts');
const cash = require('../src/app/api/sales/[id]/cash-payment/route.ts');
const register = require('../src/app/api/cash-register/session/route.ts');
const movements = require('../src/app/api/cash-register/movements/route.ts');
const { ensureDailyCashRegister } = require('../src/lib/cash-register/daily-session.ts');
const { completeCreditSale, receiveCreditPayment } = require('../src/lib/credit.ts');
const { getCashRegisterSummary, expectedDrawerAmount } = require('../src/lib/cash-register/summary.ts');
const { runSerializableTransaction } = require('../src/lib/database/transactions.ts');
const req = body => new Request('https://qa.invalid/api', { method: 'POST', body: JSON.stringify(body) });
const get = id => register.GET(new Request(`https://qa.invalid/api/cash-register/session${id ? `?sessionId=${id}` : ''}`));
async function ok(response, status) { assert.equal(response.status, status, await response.clone().text()); return response.json(); }

(async () => {
  assert.match(schema, /^qa_daily_[a-f0-9]{12}$/);
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  try {
    // Apply the actual migration chain only inside a disposable schema.
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
      env: { ...process.env, DATABASE_URL: testUrl.toString(), DIRECT_URL: testUrl.toString() }, stdio: 'pipe',
    });
    const tenant = await db.tenant.create({ data: { name: 'QA daily', slug: `qa-${randomUUID()}` } });
    const user = await db.user.create({ data: { tenant_id: tenant.id, name: 'QA', email: 'qa@example.invalid', role: 'owner' } });
    session = { user: { id: user.id, tenantId: tenant.id, role: 'owner' } };
    const yesterday = await db.cashRegisterSession.create({ data: { tenant_id: tenant.id, user_id: user.id, initial_amount: 100, opened_at: new Date(Date.now() - 86400000) } });
    const oldSale = await db.sale.create({ data: { tenant_id: tenant.id, sale_number: 1, cash_register_session_id: yesterday.id, status: 'completed', total_amount: 20 } });
    await db.paymentAttempt.create({ data: { tenant_id: tenant.id, sale_id: oldSale.id, provider: 'cash', method: 'CASH', channel: 'IN_PERSON', status: 'APPROVED', amount: 20, idempotency_key: randomUUID() } });
    await db.tenant.update({ where: { id: tenant.id }, data: { sales_sequence: 1 } });
    const start = await ok(await get(), 200);
    assert.equal(start.session, null);
    assert.equal(start.previousDays[0].id, yesterday.id);
    assert.equal((await ok(await get(yesterday.id), 200)).session.expectedAmount, '120.00');

    // Two simultaneous first sales must create only one independent daily drawer.
    const inputs = [12.34, 8].map(quickAmount => ({ mode: 'quick', quickAmount, idempotencyKey: randomUUID() }));
    const [first, second] = await Promise.all(inputs.map(async input => (await ok(await sales.POST(req(input)), 201)).sale));
    const today = (await ok(await get(), 200)).session;
    assert.notEqual(today.id, yesterday.id);
    assert.equal(today.initialAmount, '0.00');
    assert.equal(today.expectedAmount, '0.00');
    assert.equal(await db.cashRegisterSession.count({ where: { tenant_id: tenant.id, status: 'OPEN' } }), 2);
    assert.equal((await db.sale.findUniqueOrThrow({ where: { id: first.id } })).cash_register_session_id, today.id);
    const payInput = { idempotencyKey: randomUUID(), amountApplied: 12.34, amountReceived: 20 };
    assert.equal((await ok(await cash.POST(req(payInput), { params: { id: first.id } }), 200)).changeAmount, '7.66');
    await ok(await cash.POST(req(payInput), { params: { id: first.id } }), 200);
    assert.equal(await db.paymentAttempt.count({ where: { sale_id: first.id } }), 1);

    // A sale started yesterday but received today belongs to today's cash total.
    await db.sale.update({ where: { id: second.id }, data: { cash_register_session_id: yesterday.id } });
    await ok(await cash.POST(req({ idempotencyKey: randomUUID(), amountApplied: 8, amountReceived: 8 }), { params: { id: second.id } }), 200);
    assert.equal((await ok(await get(yesterday.id), 200)).session.expectedAmount, '120.00');
    assert.equal((await ok(await get(), 200)).session.expectedAmount, '20.34');

    const customer = await db.customer.create({ data: { tenant_id: tenant.id, name: 'QA client' } });
    const creditSale = (await ok(await sales.POST(req({ mode: 'quick', quickAmount: 10, idempotencyKey: randomUUID() })), 201)).sale;
    await db.sale.update({ where: { id: creditSale.id }, data: { cash_register_session_id: yesterday.id } });
    const credit = await completeCreditSale(tenant.id, user.id, creditSale.id, customer.id);
    await receiveCreditPayment(tenant.id, user.id, credit.id, { amount: 5, method: 'CASH', idempotencyKey: randomUUID() });
    await ok(await movements.POST(req({ type: 'supply', amount: 3, description: 'Troco de hoje' })), 201);
    await ok(await movements.POST(req({ type: 'withdrawal', amount: 2, description: 'Retirada de hoje' })), 201);
    const amounts = await getCashRegisterSummary(db, tenant.id, today.id);
    assert.equal(expectedDrawerAmount(new Prisma.Decimal(0), amounts).toFixed(2), '26.34');
    const closure = await ok(await register.PATCH(req({ sessionId: today.id, declaredAmount: 26.34 })), 200);
    assert.equal(closure.session.differenceAmount, '0.00');
    // After optional closing, the next sale still works without a manual opening.
    await ok(await sales.POST(req({ mode: 'quick', quickAmount: 1, idempotencyKey: randomUUID() })), 201);
    assert.equal((await ok(await get(), 200)).session.expectedAmount, '0.00');

    const other = await db.tenant.create({ data: { name: 'QA other', slug: `qa-${randomUUID()}` } });
    const otherUser = await db.user.create({ data: { tenant_id: other.id, name: 'QA', email: 'other@example.invalid', role: 'owner' } });
    session = { user: { id: otherUser.id, tenantId: other.id, role: 'owner' } };
    assert.equal((await ok(await get(yesterday.id), 200)).session, null);
    assert.deepEqual((await ok(await get(), 200)).previousDays, []);
    const autoSupply = await ok(await movements.POST(req({ type: 'supply', amount: 7, description: 'Sem abertura manual' })), 201);
    assert.equal(autoSupply.movement.amount, '7.00');
    assert.equal((await ok(await get(), 200)).session.expectedAmount, '7.00');
    const tomorrow = await runSerializableTransaction(tx => ensureDailyCashRegister(tx, other.id, otherUser.id, new Date(Date.now() + 86400000)));
    assert.equal(tomorrow.initial_amount.toFixed(2), '0.00');
    assert.equal((await ok(await get(), 200)).session.expectedAmount, '7.00');
    const technician = await db.user.create({ data: { tenant_id: other.id, name: 'QA technician', email: 'technician@example.invalid', role: 'owner' } });
    session.user.id = technician.id;
    const { saveServiceOrder } = require('../src/lib/service-orders/service.ts');
    const checkout = require('../src/app/api/service-orders/[id]/checkout/route.ts');
    const order = await db.$transaction(tx => saveServiceOrder(tx, other.id, {
      clientName: 'Cliente QA', clientPhone: '21999999999', deviceType: 'Notebook', deviceBrandModel: 'Modelo QA',
      reportedDefect: 'Não liga', aestheticCondition: 'Riscos', laborTotal: 20, photoUrls: [], parts: [],
    }));
    await db.serviceOrder.update({ where: { id: order.id }, data: { status: 'READY' } });
    const checked = await ok(await checkout.POST(req({}), { params: Promise.resolve({ id: order.id }) }), 200);
    const technicianYesterday = await db.cashRegisterSession.create({ data: { tenant_id: other.id, user_id: technician.id, initial_amount: 0, opened_at: new Date(Date.now() - 86400000) } });
    await db.sale.update({ where: { id: checked.saleId }, data: { cash_register_session_id: technicianYesterday.id } });
    const resumed = await ok(await checkout.POST(req({}), { params: Promise.resolve({ id: order.id }) }), 200);
    assert.equal(resumed.saleId, checked.saleId, 'same operator can resume yesterday service checkout');
    console.log('PASS: actual migrations; concurrent automatic opening; yesterday preserved; separate receipts across midnight; no carried float; optional closing/reopening; daily credits/supplies/withdrawals; tenant isolation.');
  } finally {
    await db.$disconnect();
    assert.match(schema, /^qa_daily_[a-f0-9]{12}$/);
    await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.$disconnect();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
