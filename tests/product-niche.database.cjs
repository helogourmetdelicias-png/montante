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
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
}).outputText, filename);
let session = null;
require.cache[require.resolve('../src/auth.ts')] = { exports: { auth: async () => session } };
const { prisma } = require('../src/lib/prisma.ts');
const catalog = require('../src/app/api/products/route.ts');
const item = require('../src/app/api/products/[id]/route.ts');
const request = (data, method = 'POST') => new Request('https://qa.invalid/api/products', { method, body: JSON.stringify(data) });
(async () => {
 const ids = [];
 try {
  for (let i = 0; i < 2; i++) ids.push((await prisma.tenant.create({ data: { name: 'QA product niche', slug: 'qa-product-niche-' + randomUUID() } })).id);
  const base = { name: 'Produto QA', unitOfMeasure: 'un', sellByFraction: false, price: 10, stockQuantity: 3, sku: 'QA-SKU' };
  assert.equal((await catalog.POST(request(base))).status, 401);
  session = { user: { tenantId: ids[0], role: 'staff' } };
  assert.equal((await catalog.POST(request(base))).status, 403);
  session.user.role = 'owner';
  const cases = [
   ['COSMETICS', { volume: '100ml', expiryDate: '2027-12-31', lot: 'LOTE-01' }],
   ['CLOTHING', { size: 'M', color: 'Azul', gender: 'Unissex' }],
   ['BEVERAGES', { packaging: 'Garrafa Retornável', volume: '600ml', requiresContainer: true, containerValue: 3.5 }],
   ['CONSTRUCTION', {}], ['OTHER', {}],
  ];
  let productId;
  for (const [niche, attributes] of cases) {
   await prisma.tenant.update({ where: { id: ids[0] }, data: { niche } });
   const response = await catalog.POST(request({ ...base, sku: niche, brand: 'QA marca', attributes }));
   assert.equal(response.status, 201, await response.clone().text());
   const product = (await response.json()).product;
   assert.deepEqual(product.attributes, attributes); assert.equal(product.brand, 'QA marca');
   assert.deepEqual((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).attributes, attributes);
   const listed = await (await catalog.GET(new Request('https://qa.invalid/api/products?includeInactive=true'))).json();
   assert.deepEqual(listed.products.find(row => row.id === product.id).attributes, attributes);
   const edit = await item.PATCH(request({ name: 'QA editado' }, 'PATCH'), { params: { id: product.id } });
   assert.equal(edit.status, 200); assert.deepEqual((await edit.json()).product.attributes, attributes);
   if (niche === 'COSMETICS') productId = product.id;
   if (niche === 'CLOTHING') {
    const partial = await item.PATCH(request({ attributes: { color: null } }, 'PATCH'), { params: { id: product.id } });
    assert.deepEqual((await partial.json()).product.attributes, { ...attributes, color: null });
   }
  }
  await prisma.tenant.update({ where: { id: ids[0] }, data: { niche: 'CLOTHING' } });
  const changedNiche = await item.PATCH(request({ attributes: { size: 'G' } }, 'PATCH'), { params: { id: productId } });
  const preserved = (await changedNiche.json()).product.attributes;
  assert.equal(preserved.size, 'G'); assert.equal(preserved.lot, 'LOTE-01');
  assert.equal((await catalog.POST(request({ ...base, attributes: { packaging: 'Lata' } }))).status, 400);
  assert.equal((await catalog.POST(request({ ...base, attributes: { containerValue: -1 } }))).status, 400);
  assert.equal((await catalog.POST(request(base))).status, 201, 'legacy product requests remain valid');
  session.user.tenantId = ids[1];
  assert.equal((await item.PATCH(request({ attributes: { size: 'P' } }, 'PATCH'), { params: { id: productId } })).status, 404);
  assert.equal((await item.DELETE(new Request('https://qa.invalid'), { params: { id: productId } })).status, 404);
  assert.equal((await (await catalog.GET(new Request('https://qa.invalid/api/products'))).json()).total, 0);
  console.log('PASS all niches: creation, DB persistence, list/edit, partial clearing, niche changes, validation, legacy compatibility, permissions and tenant isolation');
 } finally {
  await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
 }
})().catch(error => { console.error(error); process.exitCode = 1; });
