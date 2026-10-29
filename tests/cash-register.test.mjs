import assert from 'node:assert/strict';
import test from 'node:test';
import { expectedDrawerAmount, getCashRegisterSummary } from '../src/lib/cash-register/summary.ts';
import { Prisma } from '@prisma/client';
import { getClosingIssues } from '../src/lib/cash-register/pending.ts';

test('cancelled manual attempts do not block closing but unresolved gateway charges do', async () => {
  const sale = (id, status, providers) => ({ id, sale_number: Number(id), status,
    total_amount: new Prisma.Decimal('10'), payment_attempts: providers.map(provider => ({ provider })) });
  const db = { sale: { async findMany({ where }) {
    assert.equal(where.tenant_id, 'tenant-a');
    assert.deepEqual(where.AND[0].OR, [
      { cash_register_session_id: 'register-a' },
      { payment_attempts: { some: { cash_session_id: 'register-a', status: 'APPROVED' } } },
    ]);
    return [
      sale('1', 'cancelled', ['pix_manual']),
      sale('2', 'cancelled', ['external_terminal']),
      sale('3', 'pending', []),
      sale('4', 'cancelled', ['mercadopago']),
      sale('5', 'cancelled', ['pagbank']),
      sale('6', 'cancelled', ['pagarme']),
      sale('7', 'completed', ['pix_manual']),
      sale('8', 'cancelled', ['unknown_provider']),
      sale('9', 'pending', ['pix_manual']),
    ];
  } } };
  const issues = await getClosingIssues(db, 'tenant-a', 'register-a');
  assert.deepEqual(issues.map(issue => issue.id), ['3', '4', '5', '6', '7', '8', '9']);
  assert.equal(issues[0].pendingSale, true);
  assert.equal(issues[0].pendingCharges, 0);
  assert.equal(issues[1].pendingSale, false);
  assert.equal(issues[1].pendingCharges, 1);
});

test('a drawer with only abandoned manual charges can close', async () => {
  const db = { sale: { async findMany() { return [{ id: 'old', sale_number: 1,
    status: 'cancelled', total_amount: new Prisma.Decimal('567.20'),
    payment_attempts: [{ provider: 'pix_manual' }] }]; } } };
  assert.deepEqual(await getClosingIssues(db, 'tenant-a', 'register-a'), []);
});

test('drawer expected total includes float, approved cash, supply, and withdrawal once', async () => {
  const db = {
    creditPayment: { async aggregate({ where }) { assert.equal(where.tenant_id, 'tenant-a'); assert.equal(where.session_id, 'register-a'); assert.equal(where.method, 'CASH'); return { _sum: { amount: new Prisma.Decimal('7.00') } }; } },
    paymentAttempt: {
      async aggregate({ where }) {
        assert.equal(where.tenant_id, 'tenant-a');
        assert.deepEqual(where.OR, [
          { cash_session_id: 'register-a' },
          { cash_session_id: null, sale: { is: { cash_register_session_id: 'register-a', tenant_id: 'tenant-a' } } },
        ]);
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
