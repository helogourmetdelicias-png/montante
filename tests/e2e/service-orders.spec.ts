import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
const db = new PrismaClient();
let tenantId = '';
let slug = '';
let email = '';
let productId = '';
const password = randomUUID();
test.beforeAll(async () => {
  const suffix = randomUUID();
  slug = `qa-os-browser-${suffix}`; email = `qa-os-${suffix}@example.invalid`;
  const tenant = await db.tenant.create({ data: { slug, name: 'Assistência técnica QA', niche: 'IT_SUPPORT' } }); tenantId = tenant.id;
  const user = await db.user.create({ data: { tenant_id: tenantId, name: 'Técnico QA', email, role: 'owner', password_hash: await bcrypt.hash(password, 4) } });
  await db.cashRegisterSession.create({ data: { tenant_id: tenantId, user_id: user.id, initial_amount: 0 } });
  productId = (await db.product.create({ data: { tenant_id: tenantId, name: 'Memória QA', unit_of_measure: 'UN', price: '25.90', stock_quantity: 5 } })).id;
});
test.afterAll(async () => {
  if (tenantId) {
    await db.paymentAttempt.deleteMany({ where: { tenant_id: tenantId } });
    await db.sale.deleteMany({ where: { tenant_id: tenantId } });
    await db.serviceOrder.deleteMany({ where: { tenant_id: tenantId } });
    await db.product.deleteMany({ where: { tenant_id: tenantId } });
    await db.cashRegisterSession.deleteMany({ where: { tenant_id: tenantId } });
    await db.user.deleteMany({ where: { tenant_id: tenantId } });
    await db.tenant.delete({ where: { id: tenantId } });
  }
  await db.$disconnect();
});

test('entrada → orçamento → pronto → PDV → pagamento → entrega e caixa', async ({ page, context }) => {
  const { csrfToken } = await (await context.request.get('/api/auth/csrf')).json();
  await context.request.post('/api/auth/callback/credentials', { form: { email, password, tenantSlug: slug, csrfToken, callbackUrl: 'http://127.0.0.1:3100/ordens-servico' }, headers: { 'X-Auth-Return-Redirect': '1' } });
  await page.goto('/ordens-servico');
  await page.getByRole('link', { name: 'Nova O.S.', exact: true }).click();
  await page.getByLabel('Nome do cliente', { exact: true }).fill('Cliente de Teste QA');
  await page.getByLabel('Telefone do cliente', { exact: true }).fill('(21) 99999-9999');
  await page.getByLabel('Tipo do aparelho', { exact: true }).fill('Notebook');
  await page.getByLabel('Marca e modelo', { exact: true }).fill('Notebook de teste');
  await page.getByLabel('Número de série / IMEI (opcional)', { exact: true }).fill('QA-SERIAL');
  await page.getByLabel('Defeito relatado', { exact: true }).fill('Não inicializa');
  await page.getByLabel('Estado físico na entrada', { exact: true }).fill('Marcas na tampa');
  await page.getByLabel('Senha para testes (opcional)', { exact: true }).fill('qa-device-only');
  await page.getByRole('button', { name: 'Adicionar peça', exact: true }).click();
  await page.getByLabel('Mão de obra (R$)', { exact: true }).fill('80');
  await page.getByRole('button', { name: 'Criar ordem de serviço', exact: true }).click();
  await expect(page).toHaveURL(/\/ordens-servico\/c[a-z0-9]+$/);
  const orderUrl = page.url();
  await expect(page.getByRole('heading', { name: 'O.S. #1', exact: true })).toBeVisible();
  await expect(page.getByText('qa-device-only', { exact: true })).toHaveCount(0);
  expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stock_quantity.toNumber()).toBe(5);
  for (const status of ['IN_PROGRESS', 'READY']) {
    await page.getByLabel('Situação', { exact: true }).selectOption(status);
    const saved = page.waitForResponse(res => res.url().includes('/api/service-orders/') && res.request().method() === 'PATCH');
    await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
    expect((await saved).ok()).toBe(true); await page.reload();
  }
  await page.screenshot({ path: 'C:/Users/Ricardo/.codex/visualizations/2026/10/23/01a16a0f-d463-7621-9a76-1b78aeddb8dd/ordem-servico-pronta.png', fullPage: true });
  await page.getByRole('button', { name: 'Receber no caixa / PDV', exact: true }).click();
  await expect(page).toHaveURL(/\/pdv\?serviceSale=/);
  await expect(page.getByRole('heading', { name: 'Recebimento de ordem de serviço', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tentar pagamento', exact: true }).click();
  // Existing cash fields use cent entry: 11000 => R$ 110,00.
  await page.getByLabel('Quanto o cliente entregou em dinheiro?', { exact: true }).fill('11000');
  await expect(page.getByRole('button', { name: 'Concluir venda em dinheiro', exact: true })).toBeEnabled();
  const received = page.waitForResponse(res => res.url().includes('/cash-payment') && res.request().method() === 'POST');
  await page.getByRole('button', { name: 'Concluir venda em dinheiro', exact: true }).click();
  expect((await received).ok()).toBe(true);
  await expect(page.getByText('Venda em dinheiro concluída.', { exact: true })).toBeVisible();
  await page.goto(orderUrl);
  await expect(page.getByLabel('Situação', { exact: true })).toHaveValue('COMPLETED');
  expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stock_quantity.toNumber()).toBe(4);
  const order = await db.serviceOrder.findFirstOrThrow({ where: { tenant_id: tenantId } });
  expect(order.device_password_encrypted).toBeNull();
  const sale = await db.sale.findFirstOrThrow({ where: { tenant_id: tenantId, service_order_id: order.id } });
  expect(sale.status).toBe('completed'); expect(sale.total_amount.toFixed(2)).toBe('105.90');
  const drawer = await (await context.request.get('/api/cash-register/session')).json();
  expect(drawer.session.pendingIssues).toHaveLength(0); expect(drawer.session.totals.cashSales).toBe('105.90');
  await page.goto(`/vendas/${sale.id}`);
  await expect(page.getByRole('heading', { name: 'Ordem de serviço #1' })).toBeVisible();
  await expect(page.getByText('Mão de obra', { exact: true })).toBeVisible();
});
