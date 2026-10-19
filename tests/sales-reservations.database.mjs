import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PaymentAttemptStatus, PaymentChannel, PaymentMethod, Prisma, PrismaClient } from '@prisma/client';
import { applyPaymentResult } from '../src/lib/sales/payment-result.ts';
import { cancelSaleAndRestore, releaseExpiredSales } from '../src/lib/sales/reservations.ts';
import { completeCashPayment } from '../src/lib/sales/cash-payment.ts';

const prisma = new PrismaClient();
const testTenantSlug = `qa-reservations-${randomUUID()}`;

class RollbackValidation extends Error {}

/** Creates a sale inside the test transaction and reserves its product stock. */
async function createReservedSale(tx, tenantId, product, saleNumber, expiresAt) {
  const reserved = await tx.product.updateMany({
    where: { id: product.id, tenant_id: tenantId, is_active: true, stock_quantity: { gte: 1 } },
    data: { stock_quantity: { decrement: 1 } },
  });
  assert.equal(reserved.count, 1, 'the isolated test product must have stock to reserve');

  return tx.sale.create({
    data: {
      tenant_id: tenantId,
      sale_number: saleNumber,
      status: 'pending',
      total_amount: product.price,
      discount_amount: new Prisma.Decimal(0),
      expires_at: expiresAt,
      items: {
        create: [{
          product_id: product.id,
          quantity: new Prisma.Decimal(1),
          unit_price: product.price,
          total_price: product.price,
        }],
      },
    },
    select: { id: true },
  });
}

