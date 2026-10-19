import assert from 'node:assert/strict';
import test from 'node:test';
import { EXPIRED_SALES_BATCH_SIZE } from '../src/lib/cron/expired-sales.ts';
import { hasValidCronSecret } from '../src/lib/cron/auth.ts';

test('cron authorization accepts the configured Bearer token', () => {
  const request = new Request('https://montante.example/api/cron/release-expired-sales', {
    headers: { authorization: 'Bearer local-test-secret' },
  });

  assert.equal(hasValidCronSecret(request, 'local-test-secret'), true);
});

test('cron authorization rejects missing, malformed, and invalid tokens', () => {
  const requests = [
    new Request('https://montante.example/api/cron/release-expired-sales'),
    new Request('https://montante.example/api/cron/release-expired-sales', {
      headers: { authorization: 'Basic local-test-secret' },
    }),
    new Request('https://montante.example/api/cron/release-expired-sales', {
      headers: { authorization: 'Bearer wrong-secret' },
    }),
  ];

  for (const request of requests) {
    assert.equal(hasValidCronSecret(request, 'local-test-secret'), false);
  }
});

test('cron runs process no more than 100 expired sales per batch', () => {
  assert.equal(EXPIRED_SALES_BATCH_SIZE, 100);
});
