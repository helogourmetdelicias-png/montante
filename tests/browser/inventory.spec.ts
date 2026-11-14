import { expect, test } from '@playwright/test';
import { businessDateKey } from '../../src/lib/cash-register/business-day';

test.setTimeout(90000);
const today = businessDateKey(new Date());
const day = (offset: number) => { const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10); };
const summary = { all: 3, low: 1, out: 0, expiring: 1, urgent: 1, expired: 1 };
const base = { category: 'Bebidas', unitOfMeasure: 'un', price: '10.00', costPrice: null, sku: null, barcode: null, sellByFraction: false, stockQuantity: '2.000', stockMinAlert: '5.000', stockAisle: null, stockShelf: null, imageUrl: null, brand: null, isActive: true };
const items = [
  { ...base, id: 'expired', name: 'Produto vencido', stockMinAlert: null, attributes: { expiryDate: day(-1), lot: '000001' }, flags: ['expired'], daysUntilExpiry: -1 },
  { ...base, id: 'low', name: 'Produto estoque baixo', attributes: {}, flags: ['low'], daysUntilExpiry: null },
  { ...base, id: 'soon', name: 'Produto próximo de vencer', stockMinAlert: null, attributes: { expiryDate: day(3) }, flags: ['urgent'], daysUntilExpiry: 3 },
];
test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => { throw error; });
  await page.route('**/api/settings/personalization', route => route.fulfill({ json: { name: 'Loja de teste' } }));
  await page.route('**/api/pos/payment-options', route => route.fulfill({ json: { options: [{ provider: 'cash', label: 'Dinheiro', method: 'cash', channel: 'in_person' }] } }));
  await page.route('**/api/inventory-alerts?*', route => {
    const params = new URL(route.request().url()).searchParams;
    const filter = params.get('filter'); const query = params.get('q') ?? '';
    const filtered = items.filter(item => (!filter || filter === 'all' || item.flags.includes(filter) || filter === 'expiring' && item.flags.includes('urgent')) && item.name.toLowerCase().includes(query.toLowerCase()));
    return route.fulfill({ json: { today, summary, items: filtered, total: filtered.length, pageSize: 50 } });
  });
});

test('main PDV keeps counts in the bell and shows details only when requested', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/inventory.html?mode=pdv');
  const panel = page.getByRole('region', { name: 'Alertas de estoque e validade' });
  await expect(panel).toHaveCount(0);
  await expect(page.locator('dialog[open], [aria-modal="true"]')).toHaveCount(0);
  const notification = page.getByRole('button', { name: 'Alertas de produtos: 3', exact: true });
  await expect(notification).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cobrar R$ 0,00', exact: true })).toBeInViewport();
  await page.screenshot({ path: 'output/pdv-clean-mobile.png', fullPage: true });
  await notification.click();
  await expect(panel.getByText('3 produto(s) precisam de atenção.', { exact: false })).toBeVisible();
  await expect(panel.getByRole('link', { name: '1 Estoque baixo' })).toHaveAttribute('href', '/produtos?alert=low');
  await expect(panel.getByRole('link', { name: 'Ver relatório' })).toHaveAttribute('href', '/relatorios#estoque-validade');
  await expect(page.getByRole('dialog', { name: 'Avisos da loja' })).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Ver relatório' })).toHaveAttribute('target', '_blank');
  await expect(panel.getByText(/vencem hoje ou nos próximos 7 dias/)).toBeVisible();
  await page.screenshot({ path: 'output/inventory-alerts-pdv-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Fechar avisos da loja' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
});

test('desktop PDV keeps checkout visible and preserves entered value when consulting alerts', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 620 });
  await page.addInitScript(() => localStorage.setItem('montante.sidebar.collapsed', 'true'));
  await page.goto('/inventory.html?mode=pdv');
  const value = page.getByLabel('Valor da venda', { exact: true });
  await expect(value).toBeVisible();
  await value.fill('25,90');
  const charge = page.getByRole('button', { name: 'Cobrar R$ 25,90', exact: true });
  await expect(charge).toBeEnabled();
  await expect(charge).toBeInViewport();
  await page.getByRole('button', { name: 'Caixa', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Fechar caixa', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Alertas de produtos: 3', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(value).toHaveValue('25,90');
  await expect(charge).toBeEnabled();
  await expect(page.getByRole('region', { name: 'Alertas de estoque e validade' })).toHaveCount(0);
  await page.getByText('Adicionar descrição (opcional)', { exact: true }).click();
  await page.getByLabel('Descrição da venda (opcional)', { exact: true }).fill('Serviço de teste');
  await expect(page.getByRole('complementary', { name: 'Resumo da venda' }).getByText('Serviço de teste', { exact: true })).toBeVisible();
  await page.getByText('Adicionar descrição (opcional)', { exact: true }).click();
  await page.screenshot({ path: 'output/pdv-clean-desktop.png', fullPage: true });
});

