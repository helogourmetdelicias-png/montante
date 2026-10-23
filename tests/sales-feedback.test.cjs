const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { Prisma } = require('@prisma/client');

// Exercise the real API with isolated dependencies; never connect to the store database.
function load(file, dependencies = {}) {
  const filename = resolve(file);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = module.paths;
  const originalRequire = mod.require.bind(mod);
  mod.require = name => Object.hasOwn(dependencies, name) ? dependencies[name] : originalRequire(name);
  mod._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, filename);
  return mod.exports;
}

test('quick-sale notes and optional customer persist, preserve idempotency and stay tenant scoped', async () => {
  const customerId = 'cm123456789012345678901234';
  const saved = new Map();
  let sequence = 0;
  let stockWrites = 0;
  const db = {
    sale: {
      async findUnique({ where }) { return saved.get(where.tenant_id_idempotency_key.idempotency_key) ?? null; },
      async create({ data }) {
        const sale = { ...data, id: `sale-${sequence}`, items: [], created_at: new Date(), amount_received: null, change_amount: null };
        saved.set(data.idempotency_key, sale);
        return sale;
      },
    },
    customer: { async findFirst({ where }) {
      assert.equal(where.tenant_id, 'tenant-a');
      assert.equal(where.isActive, true);
      return where.id === customerId ? { id: customerId } : null;
    } },
    cashRegisterSession: { async findFirst({ where }) {
      assert.equal(where.tenant_id, 'tenant-a');
      assert.equal(where.user_id, 'operator-a');
      return { id: 'drawer-a', opened_at: new Date() };
    } },
    product: { async findMany({ where }) { assert.deepEqual(where.id.in, []); return []; }, async updateMany() { stockWrites++; return { count: 1 }; } },
    brandCommission: { async findMany() { return []; } },
    tenant: { async update() { return { sales_sequence: ++sequence }; } },
  };
  const route = load('src/app/api/sales/route.ts', {
    '@/auth': { auth: async () => ({ user: { tenantId: 'tenant-a', id: 'operator-a' } }) },
    '@/lib/cash-register/business-day': { isCurrentBusinessDay: () => true },
    '@/lib/brand-commission': { brandKey: value => value },
    '@/lib/database/transactions': { runSerializableTransaction: fn => fn(db) },
    '@/lib/prisma': { prisma: db },
    '@/lib/sales/reservations': { releaseExpiredSales: async () => 0 },
    '@/lib/validations/sale': load('src/lib/validations/sale.ts'),
  });
  const post = input => route.POST(new Request('http://localhost/api/sales', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
  }));
  const input = { idempotencyKey: randomUUID(), mode: 'quick', quickAmount: 25.90, customerId, notes: '  Entrega · orçamento 123  ' };
  const response = await post(input);
  assert.equal(response.status, 201);
  assert.equal((await response.json()).sale.customerId, customerId);
  const sale = saved.get(input.idempotencyKey);
  assert.equal(sale.notes, 'Entrega · orçamento 123');
  assert.equal(sale.total_amount.toFixed(2), '25.90');
  assert.equal(sale.cash_register_session_id, 'drawer-a');
  assert.equal(stockWrites, 0);
  assert.equal((await post(input)).status, 200);
  assert.equal((await post({ ...input, notes: 'Outra entrega' })).status, 409);
  assert.equal((await post({ ...input, idempotencyKey: randomUUID(), customerId: 'cm999456789012345678901234' })).status, 404);
  const anonymous = { idempotencyKey: randomUUID(), mode: 'quick', quickAmount: 10 };
  assert.equal((await post(anonymous)).status, 201);
  assert.equal(saved.get(anonymous.idempotencyKey).notes, null);
  assert.equal(saved.get(anonymous.idempotencyKey).customer_id, undefined);
  assert.equal(saved.get(anonymous.idempotencyKey).total_amount.equals(new Prisma.Decimal(10)), true);
});

test('customer history resolves asynchronous route parameters before a tenant-scoped lookup', async () => {
  let reads = 0;
  const route = load('src/app/api/customers/[id]/history/route.ts', {
    '@/lib/customers': { customerAccess: async () => ({ ok: true, tenantId: 'tenant-a' }) },
    '@/lib/reports/period': { parsePeriod: () => null },
    '@/lib/prisma': { prisma: { customer: { async findFirst({ where }) {
      reads++;
      assert.deepEqual(where, { id: 'customer-a', tenant_id: 'tenant-a' });
      return null;
    } } } },
  });
  const response = await route.GET(new Request('http://localhost/api/customers/customer-a/history'), {
    params: Promise.resolve({ id: 'customer-a' }),
  });
  assert.equal(reads, 1);
  assert.equal(response.status, 404);
});
