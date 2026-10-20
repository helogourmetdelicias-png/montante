import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePeriod } from '../src/lib/reports/period.ts';
import { reportShareText, historyShareText, whatsappShareUrl } from '../src/lib/reports/share.ts';

test('report sharing encodes names and filtered values without adding a public data link', () => {
  const text = reportShareText({ storeName: 'Loja & Filhos', period: { startDate: '2026-10-01', endDate: '2026-10-19' }, summary: { revenue: '123.45', saleCount: 2, averageTicket: '61.73' }, topCustomers: [{ name: 'José #1', revenue: '100.00', saleCount: 1 }] });
  const url = new URL(whatsappShareUrl(text));
  assert.equal(url.origin, 'https://wa.me');
  assert.equal(url.searchParams.get('text'), text);
  assert.match(text, /01\/10\/2026 a 19\/10\/2026/);
  assert.match(text, /José #1/);
});

test('customer share identifies the page and separates concluded totals from pending/cancelled sales', () => {
  const text = historyShareText({ storeName: 'Loja', customer: { name: 'Cliente' }, period: null, summary: { revenue: '10.00', saleCount: 1, averageTicket: '10.00' }, page: 2, total: 30, sales: [{ saleNumber: 3, soldAt: '2026-10-20T02:00:00Z', status: 'pending', totalAmount: '20.00' }] });
  assert.match(text, /página 2 \(1 de 30/);
  assert.match(text, /19\/10\/2026 · Pendente/);
  assert.match(text, /Pendentes e canceladas não compõem/);
});

test('report period uses inclusive Sao Paulo dates and rejects invalid/reversed calendar dates', () => {
  const period = parsePeriod(new URL('http://localhost?startDate=2026-10-19&endDate=2026-10-19'));
  assert.equal(period.startAt.toISOString(), '2026-10-19T03:00:00.000Z');
  assert.equal(period.endBefore.toISOString(), '2026-10-20T03:00:00.000Z');
  assert.equal(parsePeriod(new URL('http://localhost?startDate=2026-02-30&endDate=2026-03-01')), null);
  assert.equal(parsePeriod(new URL('http://localhost?startDate=2026-10-20&endDate=2026-10-19')), null);
});