async function validateReservations() {
  let tenantId = '';
  const createdSaleIds = [];

  try {
    await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: 'Testes de reserva', slug: testTenantSlug },
        select: { id: true, sales_sequence: true },
      });
      tenantId = tenant.id;

      const product = await tx.product.create({
        data: {
          tenant_id: tenant.id,
          name: 'Produto temporário de teste',
          unit_of_measure: 'un',
          sell_by_fraction: false,
          price: new Prisma.Decimal('1.00'),
          stock_quantity: new Prisma.Decimal('3.000'),
        },
        select: { id: true, price: true },
      });

      const simulatedSale = await createReservedSale(
        tx,
        tenant.id,
        product,
        tenant.sales_sequence + 1,
        new Date(Date.now() + 15 * 60 * 1000),
      );
      createdSaleIds.push(simulatedSale.id);
      await tx.tenant.update({ where: { id: tenant.id }, data: { sales_sequence: { increment: 1 } } });

      // A fake provider response exercises approval without making any network request or charge.
      const simulatedAttempt = await tx.paymentAttempt.create({
        data: {
          tenant_id: tenant.id,
          sale_id: simulatedSale.id,
          provider: 'mercadopago',
          method: PaymentMethod.PIX,
          channel: PaymentChannel.ONLINE,
          status: PaymentAttemptStatus.PENDING,
          amount: product.price,
          idempotency_key: randomUUID(),
        },
        select: { id: true },
      });
      const simulatedResult = await applyPaymentResult(tx, {
        tenantId: tenant.id,
        saleId: simulatedSale.id,
        attemptId: simulatedAttempt.id,
        method: 'pix',
        result: { status: 'approved' },
      });
      assert.equal(simulatedResult.attempt.status, PaymentAttemptStatus.APPROVED);
      assert.equal(simulatedResult.attempt.external_order_id, null, 'simulation must not create an external order');
      assert.equal(simulatedResult.saleCompleted, true);
      assert.equal((await tx.sale.findUnique({ where: { id: simulatedSale.id }, select: { status: true } })).status, 'completed');
      assert.equal((await tx.product.findUnique({ where: { id: product.id }, select: { stock_quantity: true } })).stock_quantity.toString(), '2');

      const pendingSale = await createReservedSale(
        tx,
        tenant.id,
        product,
        tenant.sales_sequence + 2,
        new Date(Date.now() + 15 * 60 * 1000),
      );
      createdSaleIds.push(pendingSale.id);
      await tx.tenant.update({ where: { id: tenant.id }, data: { sales_sequence: { increment: 1 } } });

      assert.deepEqual(await cancelSaleAndRestore(tx, tenant.id, pendingSale.id), { state: 'cancelled' });
      assert.equal((await tx.product.findUnique({ where: { id: product.id }, select: { stock_quantity: true } })).stock_quantity.toString(), '2');
      assert.deepEqual(await cancelSaleAndRestore(tx, tenant.id, pendingSale.id), { state: 'cancelled' });
      assert.equal((await tx.product.findUnique({ where: { id: product.id }, select: { stock_quantity: true } })).stock_quantity.toString(), '2');

      const cashSale = await createReservedSale(
        tx,
        tenant.id,
        product,
        tenant.sales_sequence + 3,
        new Date(Date.now() + 15 * 60 * 1000),
      );
      createdSaleIds.push(cashSale.id);
      assert.equal((await completeCashPayment(tx, {
        tenantId: tenant.id,
        saleId: cashSale.id,
        idempotencyKey: randomUUID(),
        receivedCents: 49,
        appliedCents: 50,
      })).state, 'insufficient', 'underpayment must leave the sale pending');
      assert.equal((await tx.sale.findUnique({ where: { id: cashSale.id }, select: { status: true } })).status, 'pending');
      const cashIdempotencyKey = randomUUID();
      const cashResult = await completeCashPayment(tx, {
        tenantId: tenant.id,
        saleId: cashSale.id,
        idempotencyKey: cashIdempotencyKey,
        receivedCents: 100,
        appliedCents: 50,
      });
      assert.deepEqual(cashResult, {
        state: 'recorded',
        replayed: false,
        cashAmount: '0.50',
        amountReceived: '1.00',
        changeAmount: '0.50',
        remainingAmount: '0.50',
        saleCompleted: false,
      });
      assert.deepEqual(await completeCashPayment(tx, {
        tenantId: tenant.id,
        saleId: cashSale.id,
        idempotencyKey: cashIdempotencyKey,
        receivedCents: 100,
        appliedCents: 50,
      }), {
        state: 'recorded',
        replayed: true,
        cashAmount: '0.50',
        amountReceived: '1.00',
        changeAmount: '0.50',
        remainingAmount: '0.50',
        saleCompleted: false,
      });
      assert.equal((await completeCashPayment(tx, {
        tenantId: tenant.id,
        saleId: cashSale.id,
        idempotencyKey: cashIdempotencyKey,
        receivedCents: 150,
        appliedCents: 50,
      })).state, 'idempotency_conflict', 'a retry key cannot represent a changed tender');

      const pixRemainder = await tx.paymentAttempt.create({
        data: {
          tenant_id: tenant.id,
          sale_id: cashSale.id,
          provider: 'mercadopago',
          method: PaymentMethod.PIX,
          channel: PaymentChannel.ONLINE,
          status: PaymentAttemptStatus.PENDING,
          amount: new Prisma.Decimal('0.50'),
          idempotency_key: randomUUID(),
        },
        select: { id: true },
      });
      const mixedApproval = await applyPaymentResult(tx, {
        tenantId: tenant.id,
        saleId: cashSale.id,
        attemptId: pixRemainder.id,
        method: 'pix',
        result: { status: 'approved' },
      });
      assert.equal(mixedApproval.saleCompleted, true, 'Pix confirmation completes the mixed sale');
      const completedCashSale = await tx.sale.findUnique({
        where: { id: cashSale.id },
        select: { status: true, payment_method: true, amount_received: true, change_amount: true },
      });
      assert.equal(completedCashSale.status, 'completed');
      assert.equal(completedCashSale.payment_method, 'cash+pix');
      assert.equal(completedCashSale.amount_received.toFixed(2), '1.00');
      assert.equal(completedCashSale.change_amount.toFixed(2), '0.50');
      assert.equal(
        (await tx.product.findUnique({ where: { id: product.id }, select: { stock_quantity: true } })).stock_quantity.toString(),
        '1',
        'Pix approval must not decrement inventory a second time after reservation',
      );

      const expiredSale = await createReservedSale(
        tx,
        tenant.id,
        product,
        tenant.sales_sequence + 4,
        new Date(Date.now() - 60 * 1000),
      );
      createdSaleIds.push(expiredSale.id);
      await tx.tenant.update({ where: { id: tenant.id }, data: { sales_sequence: { increment: 1 } } });
      const stockBeforeExpiry = await tx.product.findUnique({ where: { id: product.id }, select: { stock_quantity: true } });

      assert.equal(await releaseExpiredSales(tx, tenant.id, new Date()), 1);
      assert.equal((await tx.sale.findUnique({ where: { id: expiredSale.id }, select: { status: true } })).status, 'cancelled');
      const stockAfterExpiry = await tx.product.findUnique({ where: { id: product.id }, select: { stock_quantity: true } });
      assert.equal(stockAfterExpiry.stock_quantity.sub(stockBeforeExpiry.stock_quantity).toString(), '1');
      assert.equal(await releaseExpiredSales(tx, tenant.id, new Date()), 0, 'expiration retries must not restore stock twice');

      throw new RollbackValidation('rollback validated test transaction');
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 30_000,
    });
  } catch (error) {
    if (!(error instanceof RollbackValidation)) throw error;
  }

  const [persistedTenant, persistedTestSales] = await Promise.all([
    prisma.tenant.findUnique({ where: { slug: testTenantSlug }, select: { id: true } }),
    tenantId ? prisma.sale.count({ where: { tenant_id: tenantId, id: { in: createdSaleIds } } }) : 0,
  ]);
  assert.equal(persistedTenant, null, 'the temporary tenant and product must roll back');
  assert.equal(persistedTestSales, 0, 'temporary sales must not persist');

  return { simulatedApproval: 'passed', cancellation: 'passed', mixedCashPix: 'passed', cashChange: 'passed', expiration: 'passed', idempotency: 'passed', rollback: 'passed' };
}

try {
  console.log(JSON.stringify(await validateReservations()));
} finally {
  await prisma.$disconnect();
}
