import assert from 'node:assert/strict';
import test from 'node:test';
import { PagarMeGateway } from '../src/lib/payment/gateway-adapter.ts';
import { createPaymentAttemptSchema } from '../src/lib/validations/payment-attempt.ts';

const request = {
  amount: 1250,
  method: 'pix',
  channel: 'online',
  idempotencyKey: 'order-idempotency-key',
  description: 'Venda de teste',
  customerName: 'Cliente de Teste',
  customerEmail: 'cliente@example.com',
  customerDocument: '123.456.789-01',
  customerPhone: '(11) 91234-5678',
};

test('Pagar.me trims pasted key whitespace and explains authentication rejection', async () => {
  const originalFetch = globalThis.fetch;
  let authorization;
  globalThis.fetch = async (_url, options) => {
    authorization = options.headers.Authorization;
    return Response.json({ message: 'Authorization has been denied for this request.' }, { status: 401 });
  };
  try {
    await assert.rejects(new PagarMeGateway('  sk_test_example\n').charge(request), /recusou a chave de API \(401\)/);
    assert.equal(authorization, `Basic ${Buffer.from('sk_test_example:').toString('base64')}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('payment input accepts the four Pix buyer fields without an address', () => {
  assert.equal(createPaymentAttemptSchema.safeParse({
    idempotencyKey: '8a9bc08e-2bdc-4a5e-a92e-5efdc112f9c1',
    provider: 'pagarme', method: 'pix', channel: 'online',
    customerName: request.customerName,
    customerEmail: request.customerEmail,
    customerDocument: request.customerDocument,
    customerPhone: request.customerPhone,
  }).success, true);
});

test('payment input still requires a phone number for Pix Pagar.me', () => {
  assert.equal(createPaymentAttemptSchema.safeParse({
    idempotencyKey: '8a9bc08e-2bdc-4a5e-a92e-5efdc112f9c1',
    provider: 'pagarme', method: 'pix', channel: 'online',
    customerName: request.customerName,
    customerEmail: request.customerEmail,
    customerDocument: request.customerDocument,
  }).success, false);
});

test('Pagar.me Pix creates an order with only the documented required buyer data', async () => {
  const originalFetch = globalThis.fetch;
  let sentBody;
  globalThis.fetch = async (_url, options) => {
    sentBody = JSON.parse(options.body);
    return Response.json({
      id: 'or_test_order',
      charges: [{ last_transaction: { qr_code: 'pix-copy-paste', status: 'waiting_payment' } }],
    });
  };

  try {
    const result = await new PagarMeGateway('sk_test_example').charge(request);
    assert.equal(result.status, 'pending');
    assert.equal(result.pixCopyPaste, 'pix-copy-paste');
    assert.deepEqual(Object.keys(sentBody.customer).sort(), ['document', 'email', 'name', 'phones', 'type']);
    assert.deepEqual(sentBody.customer.phones.mobile_phone, {
      country_code: '55', area_code: '11', number: '912345678',
    });
    assert.equal(sentBody.customer.document, '12345678901');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Pagar.me Pix includes a complete address only when the account needs it', async () => {
  const originalFetch = globalThis.fetch;
  let sentBody;
  globalThis.fetch = async (_url, options) => {
    sentBody = JSON.parse(options.body);
    return Response.json({ id: 'or_test_order', last_transaction: { qr_code: 'pix-copy-paste' } });
  };

  try {
    await new PagarMeGateway('sk_test_example').charge({
      ...request,
      customerAddress: { zipCode: '01001000', street: 'Praça da Sé', number: '1', neighborhood: 'Sé', city: 'São Paulo', state: 'SP' },
    });
    assert.deepEqual(sentBody.customer.address, {
      country: 'BR', zip_code: '01001000', line_1: '1, Praça da Sé, Sé', city: 'São Paulo', state: 'SP',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Pagar.me API validation details are surfaced when a Pix order is rejected', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ errors: { 'customer.address': ['address is required for this account'] } }, { status: 400 });

  try {
    await assert.rejects(
      new PagarMeGateway('sk_test_example').charge(request),
      /Pagar\.me retornou erro 400 \(address is required for this account\)/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Pagar.me surfaces a transaction refusal even when order creation returns HTTP 200', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    id: 'or_failed', status: 'failed', charges: [{ last_transaction: {
      status: 'failed', gateway_response: { errors: [{ message: 'Pix is not enabled for this account' }] },
    } }],
  });
  try {
    await assert.rejects(new PagarMeGateway('sk_test_example').charge(request), /Pix is not enabled for this account/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Pagar.me gives an actionable error when the order has no Pix or refusal detail', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ id: 'or_no_pix', charges: [] });
  try {
    await assert.rejects(new PagarMeGateway('sk_test_example').charge(request), /Confira se o Pix está habilitado/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
