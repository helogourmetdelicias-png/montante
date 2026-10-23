import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createSaleSchema } from '../src/lib/validations/sale.ts';
import { parseMoneyDigits, parseMoneyDecimal, formatMoneyInput } from '../src/lib/money-input.ts';

test('bank-style entry shifts each typed digit into cents', () => {
  let value = '';
  const expected = ['0.01', '0.12', '1.23', '12.34'];
  for (const [index, digit] of [...'1234'].entries()) {
    value = parseMoneyDigits(formatMoneyInput(value) + digit);
    assert.equal(value, expected[index]);
  }
  assert.equal(formatMoneyInput(value), '12,34');
  value = parseMoneyDigits(formatMoneyInput(value).slice(0, -1));
  assert.equal(value, '1.23');
  assert.equal(parseMoneyDigits(''), '');
  assert.equal(parseMoneyDigits('R$ 1.234,56'), '1234.56');
  assert.equal(parseMoneyDigits('0000001'), '0.01');
  assert.equal(parseMoneyDigits('9999999999'), '99999999.99');
  assert.equal(parseMoneyDigits('10000000000'), null);
});

test('quick sale only requires a positive cent-precision value and idempotency key', () => {
  const valid = { idempotencyKey: randomUUID(), mode: 'quick', quickAmount: 12.34 };
  const parsed = createSaleSchema.parse(valid);
  assert.deepEqual(parsed.items, []);
  assert.equal(parsed.customerId, undefined);
  assert.equal(parsed.discountAmount, 0);
  for (const quickAmount of [undefined, 0, -1, Infinity, 0.001, 100000000]) {
    assert.equal(createSaleSchema.safeParse({ ...valid, quickAmount }).success, false);
  }
  for (const patch of [{ items: [{ productId: 'product', quantity: 1 }] }, { discountAmount: 1 }]) {
    assert.equal(createSaleSchema.safeParse({ ...valid, ...patch }).success, false);
  }
});

test('decimal entry accepts either separator without changing the cents mode', () => {
  for (const raw of ['12,34', '12.34']) assert.equal(parseMoneyDecimal(raw), '12.34');
  assert.equal(parseMoneyDecimal('12,'), '12.00');
  assert.equal(parseMoneyDecimal(',5'), '0.50');
  assert.equal(parseMoneyDecimal('1234'), '1234.00');
  assert.equal(parseMoneyDigits('1234'), '12.34');
  assert.equal(parseMoneyDecimal(''), '');
  assert.equal(parseMoneyDecimal('99999999.99'), '99999999.99');
  for (const raw of ['12.345', '-10', '1e3', '100000000', '1,2,3', 'abc']) assert.equal(parseMoneyDecimal(raw), null);
});

test('optional quick-sale identification reuses customer and notes without requiring either', () => {
  const input = { idempotencyKey: randomUUID(), mode: 'quick', quickAmount: 25.90,
    customerId: 'cm123456789012345678901234', notes: '  Frete · Orçamento 123  ' };
  const parsed = createSaleSchema.parse(input);
  assert.equal(parsed.notes, 'Frete · Orçamento 123');
  assert.equal(parsed.customerId, input.customerId);
  assert.deepEqual(parsed.items, []);
  assert.equal(createSaleSchema.safeParse({ ...input, notes: 'x'.repeat(1001) }).success, false);
  assert.equal(createSaleSchema.safeParse({ ...input, customerId: 'invalid' }).success, false);
});

test('legacy advanced sales keep product validation and reject mixed amounts', () => {
  const valid = { idempotencyKey: randomUUID(), items: [{ productId: 'product', quantity: 1 }] };
  assert.equal(createSaleSchema.parse(valid).mode, 'advanced');
  assert.equal(createSaleSchema.safeParse({ ...valid, items: [] }).success, false);
  assert.equal(createSaleSchema.safeParse({ ...valid, quickAmount: 12.34 }).success, false);
});
