const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  return resolve.call(this, name.startsWith('@/') ? path.join(process.cwd(), 'src', name.slice(2)) : name, ...args);
};
require.extensions['.ts'] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);
};
const { prisma } = require('../src/lib/prisma.ts');
const { processTenantBilling, getBillingSummary } = require('../src/lib/billing-service.ts');
const { randomUUID } = require('node:crypto');

(async () => {
  const tenants = [];
  try {
    const anchor = new Date('2024-01-31T13:10:00Z');
    const endTrial = new Date('2024-04-30T13:10:00Z');
    for (let i = 0; i < 2; i++) {
      tenants.push(await prisma.tenant.create({ data: { name: 'QA billing', slug: `qa-billing-${randomUUID()}`, created_at: anchor } }));
    }
    const tenantId = tenants[0].id;
    const rows = Array.from({ length: 501 }, (_, i) => ({ tenant_id: tenantId, sale_number: i + 1, status: 'completed', total_amount: '1.00', sold_at: new Date('2024-04-10T12:00:00Z') }));
    rows.push({ tenant_id: tenantId, sale_number: 502, status: 'pending', total_amount: '1.00', sold_at: new Date('2024-04-10T12:00:00Z') });
    rows.push({ tenant_id: tenantId, sale_number: 503, status: 'cancelled', total_amount: '1.00', sold_at: new Date('2024-04-10T12:00:00Z') });
    rows.push({ tenant_id: tenantId, sale_number: 504, status: 'completed', total_amount: '1.00', sold_at: endTrial });
    rows.push({ tenant_id: tenants[1].id, sale_number: 1, status: 'completed', total_amount: '1.00', sold_at: new Date('2024-04-10T12:00:00Z') });
    await prisma.sale.createMany({ data: rows });
    assert.equal(await processTenantBilling(tenantId, new Date(endTrial.getTime() - 1)), 0);
    assert.equal(await prisma.billingRecord.count({ where: { tenant_id: tenantId } }), 0);
    await Promise.all([processTenantBilling(tenantId, endTrial), processTenantBilling(tenantId, endTrial)]);
    let records = await prisma.billingRecord.findMany({ where: { tenant_id: tenantId }, orderBy: { billing_start: 'asc' } });
    assert.equal(records.length, 1);
    assert.equal(records[0].total_sales, 501);
    assert.equal(records[0].amount_due.toString(), '79');
    assert.equal(records[0].billing_start.toISOString(), endTrial.toISOString());
    assert.equal(await processTenantBilling(tenantId, new Date('2024-05-31T13:10:00Z')), 1);
    records = await prisma.billingRecord.findMany({ where: { tenant_id: tenantId }, orderBy: { billing_start: 'asc' } });
    assert.equal(records[1].total_sales, 1);
    assert.equal(records[1].amount_due.toString(), '49.9');
    assert.equal((await getBillingSummary(tenantId, new Date('2024-06-01T00:00:00Z'))).status, 'OVERDUE');
    await prisma.billingRecord.updateMany({ where: { tenant_id: tenantId }, data: { status: 'paid', paid_at: new Date() } });
    await processTenantBilling(tenantId, new Date('2024-06-01T00:00:00Z'));
    assert.equal((await prisma.tenantSubscription.findUniqueOrThrow({ where: { tenant_id: tenantId } })).status, 'ACTIVE');
    assert.equal(await prisma.billingRecord.count({ where: { tenant_id: tenants[1].id } }), 0);
    // Exercise the actual route handlers with isolated auth and provider fixtures.
    let user = { tenantId, role: 'staff' };
    require.cache[require.resolve('../src/auth.ts')] = { exports: { auth: async () => ({ user }) } };
    const checkout = require('../src/app/api/billing/[id]/checkout/route.ts');
    const checkoutRequest = () => new Request('https://billing.example/api/billing/fixture/checkout', { method: 'POST' });
    assert.equal((await checkout.POST(checkoutRequest(), { params: { id: records[1].id } })).status, 403);
    user = { tenantId: tenants[1].id, role: 'owner' };
    assert.equal((await checkout.POST(checkoutRequest(), { params: { id: records[1].id } })).status, 404);
    const webhook = require('../src/app/api/webhooks/billing/route.ts');
    const oldSecret = process.env.SAAS_MERCADOPAGO_WEBHOOK_SECRET;
    const oldFetch = global.fetch;
    const secret = randomUUID();
    process.env.SAAS_MERCADOPAGO_WEBHOOK_SECRET = secret;
    const oldToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'fixture-not-a-real-token';
    try {
      const { createHmac } = require('node:crypto');
      const id = String(Date.now());
      const requestId = randomUUID();
      const signature = createHmac('sha256', secret).update(`id:${id};request-id:${requestId};ts:123;`).digest('hex');
      const request = (valid = true) => new Request(`https://billing.example/api/webhooks/billing?data.id=${id}&type=payment`, {
        method: 'POST', headers: { 'x-request-id': requestId, 'x-signature': valid ? `ts=123,v1=${signature}` : 'invalid' },
      });
      let amount = 79;
      global.fetch = async () => Response.json({ id, status: 'approved', external_reference: records[1].id, currency_id: 'BRL', transaction_amount: amount });
      await prisma.billingRecord.update({ where: { id: records[1].id }, data: { status: 'pending', paid_at: null } });
      assert.equal((await webhook.POST(request(false))).status, 401);
      assert.equal((await webhook.POST(request())).status, 200);
      assert.equal((await prisma.billingRecord.findUniqueOrThrow({ where: { id: records[1].id } })).status, 'pending');
      amount = 49.9;
      assert.equal((await webhook.POST(request())).status, 200);
      const paid = await prisma.billingRecord.findUniqueOrThrow({ where: { id: records[1].id } });
      assert.equal(paid.status, 'paid');
      assert.equal(paid.external_payment_id, id);
      assert.equal((await webhook.POST(request())).status, 200);
      assert.equal((await prisma.billingRecord.findUniqueOrThrow({ where: { id: records[1].id } })).paid_at.getTime(), paid.paid_at.getTime());
    } finally {
      global.fetch = oldFetch;
      if (oldSecret === undefined) delete process.env.SAAS_MERCADOPAGO_WEBHOOK_SECRET;
      else process.env.SAAS_MERCADOPAGO_WEBHOOK_SECRET = oldSecret;
      if (oldToken === undefined) delete process.env.MERCADO_PAGO_ACCESS_TOKEN;
      else process.env.MERCADO_PAGO_ACCESS_TOKEN = oldToken;
    }
    console.log('PASS: trial, 501 sales, statuses, boundaries, tenant isolation, concurrent replay, regression, overdue/recovery, checkout authorization and signed webhook reconciliation/replay.');
  } finally {
    for (const tenant of tenants) await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
