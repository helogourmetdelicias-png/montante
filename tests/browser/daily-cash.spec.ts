import { expect, test } from '@playwright/test';
test.setTimeout(90000);
test.beforeEach(({ page }) => { page.on('pageerror', error => { throw error; }); });

test('mobile register keeps previous cash separate with no automatic modal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const previousDays = [{ id: 'old', openedAt: '2026-10-28T12:00:00Z' }];
  const current = { id: 'today', initialAmount: '0.00', expectedAmount: '12.00', openedAt: '2026-10-29T12:00:00Z', needsClosing: false, pendingIssues: [], movements: [], totals: { cashSales: '12.00', cashCreditReceipts: '0.00', supplies: '0.00', withdrawals: '0.00' } };
  await page.route('**/api/cash-register/session**', route => route.fulfill({ json: {
    previousDays, session: route.request().url().includes('sessionId=old')
      ? { ...current, id: 'old', expectedAmount: '150.00', initialAmount: '100.00', openedAt: previousDays[0].openedAt, needsClosing: true, totals: { ...current.totals, cashSales: '50.00' } } : current,
  } }));
  await page.route('**/api/settings/personalization', route => route.fulfill({ json: { name: 'Loja de teste' } }));
  await page.goto('/cash.html', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('R$ 12,00', { exact: true })).toHaveCount(2);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.getByText('R$ 150,00', { exact: true })).toHaveCount(0);
  await page.getByLabel('Dia para consultar').selectOption('old');
  await expect(page.getByText('R$ 150,00', { exact: true })).toBeVisible();
  await expect(page.getByText('R$ 12,00', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Registrar movimentação' })).toHaveCount(0);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.getByLabel('Dia para consultar').selectOption('');
  await expect(page.getByText('R$ 150,00', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Registrar movimentação' })).toBeVisible();
  await page.screenshot({ path: 'output/daily-cash-mobile.png', fullPage: true });
});

test('PDV can initiate checkout without manually opening or closing yesterday', async ({ page }) => {
  await page.route('**/api/pos/payment-options', route => route.fulfill({ json: {
    options: [{ provider: 'cash', label: 'Dinheiro', method: 'cash', channel: 'in_person' }], cashRegister: { isOpen: false, needsClosing: true, openedAt: '2026-10-28T12:00:00Z' },
  } }));
  await page.route('**/api/settings/personalization', route => route.fulfill({ json: { name: 'Loja de teste' } }));
  let initiated = false;
  await page.route('**/api/sales', route => {
    initiated = true;
    return route.fulfill({ status: 201, json: { sale: { id: 'sale-today', number: 1, totalAmount: '10.00' } } });
  });
  await page.goto('/cash.html?mode=pdv', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('combobox', { name: 'Forma de pagamento' })).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.getByText(/obrigatória|Feche o caixa do dia anterior/)).toHaveCount(0);
  await page.getByRole('button', { name: /F1 · Venda rápida/ }).click();
  await page.getByLabel('Valor da venda (R$)', { exact: true }).fill('10');
  await page.getByRole('button', { name: /Continuar para pagamento/ }).click();
  const charge = page.getByRole('button', { name: 'Cobrar R$ 10,00', exact: true });
  await expect(charge).toBeEnabled();
  await charge.click();
  await expect.poll(() => initiated).toBe(true);
});
