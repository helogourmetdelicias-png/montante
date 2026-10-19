import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { PaymentAttemptStatus } from '@prisma/client';
import { isValidMercadoPagoWebhookSignature } from '../src/lib/payment/mercadopago-webhook.ts';
import { applyPaymentResult } from '../src/lib/sales/payment-result.ts';

const secret = 'webhook-test-secret';
const requestId = 'request-test-123';
const timestamp = '1781740800';
const orderId = 'ORD01TESTORDER123';

function createSignature(dataId, signingSecret = secret) {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${timestamp};`;
  const digest = createHmac('sha256', signingSecret).update(manifest).digest('hex');
  return `ts=${timestamp},v1=${digest}`;
}

test('Mercado Pago webhook signature validates the documented Order manifest', () => {
  assert.equal(isValidMercadoPagoWebhookSignature({
    signature: createSignature(orderId), requestId, dataId: orderId, secret,
  }), true);
  assert.equal(isValidMercadoPagoWebhookSignature({
    signature: createSignature(orderId), requestId, dataId: orderId.toLowerCase(), secret,
  }), true);
});

test('webhook signature rejects missing, altered, malformed, and wrong-secret headers', () => {
  const signature = createSignature(orderId);
  const cases = [
    { signature: null, requestId, dataId: orderId, secret },
    { signature: 'ts=1,v1=bad', requestId, dataId: orderId, secret },
    { signature, requestId: null, dataId: orderId, secret },
    { signature, requestId, dataId: 'different-order', secret },
    { signature, requestId, dataId: orderId, secret: 'wrong-secret' },
  ];

  for (const input of cases) assert.equal(isValidMercadoPagoWebhookSignature(input), false);
});

test('replayed Pix approval completes a sale only once and preserves the approved attempt', async () => {
  const state = { attemptStatus: PaymentAttemptStatus.PENDING, saleStatus: 'pending', completionWrites: 0 };
  const transaction = {
    paymentAttempt: {
      update: async ({ data }) => {
        state.attemptStatus = data.status;
        return { id: 'attempt-1', status: state.attemptStatus };
      },
      aggregate: async () => ({ _sum: { amount: { greaterThanOrEqualTo: () => true } } }),
      findFirst: async () => null,
    },
    sale: {
      findFirst: async ({ where }) => where.status === 'pending' && state.saleStatus === 'pending'
        ? { total_amount: { toString: () => '10.00' } }
        : null,
      updateMany: async ({ where, data }) => {
        if (where.status !== state.saleStatus) return { count: 0 };
        state.saleStatus = data.status;
        state.completionWrites += 1;
        return { count: 1 };
      },
    },
  };

  const input = {
    tenantId: 'tenant-1', saleId: 'sale-1', attemptId: 'attempt-1', method: 'pix',
    result: { status: 'approved', externalId: orderId },
  };
  const first = await applyPaymentResult(transaction, input);
  const duplicate = await applyPaymentResult(transaction, input);

  assert.equal(first.attempt.status, PaymentAttemptStatus.APPROVED);
  assert.equal(first.saleCompleted, true);
  assert.equal(duplicate.attempt.status, PaymentAttemptStatus.APPROVED);
  assert.equal(duplicate.saleCompleted, false);
  assert.equal(state.saleStatus, 'completed');
  assert.equal(state.completionWrites, 1);
});
