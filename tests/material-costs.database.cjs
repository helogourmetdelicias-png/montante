const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const originalUrl = process.env.DATABASE_URL;
assert.ok(originalUrl, 'Load the database environment first');
const schema = `qa_cost_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
assert.match(schema, /^qa_cost_[a-f0-9]{12}$/);
const testUrl = new URL(originalUrl); testUrl.searchParams.set('schema', schema);
const admin = new PrismaClient({ datasources: { db: { url: originalUrl } } });
const isolated = new PrismaClient({ datasources: { db: { url: testUrl.toString() } } });
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  return resolve.call(this, name.startsWith('@/') ? path.join(process.cwd(), 'src', name.slice(2)) : name, ...args);
};
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
}).outputText, filename);
let session = null;
require.cache[require.resolve('../src/auth.ts')] = { exports: { auth: async () => session } };
require.cache[require.resolve('../src/lib/prisma.ts')] = { exports: { prisma: isolated } };
const { prisma } = require('../src/lib/prisma.ts');

const cash = require('../src/app/api/sales/[id]/cash-payment/route.ts');
const sales = require('../src/app/api/sales/route.ts');
const catalog = require('../src/app/api/products/route.ts');
const productEdit = require('../src/app/api/products/[id]/route.ts');
const { saveServiceOrder } = require('../src/lib/service-orders/service.ts');
const { POST: checkout } = require('../src/app/api/service-orders/[id]/checkout/route.ts');
const { GET: reports } = require('../src/app/api/reports/sales/route.ts');
const { Prisma } = require('@prisma/client');
const req = body => new Request('https://qa.invalid', { method: 'POST', body: JSON.stringify(body) });
(async () => {
 await admin.$executeRawUnsafe('CREATE SCHEMA "'+schema+'"');
 try {
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], { env: { ...process.env, DATABASE_URL: testUrl.toString(), DIRECT_URL: testUrl.toString() }, stdio: 'pipe' });
  const tenant = await prisma.tenant.create({ data: { name: 'QA costs', slug: 'qa-cost-'+randomUUID(), niche: 'IT_SUPPORT' } });
  const foreign = await prisma.tenant.create({ data: { name: 'QA other', slug: 'qa-other-'+randomUUID() } });
  const user = await prisma.user.create({ data: { tenant_id: tenant.id, name: 'QA', email: 'qa@example.invalid', role: 'owner' } });
  session = { user: { id: user.id, tenantId: tenant.id, role: 'owner' } };
  await prisma.cashRegisterSession.create({ data: { tenant_id: tenant.id, user_id: user.id, initial_amount: 0 } });
  const response = await catalog.POST(req({ name: 'Peça', price: 100, costPrice: 20, sellByFraction: false, unitOfMeasure: 'un', stockQuantity: 20 }));
  assert.equal(response.status, 201, await response.clone().text()); const product = (await response.json()).product;
  assert.equal(product.costPrice, '20.00');
  const saleRequest = { idempotencyKey: randomUUID(), items: [{ productId: product.id, quantity: 2 }], discountAmount: 10 };
  const created = await sales.POST(req(saleRequest)); assert.equal(created.status, 201, await created.clone().text());
  const sale = (await created.json()).sale;
  assert.equal((await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })).cost_total.toFixed(2), '40.00');
  const paid = await cash.POST(req({ idempotencyKey: randomUUID(), amountApplied: 190, amountReceived: 190 }), { params: { id: sale.id } }); assert.equal(paid.status, 200, await paid.clone().text());
  const input = { clientName: 'Cliente QA', clientPhone: '11999999999', deviceType: 'Notebook', deviceBrandModel: 'Modelo QA', reportedDefect: 'Não liga', aestheticCondition: 'Riscos', laborTotal: 50, additionalMaterialCost: 5, photoUrls: [], parts: [{ productId: product.id, quantity: 2 }] };
  let order = await prisma.$transaction(tx => saveServiceOrder(tx, tenant.id, input));
  assert.equal(order.parts[0].unit_cost.toFixed(2), '20.00');
  assert.equal(order.grand_total.toFixed(2), '250.00', 'internal expenses do not inflate customer charges');
  order = await prisma.$transaction(tx => saveServiceOrder(tx, tenant.id, input, { id: order.id, version: order.version, status: 'READY' }));
  const pulled = await checkout(req({}), { params: Promise.resolve({ id: order.id }) }); assert.equal(pulled.status, 200, await pulled.clone().text());
  const serviceSaleId = (await pulled.json()).saleId;
  assert.equal((await prisma.sale.findUniqueOrThrow({ where: { id: serviceSaleId } })).cost_total.toFixed(2), '45.00');
  assert.equal(await prisma.saleItem.count({ where: { sale_id: serviceSaleId } }), 0, 'service costs must not duplicate stock sale items');
  const servicePayment = { idempotencyKey: randomUUID(), amountApplied: 250, amountReceived: 250 };
  const servicePaid = await cash.POST(req(servicePayment), { params: { id: serviceSaleId } }); assert.equal(servicePaid.status, 200, await servicePaid.clone().text());
  assert.equal((await cash.POST(req(servicePayment), { params: { id: serviceSaleId } })).status, 200);
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stock_quantity.toString(), '16', 'normal sale and OS each deduct stock once');
  const patched = await productEdit.PATCH(req({ costPrice: 80 }), { params: { id: product.id } }); assert.equal(patched.status, 200);
  assert.equal((await patched.json()).product.costPrice, '80.00');
  const replay = await sales.POST(req(saleRequest)); assert.equal(replay.status, 200);
  assert.equal((await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })).cost_total.toFixed(2), '40.00', 'replay and catalog edits preserve historical costs');
  const quick = await sales.POST(req({ idempotencyKey: randomUUID(), mode: 'quick', quickAmount: 10 })); assert.equal(quick.status, 201);
  const quickId = (await quick.json()).sale.id;
  await prisma.sale.update({ where: { id: quickId }, data: { status: 'completed' } });
  await prisma.sale.create({ data: { tenant_id: foreign.id, sale_number: 1, total_amount: 9000, cost_total: 1, status: 'completed' } });
  await prisma.sale.create({ data: { tenant_id: tenant.id, sale_number: 999, total_amount: 900, cost_total: 500, status: 'cancelled' } });
  const report = await reports(new Request('https://qa.invalid/api/reports/sales')); assert.equal(report.status, 200);
  const body = await report.json();
  assert.equal(body.summary.revenue, '450.00');
  assert.deepEqual(body.costs, { total: '85.00', revenue: '440.00', grossProfit: '355.00', coveredSales: 2, missingSales: 1 });
  session.user.role = 'staff'; assert.equal((await reports(new Request('https://qa.invalid/api/reports/sales'))).status, 403);
  console.log('PASS: product create/edit, immutable discounted sale costs, service parts plus extras once, unchanged charges, quick/legacy unknown costs, cancelled exclusion, management access and tenant-isolated reports.');
 } finally {
  await isolated.$disconnect();
  assert.match(schema, /^qa_cost_[a-f0-9]{12}$/);
  await admin.$executeRawUnsafe('DROP SCHEMA "'+schema+'" CASCADE');
  await admin.$disconnect();
 }
})().catch(error => { console.error(error); process.exitCode=1; });

