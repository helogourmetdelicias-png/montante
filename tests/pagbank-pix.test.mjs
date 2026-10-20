import assert from 'node:assert/strict';
import test from 'node:test';
import { PagBankGateway, PagBankUncertainError } from '../src/lib/payment/gateway-adapter.ts';
import { createPaymentAttemptSchema } from '../src/lib/validations/payment-attempt.ts';

const input = { amount: 1250, method: 'pix', channel: 'online', idempotencyKey: 'ed71643d-32b8-4c9e-969a-4e071790bc37', description: 'Venda QA', customerName: 'Cliente QA', customerEmail: 'qa@example.invalid', customerDocument: '123.456.789-09' };
const order = (status = 'WAITING', amount = 1250) => ({ id: 'ORDE_QA', charges: [{ status, payment_method: { type: 'PIX' }, amount: { value: amount, currency: 'BRL', summary: { paid: status === 'PAID' ? amount : 0, refunded: 0 } }, qr_code: { text: 'pix-copy-paste' }, links: [{ rel: 'QRCODE.PNG', href: 'https://sandbox.api.pagseguro.com/qrcode/QRCO_QA/png' }] }] });

test('PagBank sends Pix charge, cents, buyer and idempotency to the selected environment', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://sandbox.api.pagseguro.com/orders');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer QA_TOKEN');
    assert.equal(options.headers['x-idempotency-key'], input.idempotencyKey);
    const body = JSON.parse(options.body);
    assert.equal(body.charges[0].amount.value, 1250);
    assert.equal(body.charges[0].payment_method.type, 'PIX');
    assert.equal(body.customer.tax_id, '12345678909');
    assert.ok(new Date(body.charges[0].payment_method.pix.expiration_date) > new Date());
    assert.equal(body.customer.address, undefined);
    return Response.json(order());
  };
  try {
    const result = await new PagBankGateway(' QA_TOKEN ', 'sandbox').charge(input);
    assert.equal(result.status, 'pending'); assert.equal(result.pixCopyPaste, 'pix-copy-paste');
    assert.ok(result.pixQrCodeUrl.endsWith('/png'));
    globalThis.fetch = async url => { assert.equal(url, 'https://api.pagseguro.com/orders/ORDE_QA'); return Response.json(order('PAID')); };
    assert.equal(await new PagBankGateway('QA_TOKEN', 'production').checkStatus('ORDE_QA', 1250), 'approved');
  } finally { globalThis.fetch = original; }
});

test('PagBank only approves PAID with matching order, Pix, BRL and amount', async () => {
  const original = globalThis.fetch;
  const gateway = new PagBankGateway('QA_TOKEN');
  try {
    for (const [status, expected] of [['PAID','approved'], ['WAITING','pending'], ['AUTHORIZED','pending'], ['IN_ANALYSIS','pending'], ['DECLINED','declined'], ['CANCELED','cancelled']]) {
      globalThis.fetch = async () => Response.json(order(status));
      assert.equal(await gateway.checkStatus('ORDE_QA', 1250), expected);
    }
    for (const data of [{ ...order('PAID'), id: 'ORDE_OTHER' }, order('PAID', 100), { ...order('PAID'), charges: [] }]) {
      globalThis.fetch = async () => Response.json(data);
      await assert.rejects(gateway.checkStatus('ORDE_QA', 1250));
    }
    const refunded = order('PAID'); refunded.charges[0].amount.summary.refunded = 100;
    globalThis.fetch = async () => Response.json(refunded);
    await assert.rejects(gateway.checkStatus('ORDE_QA', 1250));
  } finally { globalThis.fetch = original; }
});

test('PagBank never locally cancels a payable Pix or refunds money', async () => {
  const original = globalThis.fetch;
  try {
    for (const [status, expected] of [['WAITING','pending'], ['PAID','approved'], ['CANCELED','cancelled'], ['DECLINED','cancelled']]) {
      globalThis.fetch = async (_url, options) => { assert.equal(options.method, undefined); return Response.json(order(status)); };
      assert.equal(await new PagBankGateway('QA_TOKEN').cancelOrder('ORDE_QA', 1250), expected);
    }
  } finally { globalThis.fetch = original; }
});

test('PagBank ambiguous responses remain pending for reconciliation and errors do not leak provider payloads', async () => {
  const original = globalThis.fetch;
  try {
    for (const status of [401, 403, 400]) {
      globalThis.fetch = async () => Response.json({ private: 'NEVER_RETURN_THIS' }, { status });
      await assert.rejects(new PagBankGateway('QA_TOKEN').charge(input), error => !error.message.includes('NEVER_RETURN_THIS') && error.message.includes(String(status)));
    }
    for (const response of [Response.json({}, { status: 500 }), Response.json({ id: 'ORDE_QA', charges: [] }), new Response('invalid json')]) {
      globalThis.fetch = async () => response;
      await assert.rejects(new PagBankGateway('QA_TOKEN').charge(input), PagBankUncertainError);
    }
    globalThis.fetch = async () => { throw new Error('network private'); };
    await assert.rejects(new PagBankGateway('QA_TOKEN').charge(input), PagBankUncertainError);
  } finally { globalThis.fetch = original; }
});

test('PagBank input requires buyer identity and rejects unsupported cards before network access', async () => {
  const payment = { ...input, provider: 'pagbank' };
  assert.ok(createPaymentAttemptSchema.safeParse(payment).success);
  assert.equal(createPaymentAttemptSchema.safeParse({ ...payment, customerDocument: undefined }).success, false);
  await assert.rejects(new PagBankGateway('QA_TOKEN').charge({ ...input, method: 'credit_card' }));
  await assert.rejects(new PagBankGateway('QA_TOKEN').charge({ ...input, amount: 1.5 }));
});
