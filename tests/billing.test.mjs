import test from 'node:test';
import assert from 'node:assert/strict';
import { addBillingMonths, billingCycle, calculateBillingTier, completedSalesWhere } from '../src/lib/billing.ts';
import { matchesBillingPayment } from '../src/lib/billing-payment.ts';

test('billing prices include 500 in standard and regress automatically', () => {
  for (const count of [0, 499, 500, 501, 900, 499]) {
    assert.equal(calculateBillingTier(count).amount, count > 500 ? '79.00' : '49.90');
  }
  assert.throws(() => calculateBillingTier(-1));
});
test('trial lasts three calendar months and anniversaries never drift', () => {
  const anchor = new Date('2024-01-31T13:10:00Z');
  assert.equal(addBillingMonths(anchor, 1).toISOString(), '2024-02-29T13:10:00.000Z');
  assert.equal(addBillingMonths(anchor, 2).toISOString(), '2024-03-31T13:10:00.000Z');
  assert.equal(addBillingMonths(anchor, 3).toISOString(), '2024-04-30T13:10:00.000Z');
  assert.equal(billingCycle(anchor, new Date('2024-04-30T13:09:59Z')).index, 2);
  assert.equal(billingCycle(anchor, addBillingMonths(anchor, 3)).index, 3);
});
test('sales count scopes tenant, completed status and half-open interval', () => {
  const start = new Date('2026-01-20T12:00:00Z'), end = new Date('2026-02-20T12:00:00Z');
  assert.deepEqual(completedSalesWhere('tenant-a', start, end), {
    tenant_id: 'tenant-a', status: 'completed', sold_at: { gte: start, lt: end },
  });
});
test('payment needs approval, invoice reference, BRL and matching amount', () => {
  const invoice = { id: 'invoice-a', amount_due: '49.90' };
  const payment = { status: 'approved', currency_id: 'BRL', transaction_amount: 49.9, external_reference: 'invoice-a' };
  assert.equal(matchesBillingPayment(payment, invoice), true);
  for (const patch of [{ status: 'pending' }, { currency_id: 'USD' }, { transaction_amount: 79 }, { external_reference: 'invoice-b' }]) {
    assert.equal(matchesBillingPayment({ ...payment, ...patch }, invoice), false);
  }
});
