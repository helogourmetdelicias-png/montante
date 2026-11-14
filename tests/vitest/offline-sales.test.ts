import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), transaction: vi.fn(), existing: vi.fn() }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/database/transactions', () => ({ runSerializableTransaction: mocks.transaction }));
vi.mock('@/lib/prisma', () => ({ prisma: { sale: { findUnique: mocks.existing } } }));
vi.mock('@/lib/sales/reservations', () => ({ releaseExpiredSales: vi.fn() }));

import { POST } from '@/app/api/pos/offline/sync/route';
import { signOffline, productValue, ticketValue } from '@/lib/offline/signing';
import { offlineLineCents } from '@/lib/offline/sale';
import type { OfflineSale } from '@/lib/offline/sale';

function saleInput(advanced = false): OfflineSale {
  const preparedAt = new Date(Date.now() - 3 * 86400_000).toISOString();
  const ticket = signOffline(ticketValue('store', 'user', preparedAt));
  return {
    id: '8ec76d5b-0e7c-4f12-b9b5-07fe5e700d75', tenantId: 'store', userId: 'user', preparedAt, ticket,
    occurredAt: new Date(Date.now() - 86400_000).toISOString(), mode: advanced ? 'advanced' : 'quick', quickCents: advanced ? 0 : 2500,
    discountCents: 0, receivedCents: 3000, notes: 'Teste offline',
    items: advanced ? [{ productId: 'product', quantityMilli: 125, price: '7.99', sellByFraction: true, signature: signOffline(productValue(ticket, 'product', '7.99', true)) }] : [],
  };
}
function database(closed = false) {
  const decimal = (n: number) => new Prisma.Decimal(n);
  return {
    sale: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockImplementation(async ({ data }) => ({ id: 'sale-db', ...data })) },
    product: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    brandCommission: { findMany: vi.fn().mockResolvedValue([]) },
    cashRegisterSession: {
      findFirst: vi.fn().mockResolvedValue({ id: 'original-day', status: closed ? 'CLOSED' : 'OPEN', initial_amount: decimal(50), declared_amount: closed ? decimal(100) : null }),
      create: vi.fn(), update: vi.fn(),
    },
    tenant: { update: vi.fn().mockResolvedValue({ sales_sequence: 8 }) },
    paymentAttempt: { aggregate: vi.fn().mockResolvedValue({ _sum: { amount: decimal(25) } }) },
    cashRegisterMovement: { groupBy: vi.fn().mockResolvedValue([]) },
    creditPayment: { aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null } }) },
  };
}
type Database = ReturnType<typeof database>;
let tx: Database;
async function send(sale: unknown) { return POST(new Request('http://localhost/api/pos/offline/sync', { method: 'POST', body: JSON.stringify(sale) })); }

beforeEach(() => {
  vi.clearAllMocks(); process.env.AUTH_SECRET = 'offline-unit-test-only';
  mocks.auth.mockResolvedValue({ user: { tenantId: 'store', id: 'user' } });
  tx = database(); mocks.transaction.mockImplementation(async operation => operation(tx));
});

