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
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText, filename);
let session = null;
require.cache[require.resolve('../src/auth.ts')] = { exports: { auth: async () => session } };
const { prisma } = require('../src/lib/prisma.ts');
const { createCatalogWorkbook, readCatalogWorkbook } = require('../src/lib/catalog-excel.ts');
const { exportCatalog, importCatalog } = require('../src/lib/catalog-excel-route.ts');
const productsRoute = require('../src/app/api/products/route.ts');
const request = (buffer, action = 'preview') => {
  const form = new FormData(); form.set('action', action); form.set('file', new Blob([buffer]), 'cadastros.xlsx');
  return new Request('https://qa.example/api/products/excel', { method: 'POST', body: form });
};
const get = () => new Request('https://qa.example/api/products/excel');

(async () => {
  const ids = [];
  try {
    for (let i = 0; i < 2; i++) ids.push((await prisma.tenant.create({ data: { name: 'QA Excel', slug: `qa-excel-${randomUUID()}` } })).id);
    const customers = await createCatalogWorkbook('customers', [{ name: 'Cliente Excel', document: '01234567890', zipCode: '01234567', isActive: false }]);
    assert.equal((await exportCatalog(get(), 'customers')).status, 401);
    assert.equal((await importCatalog(request(customers), 'customers')).status, 401);
    session = { user: { tenantId: ids[0], role: 'staff' } };
    for (const kind of ['customers', 'products']) {
      assert.equal((await exportCatalog(get(), kind)).status, 403);
      assert.equal((await importCatalog(request(customers), kind)).status, 403);
    }
    session.user.role = 'owner';
    assert.equal((await importCatalog(request(customers), 'customers')).status, 200);
    assert.equal(await prisma.customer.count({ where: { tenant_id: ids[0] } }), 0, 'preview must never write');
    assert.equal((await importCatalog(request(customers, 'import'), 'customers')).status, 201);
    assert.equal((await importCatalog(request(customers, 'import'), 'customers')).status, 422);
    const invalidBatch = await createCatalogWorkbook('customers', [{ name: 'Novo válido', document: '11111111111' }, { name: 'Inválido', document: 'bad' }]);
    assert.equal((await importCatalog(request(invalidBatch, 'import'), 'customers')).status, 422);
    assert.equal(await prisma.customer.count({ where: { tenant_id: ids[0] } }), 1, 'invalid batch must be atomic');
    session.user.tenantId = ids[1];
    assert.equal((await importCatalog(request(customers, 'import'), 'customers')).status, 201, 'documents may repeat across tenants');
    session.user.tenantId = ids[0];
    const exported = await exportCatalog(get(), 'customers');
    assert.equal(exported.status, 200);
    assert.match(exported.headers.get('content-type'), /spreadsheetml/);
    const customerExport = await readCatalogWorkbook('customers', Buffer.from(await exported.arrayBuffer()));
    assert.equal(customerExport.customers.length, 1);
    assert.equal(customerExport.customers[0].data.isActive, false);
    assert.equal(customerExport.customers[0].data.document, '01234567890');
    const existing = await prisma.product.create({ data: { tenant_id: ids[0], name: 'Legado', sku: 'abc', price: '1.00', stock_quantity: '2', unit_of_measure: 'un', category: 'Categoria antiga' } });
    const productWorkbook = await createCatalogWorkbook('products', [{ name: 'Produto repetido', sku: 'ABC', unitOfMeasure: 'un', price: 12.34, stockQuantity: 1, category: 'Pintura e acessórios' }]);
    assert.equal((await importCatalog(request(productWorkbook, 'import'), 'products')).status, 422, 'duplicate comparison must be case-insensitive');
    session.user.tenantId = ids[1];
    assert.equal((await importCatalog(request(productWorkbook, 'import'), 'products')).status, 201);
    session.user.tenantId = ids[0];
    const concurrentWorkbook = await createCatalogWorkbook('products', [{ name: 'Concorrente', sku: 'CONCURRENT', unitOfMeasure: 'un', price: 3, stockQuantity: 2 }]);
    const concurrent = await Promise.all([importCatalog(request(concurrentWorkbook, 'import'), 'products'), importCatalog(request(concurrentWorkbook, 'import'), 'products')]);
    assert.equal(concurrent.filter(response => response.status === 201).length, 1);
    assert.equal(await prisma.product.count({ where: { tenant_id: ids[0], sku: 'CONCURRENT' } }), 1);
    await prisma.product.createMany({ data: Array.from({ length: 100 }, (_, index) => ({ tenant_id: ids[0], name: `QA produto ${index}`, unit_of_measure: 'un', price: '1.00', stock_quantity: '1', category: index % 2 ? 'Pintura e acessórios' : null })) });
    const allProducts = await exportCatalog(get(), 'products');
    const productExport = await readCatalogWorkbook('products', Buffer.from(await allProducts.arrayBuffer()));
    assert.equal(productExport.products.length, 102, 'export must include records beyond the first screen');
    const filtered = await productsRoute.GET(new Request('https://qa.example/api/products?includeInactive=true&category=Pintura%20e%20acess%C3%B3rios'));
    const filterBody = await filtered.json();
    assert.equal(filterBody.total, 50);
    assert.ok(filterBody.products.every(product => product.category === 'Pintura e acessórios'));
    assert.ok(filterBody.categories.includes('Categoria antiga'));
    const none = await productsRoute.GET(new Request('https://qa.example/api/products?includeInactive=true&category=__uncategorized'));
    assert.equal((await none.json()).total, 51);
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: existing.id } })).stock_quantity.toString(), '2');
    console.log('PASS: Excel authorization, preview without writes, atomic imports, duplicate/case/concurrency checks, tenant isolation, complete exports, leading zeros, inactive records and category filtering.');
  } finally {
    for (const id of ids) await prisma.tenant.delete({ where: { id } });
    await prisma.$disconnect();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