test('products remain searchable on the main screen after leaving the F2 window', async ({ page }) => {
  await page.route('**/api/products?*', route => route.fulfill({ json: { products: [{ id: 'product-a', name: 'Cabo USB', sku: 'USB01', barcode: null, unitOfMeasure: 'un', sellByFraction: false, price: '10.00', stockQuantity: '5.000', stockAisle: null, stockShelf: null }], categories: [] } }));
  await page.goto('/inventory.html?mode=pdv');
  await page.getByRole('button', { name: 'F2 · Venda com produtos', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'F2 · Venda avançada', exact: true });
  await expect(modal).toBeVisible();
  await page.getByRole('button', { name: 'Fechar modal da venda' }).click();
  const search = page.getByRole('textbox', { name: 'Buscar produto ou código de barras' });
  await expect(search).toHaveCount(1);
  await search.fill('USB');
  await page.getByRole('button', { name: /Cabo USB/ }).click();
  const charge = page.getByRole('button', { name: 'Cobrar R$ 10,00', exact: true });
  await expect(charge).toBeEnabled();
  await expect(page.getByRole('spinbutton', { name: 'Quantidade de Cabo USB' })).toHaveValue('1');
});

test('report filters current inventory and exports the same filtered selection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/inventory.html');
  await expect(page.getByRole('cell', { name: 'Produto vencido' })).toBeVisible();
  await expect(page.getByText('Vencido há 1 dia(s)', { exact: true })).toBeVisible();
  await page.getByLabel('Tipo de alerta').selectOption('expired');
  await expect(page.getByRole('cell', { name: 'Produto estoque baixo' })).toHaveCount(0);
  await expect(page.getByRole('cell', { name: 'Produto vencido' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Exportar alertas em Excel' })).toHaveAttribute('href', /filter=expired/);
  await expect(page.getByText(/independente do período das vendas/)).toBeVisible();
  await page.screenshot({ path: 'output/inventory-alerts-report-mobile.png', fullPage: true });
});

test('catalog badges, server filter and product minimum/expiry/lot editor agree', async ({ page }) => {
  let saved: Record<string, unknown> | undefined;
  await page.route('**/api/products?*', route => {
    const filter = new URL(route.request().url()).searchParams.get('alert');
    const products = filter ? items.filter(item => item.flags.includes(filter)) : items;
    return route.fulfill({ json: { products, total: products.length, categories: ['Bebidas'] } });
  });
  await page.route('**/api/products', async route => { saved = route.request().postDataJSON(); await route.fulfill({ status: 201, json: { product: { id: 'new' } } }); });
  await page.goto('/inventory.html?mode=catalog');
  const row = page.getByRole('row').filter({ hasText: 'Produto vencido' });
  await expect(row.getByText('Vencidos', { exact: true })).toBeVisible();
  await page.getByLabel('Filtrar alertas do catálogo').selectOption('low');
  await expect(page.getByRole('row').filter({ hasText: 'Produto vencido' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Novo produto', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Novo produto' });
  await editor.getByLabel('Nome do produto', { exact: true }).fill('Produto com alerta');
  await editor.getByLabel('Preço de venda (R$)', { exact: true }).fill('1000');
  await editor.getByLabel('Estoque inicial', { exact: true }).fill('2');
  await editor.getByLabel('Estoque mínimo para alerta (opcional)').fill('5');
  await editor.getByLabel('Data de validade (opcional)').fill(day(3));
  await editor.getByLabel('Lote (opcional)').fill('000009');
  await editor.getByRole('button', { name: 'Salvar produto', exact: true }).click();
  await expect(editor).not.toBeVisible();
  expect(saved).toMatchObject({ stockQuantity: 2, stockMinAlert: 5, attributes: { expiryDate: day(3), lot: '000009' } });
});
