const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, ...args) { return resolve.call(this, name.startsWith('@/') ? path.join(process.cwd(), 'src', name.slice(2)) : name, ...args); };
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
let session = null;
require.cache[require.resolve('../src/auth.ts')] = { exports: { auth: async () => session } };
const { prisma } = require('../src/lib/prisma.ts');
const settings = require('../src/app/api/settings/payments/route.ts');
const diagnostic = require('../src/app/api/settings/payments/test/route.ts');
const { decryptCredentials } = require('../src/lib/encryption.ts');
const request = data => new Request('https://qa.invalid/api/settings/payments', { method: 'POST', body: JSON.stringify(data) });
(async () => {
  const tenants = [];
  const originalFetch = globalThis.fetch;
  try {
    for (let i = 0; i < 2; i++) tenants.push(await prisma.tenant.create({ data: { name: 'QA payment settings', slug: `qa-pay-${randomUUID()}` } }));
    assert.equal((await diagnostic.POST()).status, 401);
    session = { user: { tenantId: tenants[0].id, role: 'staff' } };
    assert.equal((await diagnostic.POST()).status, 403);
    session.user.role = 'owner';
    assert.equal((await diagnostic.POST()).status, 400);
    const input = { provider: 'pagarme', environment: 'sandbox', isActive: true, credentials: { api_key: 'sk_test_diagnostic' } };
    assert.equal((await settings.POST(request(input))).status, 200);
    const saved = await prisma.paymentGatewayConfig.findFirstOrThrow({ where: { tenant_id: tenants[0].id, provider: 'pagarme' } });
    for (const credentials of [{}, { api_key: '' }, undefined]) {
      assert.equal((await settings.POST(request({ ...input, displayName: 'Updated', credentials }))).status, 200);
      const after = await prisma.paymentGatewayConfig.findUniqueOrThrow({ where: { id: saved.id } });
      assert.equal(after.encrypted_credentials, saved.encrypted_credentials);
      assert.equal(decryptCredentials(after.encrypted_credentials).api_key, input.credentials.api_key);
    }
    globalThis.fetch = async (url, options) => {
      assert.equal(options.method, 'GET');
      assert.equal(options.headers.Authorization, `Basic ${Buffer.from('sk_test_diagnostic:').toString('base64')}`);
      return Response.json({ private: 'merchant-data' }, { status: 401 });
    };
    const result = await (await diagnostic.POST()).json();
    assert.equal(result.code, 'PROVIDER_UNAUTHORIZED');
    assert.equal(JSON.stringify(result).includes('merchant-data'), false);
    assert.equal(JSON.stringify(result).includes(input.credentials.api_key), false);
    session.user.tenantId = tenants[1].id;
    assert.equal((await diagnostic.POST()).status, 400, 'cannot use another tenant credential');
    session.user.tenantId = tenants[0].id;
    await prisma.paymentGatewayConfig.update({ where: { id: saved.id }, data: { encrypted_credentials: 'invalid-ciphertext' } });
    assert.equal((await diagnostic.POST()).status, 409);
    console.log('PASS saved key preservation, empty fields, diagnostic roles, tenant isolation, encryption failure and no secret disclosure');
  } finally {
    globalThis.fetch = originalFetch;
    await prisma.tenant.deleteMany({ where: { id: { in: tenants.map(t => t.id) } } });
    await prisma.$disconnect();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
