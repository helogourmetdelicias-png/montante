import assert from 'node:assert/strict';
import test from 'node:test';
import { businessDateKey, isCurrentBusinessDay } from '../src/lib/cash-register/business-day.ts';

test('cashier business date uses Sao Paulo midnight instead of UTC midnight', () => {
  const opened = new Date('2026-10-20T02:00:00Z');
  assert.equal(businessDateKey(opened), '2026-10-19');
  assert.equal(isCurrentBusinessDay(opened, new Date('2026-10-20T02:59:59Z')), true);
  assert.equal(isCurrentBusinessDay(opened, new Date('2026-10-20T03:00:00Z')), false);
  assert.equal(isCurrentBusinessDay(new Date('2026-10-20T03:00:00Z'), new Date('2026-10-20T23:00:00Z')), true);
  assert.equal(isCurrentBusinessDay(new Date('2026-10-21T03:00:00Z'), new Date('2026-10-20T23:00:00Z')), false);
});
