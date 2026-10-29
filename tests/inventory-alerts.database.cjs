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
const schema = `qa_inventory_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
assert.match(schema, /^qa_inventory_[a-f0-9]{12}$/);
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

const catalog = require('../src/app/api/products/route.ts');
const edit = require('../src/app/api/products/[id]/route.ts');
const alerts = require('../src/app/api/inventory-alerts/route.ts');
const exportAlerts = require('../src/app/api/inventory-alerts/export/route.ts');
const { getInventoryAlerts } = require('../src/lib/inventory-alerts-server.ts');
const { businessDateKey } = require('../src/lib/cash-register/business-day.ts');
const ExcelJS = require('exceljs');
const req = (body, method = 'POST') => new Request('https://qa.invalid', { method, body: JSON.stringify(body) });
const query = params => new Request(`https://qa.invalid/api/inventory-alerts?${new URLSearchParams(params)}`);
async function ok(response, status = 200) { assert.equal(response.status, status, await response.clone().text()); return response.json(); }

(async () => {
  assert.match(schema, /^qa_inventory_[a-f0-9]{12}$/);
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  try {
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], { env: { ...process.env, DATABASE_URL: testUrl.toString(), DIRECT_URL: testUrl.toString() }, stdio: 'pipe' });
    const tenant = await prisma.tenant.create({ data: { name: 'QA inventory', slug: `qa-${randomUUID()}`, niche: 'BEVERAGES' } });
    const foreign = await prisma.tenant.create({ data: { name: 'QA other', slug: `qa-${randomUUID()}` } });
    const user = await prisma.user.create({ data: { tenant_id: tenant.id, name: 'QA', email: 'qa@example.invalid', role: 'owner' } });
    const today = businessDateKey(new Date());
    const day = offset => { const value = new Date(`${today}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + offset); return value.toISOString().slice(0, 10); };
    await ok(await alerts.GET(query({})), 401);
    session = { user: { id: user.id, tenantId: tenant.id, role: 'staff' } };
    await ok(await alerts.GET(query({})), 403);
    await ok(await exportAlerts.GET(query({})), 403);
    session.user.role = 'owner';
    async function product(name, quantity, minimum, expiryDate, isActive = true) {
      const response = await catalog.POST(req({ name, unitOfMeasure: 'un', price: 10, stockQuantity: quantity, stockMinAlert: minimum, sellByFraction: false, isActive, attributes: { expiryDate, lot: '000012' } }));
      return (await ok(response, 201)).product;
    }
    const low = await product('Low and near expiry', 4, 5, day(8));
    const out = await product('Out of stock', 0, 5, day(-1));
    const expired = await product('Expired', 3, null, day(-1));
    const urgent = await product('Expires today', 3, null, day(0));
    const in30 = await product('Expires in thirty days', 3, null, day(30));
    await product('No minimum', 2, null, null);
    await product('At minimum', 5, 5, day(31));
    await product('Inactive', 0, 5, day(-1), false);
    await prisma.product.create({ data: { tenant_id: foreign.id, name: 'FOREIGN SECRET PRODUCT', unit_of_measure: 'un', price: 10, stock_quantity: 0, stock_min_alert: 5, attributes: { expiryDate: day(-1) } } });
    await prisma.product.create({ data: { tenant_id: tenant.id, name: 'Malformed legacy date', unit_of_measure: 'un', price: 10, stock_quantity: 3, attributes: { expiryDate: '2026-02-30' } } });
    await prisma.product.createMany({ data: Array.from({ length: 121 }, (_, index) => ({ tenant_id: tenant.id, name: `Low bulk ${index}`, unit_of_measure: 'un', price: 10, stock_quantity: 2, stock_min_alert: 5 })) });
    const all = await getInventoryAlerts(prisma, tenant.id);
    assert.deepEqual(all.summary, { all: 126, low: 122, out: 1, expired: 1, urgent: 1, expiring: 3 });
    assert.equal(all.items[0].id, expired.id);
    assert.equal(all.items.find(item => item.id === low.id).attributes.lot, '000012');
    assert.equal(all.items.find(item => item.id === out.id).daysUntilExpiry, null);
    assert.equal(all.items.find(item => item.id === urgent.id).daysUntilExpiry, 0);
    const page1 = await ok(await alerts.GET(query({ filter: 'low' })));
    const page3 = await ok(await alerts.GET(query({ filter: 'low', page: '3' })));
    assert.equal(page1.items.length, 50); assert.equal(page3.items.length, 22);
    assert.equal(page3.summary.low, 122); assert.equal(page3.total, 122);
    const filtered = await ok(await catalog.GET(new Request('https://qa.invalid/api/products?alert=expired&includeInactive=true')));
    assert.deepEqual(filtered.products.map(item => item.id), [expired.id]);
    const near = await ok(await alerts.GET(query({ filter: 'expiring' })));
    assert.equal(near.total, 3); assert.ok(near.items.some(item => item.id === in30.id));
    const workbookResponse = await exportAlerts.GET(query({ filter: 'expiring', q: 'Low and' }));
    assert.equal(workbookResponse.status, 200);
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Buffer.from(await workbookResponse.arrayBuffer()));
    const sheet = workbook.getWorksheet('Alertas');
    assert.equal(sheet.rowCount, 2); assert.equal(sheet.getCell('A2').value, 'Low and near expiry');
    assert.equal(sheet.getCell('D2').value, 4); assert.equal(sheet.getCell('F2').value, 5); assert.equal(sheet.getCell('H2').value, 8); assert.equal(sheet.getCell('I2').value, '000012');
    assert.ok(sheet.getCell('J2').value.includes('Estoque baixo'));
    await ok(await edit.PATCH(req({ stockQuantity: 6, attributes: { expiryDate: day(31) } }, 'PATCH'), { params: Promise.resolve({ id: low.id }) }));
    assert.equal((await getInventoryAlerts(prisma, tenant.id)).summary.all, 125);
    await ok(await edit.PATCH(req({ attributes: { expiryDate: '2026-02-30' } }, 'PATCH'), { params: Promise.resolve({ id: low.id }) }), 400);
    for (const filter of ['unknown', 'all;DROP TABLE Product']) await ok(await alerts.GET(query({ filter })), 400);
    session.user.tenantId = foreign.id;
    const other = await ok(await alerts.GET(query({})));
    assert.equal(other.summary.all, 1); assert.equal(other.items[0].name, 'FOREIGN SECRET PRODUCT');
    console.log('PASS: isolated PostgreSQL query, full-catalog totals beyond pagination, precise dates, filtered catalog/report/Excel, persisted minimum/expiry/lot, tenant isolation and management access.');
  } finally {
    await isolated.$disconnect();
    assert.match(schema, /^qa_inventory_[a-f0-9]{12}$/);
    await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.$disconnect();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

