import assert from 'node:assert/strict';
import test from 'node:test';
import { expectedDrawerAmount, getCashRegisterSummary } from '../src/lib/cash-register/summary.ts';
import { Prisma } from '@prisma/client';

test('drawer expected total includes float, approved cash, supply, and withdrawal once', async () => {
  const db = {
    creditPayment: { async aggregate({ where }) { assert.equal(where.tenant_id, 'tenant-a'); assert.equal(where.session_id, 'register-a'); assert.equal(where.method, 'CASH'); return { _sum: { amount: new Prisma.Decimal('7.00') } }; } },
    paymentAttempt: {
      async aggregate({ where }) {
        assert.equal(where.tenant_id, 'tenant-a');
        assert.equal(where.sale.is.cash_register_session_id, 'register-a');
        assert.equal(where.status, 'APPROVED');
        return { _sum: { amount: new Prisma.Decimal('30.00') } };
      },
    },
    cashRegisterMovement: {
      async groupBy({ where }) {
        assert.equal(where.tenant_id, 'tenant-a');
        assert.equal(where.session_id, 'register-a');
        return [
          { type: 'SUPPLY', _sum: { amount: new Prisma.Decimal('10.00') } },
          { type: 'WITHDRAWAL', _sum: { amount: new Prisma.Decimal('4.50') } },
        ];
      },
    },
  };
  const summary = await getCashRegisterSummary(db, 'tenant-a', 'register-a');
  assert.equal(expectedDrawerAmount(new Prisma.Decimal('20.00'), summary).toFixed(2), '62.50');
});

test('empty cash activity does not lose initial float', async () => {
  const db = {
    creditPayment: { async aggregate() { return { _sum: { amount: null } }; } },
    paymentAttempt: { async aggregate() { return { _sum: { amount: null } }; } },
    cashRegisterMovement: { async groupBy() { return []; } },
  };
  const summary = await getCashRegisterSummary(db, 'tenant-b', 'register-b');
  assert.equal(expectedDrawerAmount(new Prisma.Decimal('100.00'), summary).toFixed(2), '100.00');
});
