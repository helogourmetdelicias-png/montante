const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, ...args) { return resolve.call(this, name.startsWith('@/') ? path.join(process.cwd(), 'src', name.slice(2)) : name, ...args); };
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
const { prisma } = require('../src/lib/prisma.ts');
const { financialSnapshot } = require('../src/lib/ai/snapshot.ts');
const { parsePeriod } = require('../src/lib/reports/period.ts');
(async () => {
  const ids = []; const marker = 'qa-ai-' + randomUUID().slice(0, 12);
  try {
    for (let i = 0; i < 2; i++) ids.push((await prisma.tenant.create({ data: { name: marker, slug: marker + '-' + i } })).id);
    for (const [index, tenantId] of ids.entries()) {
      const user = await prisma.user.create({ data: { tenant_id: tenantId, name: 'QA private owner', email: 'qa-ai@example.invalid', role: 'owner' } });
      const customer = await prisma.customer.create({ data: { tenant_id: tenantId, name: 'Private Customer', phone: '21999999999' } });
      const drawer = await prisma.cashRegisterSession.create({ data: { tenant_id: tenantId, user_id: user.id, initial_amount: 0 } });
      const amount = index ? 900 : 100;
      const sale = await prisma.sale.create({ data: { tenant_id: tenantId, sale_number: 1, status: 'completed', total_amount: amount, customer_id: customer.id, payment_method: 'fiado', is_quick_sale: true, sold_at: new Date('2026-10-21T03:00:00Z') } });
      await prisma.sale.create({ data: { tenant_id: tenantId, sale_number: 2, status: 'cancelled', total_amount: 999, sold_at: new Date('2026-10-21T12:00:00Z') } });
      await prisma.sale.create({ data: { tenant_id: tenantId, sale_number: 3, status: 'completed', total_amount: 999, sold_at: new Date('2026-10-21T02:59:59Z') } });
      const credit = await prisma.creditSale.create({ data: { tenant_id: tenantId, sale_id: sale.id, customer_id: customer.id, amount } });
      await prisma.creditPayment.create({ data: { tenant_id: tenantId, credit_sale_id: credit.id, user_id: user.id, session_id: drawer.id, amount: 40, method: 'CASH', idempotency_key: randomUUID(), created_at: new Date('2026-10-21T13:00:00Z') } });
      await prisma.cashRegisterMovement.create({ data: { tenant_id: tenantId, user_id: user.id, session_id: drawer.id, type: 'WITHDRAWAL', amount: 10, description: 'Private note', created_at: new Date('2026-10-21T13:00:00Z') } });
      await prisma.paymentAttempt.create({ data: { tenant_id: tenantId, sale_id: sale.id, provider: 'qa', method: 'PIX', channel: 'ONLINE', status: 'APPROVED', amount: 5, idempotency_key: randomUUID(), confirmed_at: new Date('2026-10-21T13:00:00Z') } });
    }
    const period = parsePeriod(new URL('https://qa.test?startDate=2026-10-21&endDate=2026-10-21'));
    const a = await financialSnapshot(ids[0], period), b = await financialSnapshot(ids[1], period);
    assert.equal(a.completedSales.count, 1); assert.equal(a.completedSales.revenue, '100.00');
    assert.equal(b.completedSales.revenue, '900.00');
    assert.equal(a.currentOutstandingCreditsAllTime.amount, '60.00'); assert.equal(b.currentOutstandingCreditsAllTime.amount, '860.00');
    assert.equal(a.creditSalesInPeriod.amount, '100.00'); assert.equal(a.creditReceiptsInPeriod[0].amount, '40.00');
    assert.deepEqual(a.creditReceiptTotalsInPeriod, { amount: '40.00', count: 1 });
    assert.equal(a.approvedPaymentsByConfirmationDate[0].amount, '5.00');
    assert.equal(a.cashMovementsInPeriod[0].amount, '10.00');
    const historical = await financialSnapshot(ids[0], parsePeriod(new URL('https://qa.test?startDate=2026-10-01&endDate=2026-10-02')));
    assert.equal(historical.completedSales.count, 0); assert.equal(historical.completedSales.revenue, '0.00');
    assert.equal(historical.currentOutstandingCreditsAllTime.amount, '60.00', 'debt is current across history regardless of date filter');
    for (const privateText of ['Private Customer', '21999999999', 'qa-ai@example.invalid', 'Private note', ids[0], ids[1]]) assert.ok(!JSON.stringify(a).includes(privateText));
    console.log('PASS AI real database: two isolated tenants, completed-only sales, Sao Paulo boundary, exact partial receipts/debt, current debt across periods, no personal data.');
  } finally {
    await prisma.creditPayment.deleteMany({ where: { tenant_id: { in: ids } } });
    await prisma.creditSale.deleteMany({ where: { tenant_id: { in: ids } } });
    await prisma.sale.deleteMany({ where: { tenant_id: { in: ids } } });
    await prisma.cashRegisterMovement.deleteMany({ where: { tenant_id: { in: ids } } });
    await prisma.cashRegisterSession.deleteMany({ where: { tenant_id: { in: ids } } });
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
