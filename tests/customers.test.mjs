import assert from 'node:assert/strict';
import test from 'node:test';
import { createCustomerSchema, updateCustomerSchema } from '../src/lib/validations/customer.ts';

test('customer registration only requires a name and normalizes optional buyer data', () => {
  const minimal = createCustomerSchema.parse({ name: ' Cliente teste ' });
  assert.equal(minimal.name, 'Cliente teste');
  assert.equal(minimal.document, null);
  assert.equal(minimal.isActive, true);
  const full = createCustomerSchema.parse({ name: 'Cliente teste', document: '123.456.789-01', phone: '+55 (11) 91234-5678', zipCode: '01001-000', state: 'sp' });
  assert.equal(full.document, '12345678901');
  assert.equal(full.phone, '11912345678');
  assert.equal(full.zipCode, '01001000');
  assert.equal(full.state, 'SP');
});

test('invalid optional data is rejected rather than silently discarded', () => {
  for (const field of ['document', 'phone', 'zipCode', 'email', 'state']) {
    assert.equal(createCustomerSchema.safeParse({ name: 'Cliente teste', [field]: 'abc' }).success, false, field);
  }
});

test('customer partial editing leaves unspecified data untouched and rejects empty changes', () => {
  assert.deepEqual(updateCustomerSchema.parse({ name: 'Novo nome' }), { name: 'Novo nome' });
  assert.equal(updateCustomerSchema.safeParse({}).success, false);
  assert.deepEqual(updateCustomerSchema.parse({ email: '' }), { email: null });
});