describe('offline cash synchronization', () => {
  it('commits an approved cash sale on its original day, with exact cash/change and no reservation', async () => {
    const sale = saleInput(); const response = await send(sale);
    expect(response.status).toBe(200);
    const data = tx.sale.create.mock.calls[0][0].data;
    expect(data.status).toBe('completed'); expect(data.expires_at).toBeUndefined();
    expect(data.sold_at.toISOString()).toBe(sale.occurredAt);
    expect(data.created_at.toISOString()).toBe(sale.occurredAt);
    expect(data.cash_register_session_id).toBe('original-day');
    expect(data.total_amount.toFixed(2)).toBe('25.00'); expect(data.change_amount.toFixed(2)).toBe('5.00');
    expect(data.payment_attempts.create).toMatchObject({ provider: 'cash', status: 'APPROVED', cash_session_id: 'original-day', confirmed_at: new Date(sale.occurredAt) });
    const where = tx.cashRegisterSession.findFirst.mock.calls[0][0].where;
    expect(where.opened_at.gte <= new Date(sale.occurredAt) && where.opened_at.lt > new Date(sale.occurredAt)).toBe(true);
    expect(where.user_id).toBe('user');
  });
  it('acknowledges an identical retry without incrementing stock, sequence or receipts again', async () => {
    const sale = saleInput(); await send(sale);
    const data = tx.sale.create.mock.calls[0][0].data;
    tx.sale.findUnique.mockResolvedValue({ id: 'sale-db', ...data });
    const response = await send(sale);
    expect((await response.json()).sale.replayed).toBe(true);
    expect(tx.sale.create).toHaveBeenCalledTimes(1); expect(tx.tenant.update).toHaveBeenCalledTimes(1);
  });
  it('rejects a reused identifier with changed amounts', async () => {
    const sale = saleInput(); await send(sale);
    tx.sale.findUnique.mockResolvedValue({ id: 'sale-db', ...tx.sale.create.mock.calls[0][0].data });
    expect((await send({ ...sale, quickCents: 2000 })).status).toBe(409);
    expect(tx.sale.create).toHaveBeenCalledTimes(1);
  });
  it('keeps the signed catalog price after the online price changes and debits fractional stock', async () => {
    const sale = saleInput(true);
    tx.product.findMany.mockResolvedValue([{ id: 'product', name: 'Produto', price: new Prisma.Decimal(99), cost_price: null, brand: null, category: null }] as never);
    expect((await send(sale)).status).toBe(200);
    const data = tx.sale.create.mock.calls[0][0].data;
    expect(data.items.create[0].unit_price.toFixed(2)).toBe('7.99'); expect(data.total_amount.toFixed(2)).toBe('1.00');
    expect(tx.product.updateMany.mock.calls[0][0].data.stock_quantity.decrement.toString()).toBe('0.125');
  });
  it('returns stock conflicts without creating a completed sale or receipt', async () => {
    tx.product.findMany.mockResolvedValue([{ id: 'product', name: 'Produto', cost_price: null, brand: null, category: null }] as never);
    tx.product.updateMany.mockResolvedValue({ count: 0 });
    const response = await send(saleInput(true));
    expect(response.status).toBe(409); expect((await response.json()).error).toContain('Estoque insuficiente'); expect(tx.sale.create).not.toHaveBeenCalled();
  });
  it('updates the historical closed drawer expected amount without reopening or mixing with today', async () => {
    tx = database(true);
    expect((await send(saleInput())).status).toBe(200);
    const update = tx.cashRegisterSession.update.mock.calls[0][0];
    expect(update.where.id).toBe('original-day'); expect(update.data.expected_amount.toString()).toBe('75'); expect(update.data.difference_amount.toString()).toBe('25');
    expect(update.data.status).toBeUndefined();
  });
  it('never accepts a different tenant or operator', async () => {
    const sale = saleInput();
    expect((await send({ ...sale, tenantId: 'other' })).status).toBe(403);
    expect((await send({ ...sale, userId: 'other' })).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('requires authentication before reading or changing any sale', async () => {
    mocks.auth.mockResolvedValue(null); expect((await send(saleInput())).status).toBe(401); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('rejects modified catalog signatures and forged prices', async () => {
    const sale = saleInput(true); sale.items[0].price = '0.01';
    expect((await send(sale)).status).toBe(409); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('accepts delayed upload but rejects sales outside the preparation window or in the future', async () => {
    const sale = saleInput();
    expect((await send(sale)).status).toBe(200);
    expect((await send({ ...sale, occurredAt: new Date(Date.parse(sale.preparedAt) + 8 * 86400_000).toISOString() })).status).toBe(409);
    expect((await send({ ...sale, occurredAt: new Date(Date.now() + 600_000).toISOString() })).status).toBe(409);
  });
  it('rejects insufficient cash, duplicate items and invalid discounts', async () => {
    const sale = saleInput(true);
    expect((await send({ ...sale, receivedCents: 99 })).status).toBe(400);
    expect((await send({ ...sale, items: [sale.items[0], sale.items[0]] })).status).toBe(400);
    expect((await send({ ...sale, discountCents: 101 })).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('uses exact integer half-up rounding for quantities and large values', () => {
    expect(offlineLineCents('7.99', 125)).toBe(100);
    expect(offlineLineCents('0.01', 500)).toBe(1);
    expect(offlineLineCents('99999999.99', 9999999999)).toBe(99999999980000000);
  });
});
