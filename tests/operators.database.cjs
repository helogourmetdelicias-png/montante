const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');
const bcrypt = require('bcryptjs');
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
const route = require('../src/app/api/operators/route.ts');
const { verifyOperatorPin } = require('../src/lib/operators.ts');
const request = data => new Request('https://qa.invalid/api/operators', { method: 'POST', body: JSON.stringify(data) });

(async () => {
  const tenants = [];
  try {
    for (let i = 0; i < 2; i++) tenants.push(await prisma.tenant.create({ data: { name: 'QA operators', slug: `qa-operators-${randomUUID()}` } }));
    const owner = await prisma.user.create({ data: { tenant_id: tenants[0].id, name: 'QA owner', email: 'owner@example.invalid', password_hash: await bcrypt.hash('OwnerPassword123', 4), role: 'owner' } });
    const data = { name: 'QA Operator', email: 'OPERATOR@example.invalid', password: 'OperatorPassword123', pin: '123456', role: 'owner', tenant_id: tenants[1].id };
    assert.equal((await route.GET()).status, 401);
    assert.equal((await route.POST(request(data))).status, 401);
    session = { user: { id: owner.id, tenantId: tenants[0].id, role: 'owner' } };
    assert.equal((await route.POST(request({ ...data, pin: '123' }))).status, 400);
    assert.equal((await route.POST(request(data))).status, 201);
    const operator = await prisma.user.findFirstOrThrow({ where: { tenant_id: tenants[0].id, email: 'operator@example.invalid' } });
    assert.equal(operator.role, 'staff');
    assert.notEqual(operator.pin_hash, data.pin);
    assert.ok(await bcrypt.compare(data.password, operator.password_hash));
    assert.equal((await route.POST(request(data))).status, 409);
    assert.equal(await verifyOperatorPin(tenants[1].id, operator.id, data.pin), null);
    for (let i = 0; i < 5; i++) assert.equal(await verifyOperatorPin(tenants[0].id, operator.id, '999999'), null);
    assert.equal(await verifyOperatorPin(tenants[0].id, operator.id, data.pin), null, 'correct PIN must remain blocked during lockout');
    await prisma.user.update({ where: { id: operator.id }, data: { pin_locked_until: new Date(Date.now() - 1000) } });
    assert.equal((await verifyOperatorPin(tenants[0].id, operator.id, data.pin)).id, operator.id);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: operator.id } })).pin_failures, 0);
    session = { user: { id: operator.id, tenantId: tenants[0].id, role: 'staff' } };
    assert.equal((await route.POST(request({ ...data, email: 'other@example.invalid' }))).status, 403);
    assert.equal((await route.PATCH(request({ action: 'status', userId: owner.id, active: false }))).status, 403);
    const listing = await (await route.GET()).json();
    assert.ok(listing.users.every(user => !('email' in user) && !('pin_hash' in user) && !('password_hash' in user)));
    assert.equal((await route.PATCH(request({ action: 'my-pin', password: 'wrong', pin: '654321' }))).status, 400);
    assert.equal((await route.PATCH(request({ action: 'my-pin', password: 'wrongpassword', pin: '654321' }))).status, 403);
    assert.equal((await route.PATCH(request({ action: 'my-pin', password: data.password, pin: '654321' }))).status, 200);
    assert.equal(await verifyOperatorPin(tenants[0].id, operator.id, data.pin), null);
    assert.ok(await verifyOperatorPin(tenants[0].id, operator.id, '654321'));
    session = { user: { id: owner.id, tenantId: tenants[1].id, role: 'owner' } };
    assert.equal((await route.PATCH(request({ action: 'status', userId: operator.id, active: false }))).status, 404);
    session = { user: { id: owner.id, tenantId: tenants[0].id, role: 'owner' } };
    assert.equal((await route.PATCH(request({ action: 'status', userId: owner.id, active: false }))).status, 404);
    assert.equal((await route.PATCH(request({ action: 'credentials', userId: operator.id, password: 'NewPassword123', pin: '112233' }))).status, 200);
    assert.ok(await verifyOperatorPin(tenants[0].id, operator.id, '112233'));
    assert.equal((await route.PATCH(request({ action: 'status', userId: operator.id, active: false }))).status, 200);
    assert.equal(await verifyOperatorPin(tenants[0].id, operator.id, '112233'), null);
    assert.equal((await route.PATCH(request({ action: 'status', userId: operator.id, active: true }))).status, 200);
    assert.ok(await verifyOperatorPin(tenants[0].id, operator.id, '112233'));
    console.log('PASS operator creation, credentials, roles, tenant isolation, PIN lockout, reset and deactivation');
  } finally {
    for (const tenant of tenants) await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
