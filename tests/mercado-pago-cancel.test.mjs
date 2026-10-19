import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Transpila o adapter no teste para suportar recursos TypeScript sem alterar a implementação.
const adapterSource = await readFile(new URL('../src/lib/payment/gateway-adapter.ts', import.meta.url), 'utf8');
const adapterJavaScript = ts.transpile(adapterSource, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext });
const adapterModuleUrl = `data:text/javascript;base64,${Buffer.from(adapterJavaScript).toString('base64')}`;
const { MercadoPagoGateway } = await import(adapterModuleUrl);

const originalFetch = globalThis.fetch;

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('cancels an eligible order with authorization and an idempotency key', async () => {
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return jsonResponse(200, { id: 'order-123', status: 'canceled' });
  };

  try {
    const gateway = new MercadoPagoGateway('test-token');
    assert.equal(await gateway.cancelOrder('order-123'), 'cancelled');
    assert.equal(request.url, 'https://api.mercadopago.com/v1/orders/order-123/cancel');
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.headers.Authorization, 'Bearer test-token');
    assert.match(request.options.headers['X-Idempotency-Key'], /^[0-9a-f-]{36}$/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('reconciles a cancel conflict with the current provider status', async () => {
  for (const [providerStatus, expected] of [['canceled', 'cancelled'], ['processed', 'approved'], ['action_required', 'pending']]) {
    let requests = 0;
    globalThis.fetch = async (_url, options) => {
      requests += 1;
      return options.method === 'POST'
        ? jsonResponse(409, { error: 'cannot_cancel_order' })
        : jsonResponse(200, { status: providerStatus, transactions: { payments: [] } });
    };

    try {
      const gateway = new MercadoPagoGateway('test-token');
      assert.equal(await gateway.cancelOrder('order-456'), expected);
      assert.equal(requests, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
});
