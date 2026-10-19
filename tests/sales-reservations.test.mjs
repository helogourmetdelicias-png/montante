import assert from 'node:assert/strict';
import test from 'node:test';
import { cancelSaleAndRestore, releaseExpiredSales } from '../src/lib/sales/reservations.ts';
import { calculateCashChangeCents } from '../src/lib/sales/cash-payment.ts';

/** Builds a small transaction double so reservation rules run without touching the database. */
function createTransactionFixture({ sales, items, products }) {
  return {
    sale: {
      async findMany({ where }) {
        return sales
          .filter((sale) => sale.tenantId === where.tenant_id && sale.status === where.status && sale.expiresAt <= where.expires_at.lte)
          .map(({ id }) => ({ id }));
      },
      async findFirst({ where }) {
        const sale = sales.find((entry) => entry.id === where.id && entry.tenantId === where.tenant_id);
        if (!sale) return null;
        return { id: sale.id, status: sale.status };
      },
      async updateMany({ where, data }) {
        const sale = sales.find((entry) => entry.id === where.id && entry.tenantId === where.tenant_id);
        if (!sale || sale.status !== where.status) return { count: 0 };
        if (where.expires_at && sale.expiresAt > where.expires_at.lte) return { count: 0 };
        sale.status = data.status;
        return { count: 1 };
      },
    },
    saleItem: {
      async findMany({ where }) {
        return items.filter((item) => item.saleId === where.sale_id).map(({ productId, quantity }) => ({
          product_id: productId,
          quantity,
        }));
      },
    },
    product: {
      async updateMany({ where, data }) {
        const product = products.find((entry) => entry.id === where.id && entry.tenantId === where.tenant_id);
        if (!product) return { count: 0 };
        product.stock += Number(data.stock_quantity.increment);
        return { count: 1 };
      },
    },
  };
}

function createFixture() {
  const fixture = {
    sales: [
      { id: 'expired-sale', tenantId: 'store-a', status: 'pending', expiresAt: new Date('2026-10-18T10:00:00Z') },
      { id: 'active-sale', tenantId: 'store-a', status: 'pending', expiresAt: new Date('2026-10-18T12:00:00Z') },
      { id: 'other-store-sale', tenantId: 'store-b', status: 'pending', expiresAt: new Date('2026-10-18T10:00:00Z') },
    ],
    items: [
      { saleId: 'expired-sale', productId: 'hammer', quantity: 2 },
      { saleId: 'active-sale', productId: 'hammer', quantity: 1 },
      { saleId: 'other-store-sale', productId: 'hammer', quantity: 5 },
    ],
    products: [{ id: 'hammer', tenantId: 'store-a', stock: 3 }],
  };
  fixture.tx = createTransactionFixture(fixture);
  return fixture;
}

test('cancellation restores reserved stock once, including repeated requests', async () => {
  const fixture = createFixture();

  assert.deepEqual(await cancelSaleAndRestore(fixture.tx, 'store-a', 'active-sale'), { state: 'cancelled' });
  assert.equal(fixture.products[0].stock, 4);
  assert.deepEqual(await cancelSaleAndRestore(fixture.tx, 'store-a', 'active-sale'), { state: 'cancelled' });
  assert.equal(fixture.products[0].stock, 4);
});

test('expiration releases only expired reservations for the requested tenant and is idempotent', async () => {
  const fixture = createFixture();
  const now = new Date('2026-10-18T11:00:00Z');

  assert.equal(await releaseExpiredSales(fixture.tx, 'store-a', now), 1);
  assert.equal(fixture.products[0].stock, 5);
  assert.equal(fixture.sales.find(({ id }) => id === 'active-sale').status, 'pending');
  assert.equal(fixture.sales.find(({ id }) => id === 'other-store-sale').status, 'pending');
  assert.equal(await releaseExpiredSales(fixture.tx, 'store-a', now), 0);
  assert.equal(fixture.products[0].stock, 5);
});

test('completed or missing sales do not restore inventory', async () => {
  const fixture = createFixture();
  fixture.sales.find(({ id }) => id === 'active-sale').status = 'completed';

  assert.deepEqual(await cancelSaleAndRestore(fixture.tx, 'store-a', 'active-sale'), { state: 'not_pending' });
  assert.deepEqual(await cancelSaleAndRestore(fixture.tx, 'store-a', 'missing-sale'), { state: 'not_found' });
  assert.equal(fixture.products[0].stock, 3);
});

test('missing tenant-owned product fails instead of silently losing reserved stock', async () => {
  const fixture = createFixture();
  fixture.products.length = 0;

  await assert.rejects(cancelSaleAndRestore(fixture.tx, 'store-a', 'active-sale'), /devolver o estoque reservado/);
});

test('cash payment calculates exact change in cents and rejects insufficient tender', () => {
  assert.equal(calculateCashChangeCents(1250, 2000), 750);
  assert.equal(calculateCashChangeCents(1250, 1250), 0);
  assert.equal(calculateCashChangeCents(1250, 1249), null);
  assert.equal(calculateCashChangeCents(0, 2000), null);
});
