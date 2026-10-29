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
  await expect(page.locator('article').getByText('R$ 12,00', { exact: true })).toHaveCount(2);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('article').getByText('R$ 150,00', { exact: true })).toHaveCount(0);
  await page.getByLabel('Dia para consultar').selectOption('old');
  await expect(page.locator('article').getByText('R$ 150,00', { exact: true })).toBeVisible();
  await expect(page.locator('article').getByText('R$ 12,00', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Registrar movimentação' })).toHaveCount(0);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.getByLabel('Dia para consultar').selectOption('');
  await expect(page.locator('article').getByText('R$ 150,00', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Registrar movimentação' })).toBeVisible();
  await page.screenshot({ path: 'output/daily-cash-mobile.png', fullPage: true });
});

test('top button closes the selected previous day and never submits today by mistake', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const writes: unknown[] = [];
  let closed = false;
  const current = { id: 'today', initialAmount: '0.00', expectedAmount: '12.00', openedAt: '2026-10-29T12:00:00Z', needsClosing: false, pendingIssues: [], movements: [], totals: { cashSales: '12.00', cashCreditReceipts: '0.00', supplies: '0.00', withdrawals: '0.00' } };
  await page.route('**/api/cash-register/session**', async route => {
    if (route.request().method() === 'PATCH') {
      writes.push(route.request().postDataJSON()); closed = true;
      return route.fulfill({ json: { session: { expectedAmount: '150.00', declaredAmount: '150.00', differenceAmount: '0.00' } } });
    }
    return route.fulfill({ json: { previousDays: closed ? [] : [{ id: 'old', openedAt: '2026-10-28T12:00:00Z' }], session: route.request().url().includes('sessionId=old')
      ? closed ? null : { ...current, id: 'old', expectedAmount: '150.00', openedAt: '2026-10-28T12:00:00Z', needsClosing: true } : current } });
  });
  await page.route('**/api/settings/personalization', route => route.fulfill({ json: { name: 'Loja de teste' } }));
  await page.goto('/cash.html', { waitUntil: 'domcontentloaded' });
  const close = page.getByRole('button', { name: 'Fechar caixa', exact: true });
  await expect(close).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Abrir caixa', exact: true })).toBeInViewport();
  await close.click();
  const modal = page.getByRole('dialog', { name: 'Fechar caixa', exact: true });
  await expect(modal.getByLabel('Caixa a fechar')).toHaveValue('old');
  await expect(modal.getByText('R$ 150,00', { exact: true })).toBeVisible();
  await expect(modal.getByText('Caixa de 28/10/2026', { exact: true })).toBeVisible();
  await modal.getByLabel('Valor contado em R$').fill('15000');
  await page.screenshot({ path: 'output/close-previous-cash-mobile.png', fullPage: true });
  await modal.getByRole('button', { name: 'Confirmar fechamento' }).click();
  await expect(modal).not.toBeVisible();
  expect(writes).toEqual([{ sessionId: 'old', declaredAmount: 150 }]);
  await expect(page.locator('article').getByText('R$ 12,00', { exact: true })).toHaveCount(2);
});

test('manual opening has a top button and does not carry the previous float', async ({ page }) => {
  const writes: unknown[] = [];
  await page.route('**/api/cash-register/session**', async route => {
    if (route.request().method() === 'POST') writes.push(route.request().postDataJSON());
    return route.fulfill({ status: route.request().method() === 'POST' ? 201 : 200, json: { session: null, previousDays: [{ id: 'old', openedAt: '2026-10-28T12:00:00Z' }] } });
  });
  await page.route('**/api/settings/personalization', route => route.fulfill({ json: { name: 'Loja de teste' } }));
  await page.goto('/cash.html', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Abrir caixa', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Abrir caixa de hoje' });
  await modal.getByLabel('Fundo de troco inicial').fill('5000');
  await modal.getByRole('button', { name: 'Confirmar abertura' }).click();
  await expect(modal).not.toBeVisible();
  expect(writes).toEqual([{ initialAmount: 50 }]);
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

for (const action of ['open', 'close']) {
  test(`PDV top shortcut opens the ${action} window directly`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const writes: string[] = [];
    await page.route('**/api/pos/payment-options', route => route.fulfill({ json: { options: [{ provider: 'cash', label: 'Dinheiro', method: 'cash', channel: 'in_person' }] } }));
    await page.route('**/api/settings/personalization', route => route.fulfill({ json: { name: 'Loja de teste' } }));
    await page.route('**/api/cash-register/session**', route => {
      if (route.request().method() !== 'GET') writes.push(route.request().method());
      return route.fulfill({ json: {
        previousDays: [{ id: 'old', openedAt: '2026-10-28T12:00:00Z' }],
        session: route.request().url().includes('sessionId=old') ? { id: 'old', initialAmount: '0.00', expectedAmount: '150.00', openedAt: '2026-10-28T12:00:00Z', needsClosing: true, pendingIssues: [], movements: [], totals: { cashSales: '150.00', cashCreditReceipts: '0.00', supplies: '0.00', withdrawals: '0.00' } } : null,
      } });
    });
    await page.route(`**/caixa?action=${action}`, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><script>window.process={env:{NODE_ENV:"development"}};</script><div id="root"></div><script type="module" src="/cash.jsx"></script></body></html>' }));
    await page.goto('/cash.html?mode=pdv', { waitUntil: 'domcontentloaded' });
    const shortcut = page.getByRole('button', { name: action === 'open' ? 'Abrir caixa' : 'Fechar caixa', exact: true });
    await expect(shortcut).toBeInViewport();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    if (action === 'close') await page.screenshot({ path: 'output/pdv-cash-buttons-mobile.png', fullPage: true });
    await shortcut.click();
    await expect(page).toHaveURL(new RegExp(`/caixa\\?action=${action}$`));
    const modal = page.getByRole('dialog', { name: action === 'open' ? 'Abrir caixa de hoje' : 'Fechar caixa', exact: true });
    await expect(modal).toBeVisible();
    if (action === 'close') {
      await expect(modal.getByLabel('Caixa a fechar')).toHaveValue('old');
      await expect(modal.getByText('R$ 150,00', { exact: true })).toBeVisible();
    } else {
      await expect(modal.getByLabel('Fundo de troco inicial')).toBeVisible();
    }
    expect(writes).toEqual([]);
  });
}
