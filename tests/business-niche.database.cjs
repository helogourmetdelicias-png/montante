const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');
const ExcelJS = require('exceljs');
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
const route = require('../src/app/api/settings/tenant/route.ts');
const register = require('../src/app/api/auth/register/route.ts');
const { exportCatalog } = require('../src/lib/catalog-excel-route.ts');
const { BUSINESS_NICHES, getNicheCategories } = require('../src/lib/business-niche.ts');
const { registerSchema } = require('../src/lib/validations/auth.ts');
const request = data => new Request('https://qa.invalid/api/settings/tenant', { method: 'PATCH', body: JSON.stringify(data) });

(async () => {
  const ids = [];
  const registrationSlugs = [];
  try {
    for (let i = 0; i < 2; i++) ids.push((await prisma.tenant.create({ data: { name: 'QA niche', slug: `qa-niche-${randomUUID()}` } })).id);
    assert.equal((await prisma.tenant.findUniqueOrThrow({ where: { id: ids[0] } })).niche, null, 'existing/legacy tenants have no inferred niche');
    assert.equal((await route.PATCH(request({ niche: 'COSMETICS' }))).status, 401);
    session = { user: { tenantId: ids[0], role: 'staff' } };
    assert.equal((await route.PATCH(request({ niche: 'COSMETICS' }))).status, 403);
    session.user.role = 'owner';
    for (const niche of [null, '', 'INVALID', 'cosmetics', 5]) assert.equal((await route.PATCH(request({ niche }))).status, 400);
    assert.equal((await route.PATCH(request({ niche: 'COSMETICS', tenantId: ids[1] }))).status, 400, 'reject tenant override');
    assert.equal((await route.PATCH(new Request('https://qa.invalid', { method: 'PATCH', body: '{' }))).status, 400);
    const product = await prisma.product.create({ data: { tenant_id: ids[0], name: 'QA existing', category: 'Minha categoria própria', price: '10', unit_of_measure: 'un', stock_quantity: '3' } });
    for (const [index, niche] of BUSINESS_NICHES.entries()) {
      session.user.role = index % 2 ? 'admin' : 'owner';
      const response = await route.PATCH(request({ niche }));
      assert.equal(response.status, 200);
      assert.equal((await response.json()).niche, niche);
      assert.equal((await prisma.tenant.findUniqueOrThrow({ where: { id: ids[0] } })).niche, niche);
      assert.equal((await prisma.tenant.findUniqueOrThrow({ where: { id: ids[1] } })).niche, null);
      const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      assert.equal(after.category, 'Minha categoria própria');
      assert.equal(after.stock_quantity.toString(), '3');
      const exportResponse = await exportCatalog(new Request('https://qa.invalid/api/products/excel?template=true'), 'products');
      assert.equal(exportResponse.status, 200);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(Buffer.from(await exportResponse.arrayBuffer()));
      const names = [];
      workbook.getWorksheet('Categorias').eachRow((row, rowNumber) => { if (rowNumber > 1) names.push(row.getCell(1).value); });
      assert.deepEqual(names, [...getNicheCategories(niche)], 'Excel suggestions follow the tenant niche');
      const slug = `qa-niche-${randomUUID()}`;
      registrationSlugs.push(slug);
      const input = { name: 'QA owner', email: 'qa@example.invalid', password: 'QaPassword123', confirmPassword: 'QaPassword123', tenantName: 'QA niche registration', tenantSlug: slug, niche };
      assert.equal((await register.POST(request(input))).status, 201);
      assert.equal((await prisma.tenant.findUniqueOrThrow({ where: { slug } })).niche, niche);
    }
    const base = { name: 'QA owner', email: 'qa@example.invalid', password: 'QaPassword123', confirmPassword: 'QaPassword123', tenantName: 'QA legacy', tenantSlug: 'qa-legacy-compatible' };
    assert.ok(registerSchema.safeParse(base).success, 'old registration clients remain compatible and receive onboarding');
    assert.equal((await register.POST(request({ ...base, niche: 'INVALID' }))).status, 400);
    session.user.tenantId = 'missing-tenant';
    assert.equal((await route.PATCH(request({ niche: 'OTHER' }))).status, 404);
    console.log('PASS 5 niches, owner/admin permissions, tenant isolation, invalid inputs, preserved products, registration and Excel suggestions');
  } finally {
    await prisma.tenant.deleteMany({ where: { OR: [{ id: { in: ids } }, { slug: { in: registrationSlugs } }] } });
    await prisma.$disconnect();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
