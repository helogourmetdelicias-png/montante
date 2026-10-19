import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { encode } from 'next-auth/jwt';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
const runId = randomUUID();
const tenants = [];

assert.ok(secret, 'AUTH_SECRET or NEXTAUTH_SECRET is required for local session tokens');

async function createTestTenant(label) {
  const tenant = await prisma.tenant.create({
    data: { name: `QA ${label}`, slug: `qa-isolation-${label}-${runId}` },
    select: { id: true, slug: true },
  });
  tenants.push(tenant.id);
  return tenant;
}

async function createSessionCookie(tenant, label, role = 'owner') {
  const token = await encode({
    secret,
    salt: 'authjs.session-token',
    token: {
      sub: `qa-user-${label}-${runId}`,
      id: `qa-user-${label}-${runId}`,
      name: `QA ${label}`,
      email: `qa-${label}-${runId}@example.invalid`,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      role,
    },
  });
  return `authjs.session-token=${token}`;
}

async function requestJson(path, cookie, init = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    headers: { cookie, ...(init.headers ?? {}) },
    redirect: 'manual',
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function createTestProduct(tenantId, name) {
  return prisma.product.create({
    data: {
      tenant_id: tenantId,
      name,
      sku: `SKU-${name.toUpperCase()}`,
      unit_of_measure: 'un',
      sell_by_fraction: false,
      price: new Prisma.Decimal('7.50'),
      stock_quantity: new Prisma.Decimal('4.000'),
    },
    select: { id: true, name: true, is_active: true, price: true },
  });
}

async function createTestSale(tenantId, saleNumber) {
  return prisma.sale.create({
    data: {
      tenant_id: tenantId,
      sale_number: saleNumber,
      status: 'pending',
      total_amount: new Prisma.Decimal('7.50'),
      discount_amount: new Prisma.Decimal('0.00'),
      expires_at: new Date(Date.now() + 15 * 60 * 1000),
    },
    select: { id: true, status: true },
  });
}

async function validateTenantIsolation() {
  const tenantA = await createTestTenant('a');
  const tenantB = await createTestTenant('b');
  const gatewayConfig = await prisma.paymentGatewayConfig.create({
    data: {
      tenant_id: tenantA.id,
      provider: 'mercadopago',
      is_active: true,
      is_default: true,
      environment: 'sandbox',
      display_name: 'Mercado Pago QA',
    },
    select: { id: true },
  });
  const productA = await createTestProduct(tenantA.id, `a-${runId}`);
  const productB = await createTestProduct(tenantB.id, `b-${runId}`);
  const saleA = await createTestSale(tenantA.id, 1);
  const saleB = await createTestSale(tenantB.id, 1);
  const cookieA = await createSessionCookie(tenantA, 'a');
  const cookieB = await createSessionCookie(tenantB, 'b');
  const cashierCookie = await createSessionCookie(tenantA, 'cashier', 'cashier');

  const paymentOptions = await requestJson('/api/pos/payment-options', cookieA);
  assert.equal(paymentOptions.response.status, 200);
  assert.equal(paymentOptions.body.canSimulatePixApproval, true, 'Sandbox owners may use the local approval simulator');
  assert.ok(paymentOptions.body.options.some(({ provider, method }) => provider === 'cash' && method === 'cash'));
  assert.ok(paymentOptions.body.options.some(({ provider, method }) => provider === 'split' && method === 'mixed'));

  const [productsA, productsB, salesA, salesB] = await Promise.all([
    requestJson('/api/products?limit=100', cookieA),
    requestJson('/api/products?limit=100', cookieB),
    requestJson('/api/sales?limit=100', cookieA),
    requestJson('/api/sales?limit=100', cookieB),
  ]);

  for (const result of [productsA, productsB, salesA, salesB]) {
    assert.equal(result.response.status, 200, 'a valid tenant session must reach its own API');
  }
  assert.deepEqual(productsA.body.products.map(({ id }) => id), [productA.id]);
  assert.deepEqual(productsB.body.products.map(({ id }) => id), [productB.id]);
  assert.deepEqual(salesA.body.sales.map(({ id }) => id), [saleA.id]);
  assert.deepEqual(salesB.body.sales.map(({ id }) => id), [saleB.id]);

  const crossTenantPatch = await requestJson(`/api/products/${productB.id}`, cookieA, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ price: 99.99 }),
  });
  assert.equal(crossTenantPatch.response.status, 404, 'a shop must not edit another shop product');

  const crossTenantDelete = await requestJson(`/api/products/${productB.id}`, cookieA, { method: 'DELETE' });
  assert.equal(crossTenantDelete.response.status, 404, 'a shop must not deactivate another shop product');

  const crossTenantCancel = await requestJson(`/api/sales/${saleB.id}/cancel`, cookieA, { method: 'POST' });
  assert.equal(crossTenantCancel.response.status, 404, 'a shop must not cancel another shop sale');

  const insufficientCash = await requestJson(`/api/sales/${saleA.id}/cash-payment`, cookieA, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idempotencyKey: randomUUID(), amountApplied: 5, amountReceived: 4.99 }),
  });
  assert.equal(insufficientCash.response.status, 400, 'cash under the chosen cash portion must be rejected');

  const cashIdempotencyKey = randomUUID();
  const cashPayment = await requestJson(`/api/sales/${saleA.id}/cash-payment`, cookieA, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idempotencyKey: cashIdempotencyKey, amountApplied: 3, amountReceived: 4 }),
  });
  assert.equal(cashPayment.response.status, 200, 'cash contribution should be recorded while the Pix balance remains open');
  assert.equal(cashPayment.body.status, 'partially_paid');
  assert.equal(cashPayment.body.cashAmount, '3.00');
  assert.equal(cashPayment.body.amountReceived, '4.00');
  assert.equal(cashPayment.body.changeAmount, '1.00');
  assert.equal(cashPayment.body.remainingAmount, '4.50');

  const replayedCashPayment = await requestJson(`/api/sales/${saleA.id}/cash-payment`, cookieA, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idempotencyKey: cashIdempotencyKey, amountApplied: 3, amountReceived: 4 }),
  });
  assert.equal(replayedCashPayment.response.status, 200);
  assert.equal(replayedCashPayment.body.replayed, true, 'repeated cash confirmation must be idempotent');
  const saleAAfterCash = await prisma.sale.findUnique({ where: { id: saleA.id }, select: { status: true } });
  assert.equal(saleAAfterCash.status, 'pending', 'cash alone must not approve a mixed sale before Pix is confirmed');

  const pendingPix = await prisma.paymentAttempt.create({
    data: {
      tenant_id: tenantA.id,
      sale_id: saleA.id,
      gateway_config_id: gatewayConfig.id,
      provider: 'mercadopago',
      method: 'PIX',
      channel: 'ONLINE',
      status: 'PENDING',
      amount: new Prisma.Decimal('4.50'),
      idempotency_key: randomUUID(),
      external_order_id: `qa-order-${runId}`,
    },
    select: { id: true },
  });
  const deniedSimulation = await requestJson(`/api/sales/${saleA.id}/payments/${pendingPix.id}/simulate-approval`, cashierCookie, { method: 'POST' });
  assert.equal(deniedSimulation.response.status, 403, 'cashiers must not simulate provider approvals');
  const simulatedApproval = await requestJson(`/api/sales/${saleA.id}/payments/${pendingPix.id}/simulate-approval`, cookieA, { method: 'POST' });
  assert.equal(simulatedApproval.response.status, 200, 'Sandbox owner can simulate provider approval');
  assert.equal(simulatedApproval.body.status, 'approved');
  assert.equal(simulatedApproval.body.saleCompleted, true, 'the sale completes after the remaining Pix portion is approved');
  assert.equal(simulatedApproval.body.simulated, true);
  const mixedSaleAfterPix = await prisma.sale.findUnique({
    where: { id: saleA.id },
    select: { status: true, payment_method: true, amount_received: true, change_amount: true },
  });
  assert.equal(mixedSaleAfterPix.status, 'completed');
  assert.equal(mixedSaleAfterPix.payment_method, 'cash+pix');
  assert.equal(mixedSaleAfterPix.amount_received.toFixed(2), '4.00', 'the recorded cash tender must remain on the completed sale');
  assert.equal(mixedSaleAfterPix.change_amount.toFixed(2), '1.00', 'the recorded cash change must remain on the completed sale');
  const simulatedAttempt = await prisma.paymentAttempt.findUnique({ where: { id: pendingPix.id }, select: { is_simulated: true } });
  assert.equal(simulatedAttempt.is_simulated, true, 'the local approval must be auditable as a simulation');
  const mixedPixStatus = await requestJson(`/api/sales/${saleA.id}/payments/${pendingPix.id}/status`, cookieA);
  assert.equal(mixedPixStatus.response.status, 200);
  assert.equal(mixedPixStatus.body.status, 'approved', 'the existing polling endpoint must return the simulated approval');
  assert.equal(mixedPixStatus.body.saleCompleted, true);

  const pixSale = await createTestSale(tenantA.id, 2);
  const pixAttempt = await prisma.paymentAttempt.create({
    data: {
      tenant_id: tenantA.id,
      sale_id: pixSale.id,
      gateway_config_id: gatewayConfig.id,
      provider: 'mercadopago',
      method: 'PIX',
      channel: 'ONLINE',
      status: 'PENDING',
      amount: new Prisma.Decimal('7.50'),
      idempotency_key: randomUUID(),
      external_order_id: `qa-order-pix-${runId}`,
    },
    select: { id: true },
  });
  const pixApproval = await requestJson(`/api/sales/${pixSale.id}/payments/${pixAttempt.id}/simulate-approval`, cookieA, { method: 'POST' });
  assert.equal(pixApproval.response.status, 200, 'a full Pix Sandbox sale can be simulated');
  assert.equal(pixApproval.body.saleCompleted, true);
  const completedPixSale = await prisma.sale.findUnique({ where: { id: pixSale.id }, select: { status: true, payment_method: true } });
  assert.equal(completedPixSale.status, 'completed');
  assert.equal(completedPixSale.payment_method, 'pix');

  const productBAfter = await prisma.product.findUnique({ where: { id: productB.id }, select: { is_active: true, price: true } });
  const saleBAfter = await prisma.sale.findUnique({ where: { id: saleB.id }, select: { status: true } });
  assert.equal(productBAfter.is_active, true);
  assert.equal(productBAfter.price.toFixed(2), '7.50');
  assert.equal(saleBAfter.status, 'pending');

  // Brand changes must stay inside the tenant and be limited to owner/admin roles.
  // Use a publicly reachable image URL while verifying per-tenant persistence.
  const brandUrl = 'https://placehold.co/256x128/png?text=Montante%20QA';
  const updateBrand = await requestJson('/api/settings/brand', cookieA, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ logoUrl: brandUrl }),
  });
  assert.equal(updateBrand.response.status, 200, 'an owner must update its own tenant logo');
  assert.equal(updateBrand.body.logoUrl, brandUrl);

  const deniedBrandUpdate = await requestJson('/api/settings/brand', cashierCookie, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ logoUrl: 'https://cashier.example.invalid/logo.svg' }),
  });
  assert.equal(deniedBrandUpdate.response.status, 403, 'cashiers must not change tenant branding');

  const tenantBrandStates = await prisma.tenant.findMany({
    where: { id: { in: [tenantA.id, tenantB.id] } },
    select: { id: true, logo_url: true },
  });
  assert.equal(tenantBrandStates.find(({ id }) => id === tenantA.id)?.logo_url, brandUrl);
  assert.equal(tenantBrandStates.find(({ id }) => id === tenantB.id)?.logo_url, null);

  return {
    productLists: 'isolated',
    salesLists: 'isolated',
    cashAvailable: 'passed',
    mixedPaymentAvailable: 'passed',
    crossTenantEdit: 'blocked',
    crossTenantDelete: 'blocked',
    crossTenantCancel: 'blocked',
    cashUnderpayment: 'blocked',
    cashChange: 'calculated',
    cashReplay: 'idempotent',
    sandboxPixApproval: 'completed',
    fullPixApproval: 'completed',
    brandTenantIsolation: 'passed',
    cashierBrandEdit: 'blocked',
  };
}

try {
  console.log(JSON.stringify(await validateTenantIsolation()));
} finally {
  if (tenants.length) await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
  await prisma.$disconnect();
}
