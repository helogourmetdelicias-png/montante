import { expect, test, type BrowserContext, type Page } from '@playwright/test';

test.setTimeout(60000);
function fixture() {
  const preparedAt = new Date(Date.now() - 60_000).toISOString();
  return { tenantId: 'store-a', userId: 'user-a', storeName: 'Loja de teste', operatorName: 'Operador de teste', preparedAt, expiresAt: new Date(Date.now() + 86400_000).toISOString(), ticket: 'a'.repeat(64), products: [
    { id: 'usb', name: 'Cabo USB', sku: 'USB01', barcode: '123456', price: '10.00', stockQuantity: '3.000', unitOfMeasure: 'un', sellByFraction: false, signature: 'b'.repeat(64) },
    { id: 'kg', name: 'Produto fracionado', sku: 'KG', barcode: null, price: '7.99', stockQuantity: '5.000', unitOfMeasure: 'kg', sellByFraction: true, signature: 'c'.repeat(64) },
  ] };
}
async function prepare(page: Page, context: BrowserContext, data = fixture()) {
  await context.route('**/api/pos/offline', route => route.fulfill({ json: data }));
  await page.goto('/offline-setup.html');
  await expect(page.getByRole('button', { name: 'Offline pronto', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Offline pronto', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Loja de teste' })).toBeVisible();
}
async function saveQuick(page: Page, amount = '25,90', received = '30,00') {
  await page.getByLabel('Valor da venda (R$)', { exact: true }).fill(amount);
  await page.getByLabel('Dinheiro recebido (R$)', { exact: true }).fill(received);
  await page.getByRole('button', { name: 'Concluir e salvar no aparelho', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Venda salva neste aparelho');
}

test('prepares shell, transfers draft, reloads offline, stores cash and synchronizes original immutable id', async ({ page, context }) => {
  const commits = new Map<string, unknown>();
  await context.route('**/api/pos/offline/sync', route => {
    const sale = route.request().postDataJSON(); commits.set(sale.id, sale);
    return route.fulfill({ json: { sale: { id: 'server-a', saleNumber: 101 } } });
  });
  await prepare(page, context);
  await expect(page.getByLabel('Valor da venda (R$)')).toHaveValue('12,50');
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#status')).toContainText('Sem internet');
  await saveQuick(page);
  await expect(page.locator('#status')).toContainText('1 venda(s) aguardando envio');
  await expect(page.getByRole('alert')).toContainText('Troco: R$ 4,10');
  await page.reload();
  await expect(page.locator('#sales')).toContainText('R$ 25,90');
  await expect(page.locator('#status')).toContainText('1 venda(s)');
  const local = await page.evaluate(async () => { const db = await import(String('/offline/storage.js')); return db.readSales('store-a:user-a'); });
  await page.goto('/pdv'); // Real service-worker navigation fallback, not a mocked HTML page.
  await expect(page.getByRole('heading', { name: 'Loja de teste' })).toBeVisible();
  await context.setOffline(false);
  await expect(page.locator('#sales')).toContainText('Enviada · venda #101');
  expect(commits.size).toBe(1);
  expect(commits.get(local[0].id)).toMatchObject({ occurredAt: local[0].sale.occurredAt, id: local[0].id, receivedCents: 3000, quickCents: 2590 });
  await page.screenshot({ path: 'output/pdv-offline-desktop.png', fullPage: true });
});

test('fractional products, stock debit across reload and insufficient cash protection', async ({ page, context }) => {
  await prepare(page, context); await context.setOffline(true);
  await page.getByRole('button', { name: 'Com produtos', exact: true }).click();
  await page.getByRole('button', { name: /Produto fracionado ·/ }).click();
  await page.getByRole('spinbutton', { name: 'Quantidade de Produto fracionado' }).fill('0.125');
  await expect(page.locator('#total')).toHaveText('R$ 1,00');
  await page.getByLabel('Dinheiro recebido (R$)').fill('0,99');
  await expect(page.locator('#save')).toBeDisabled();
  await page.getByLabel('Dinheiro recebido (R$)').fill('2,00');
  await page.locator('#save').click();
  await expect(page.getByRole('alert')).toContainText('Venda salva');
  await page.reload();
  await page.getByRole('button', { name: 'Com produtos', exact: true }).click();
  await expect(page.getByRole('button', { name: /Produto fracionado ·/ })).toContainText('4.875 kg');
  await page.getByRole('button', { name: /Cabo USB ·/ }).click();
  await page.getByRole('spinbutton', { name: 'Quantidade de Cabo USB' }).fill('4');
  await page.getByLabel('Dinheiro recebido (R$)').fill('100,00');
  await expect(page.locator('#save')).toBeDisabled();
  await page.getByRole('spinbutton', { name: 'Quantidade de Cabo USB' }).fill('2');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'output/pdv-offline-mobile.png', fullPage: true });
});

test('lost acknowledgement retries same id, and conflicts stay saved with export', async ({ page, context }) => {
  const commits = new Set<string>(); let requests = 0;
  await context.route('**/api/pos/offline/sync', async route => {
    const sale = route.request().postDataJSON(); requests++; commits.add(sale.id);
    if (requests === 1) return route.abort('failed');
    if (requests === 2) return route.fulfill({ status: 409, json: { error: 'Estoque insuficiente. Confira a venda pendente.' } });
    return route.fulfill({ json: { sale: { id: 'server-replay', saleNumber: 202, replayed: true } } });
  });
  await prepare(page, context); await context.setOffline(true); await saveQuick(page);
  await context.setOffline(false);
  await expect.poll(() => requests).toBe(1);
  await page.getByRole('button', { name: 'Enviar pendentes' }).click();
  await expect(page.locator('#sales')).toContainText('Estoque insuficiente');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Salvar cópia das vendas' }).click();
  expect((await download).suggestedFilename()).toContain('montante-vendas-offline-');
  await page.reload();
  await expect(page.locator('#sales')).toContainText('Enviada · venda #202');
  expect(commits.size).toBe(1);
});

test('expired catalog blocks new sales and retains access to history', async ({ page, context }) => {
  const data = fixture(); data.expiresAt = new Date(Date.now() - 1000).toISOString();
  await prepare(page, context, data);
  await expect(page.locator('#status')).toContainText('Catálogo vencido');
  await expect(page.getByLabel('Valor da venda (R$)')).toBeDisabled();
  await expect(page.locator('#save')).toBeDisabled();
});

test('switching operator never exposes or sends a different operator queue', async ({ page, context }) => {
  await prepare(page, context); await context.setOffline(true); await saveQuick(page);
  await page.evaluate(async () => { const db = await import(String('/offline/storage.js')); await db.writeMeta('active', null); });
  await page.reload();
  await expect(page.locator('#status')).toContainText('ainda não foi preparado');
  await expect(page.locator('#workspace')).toBeHidden();
  const saved = await page.evaluate(async () => { const db = await import(String('/offline/storage.js')); return db.readSales('store-a:user-a'); });
  expect(saved).toHaveLength(1); expect(saved[0].status).toBe('pending');
});

test('logout invalidates offline identity through the service worker without deleting pending sales', async ({ page, context }) => {
  await prepare(page, context);
  await context.route('**/api/pos/offline/sync', route => route.abort());
  await saveQuick(page);
  await context.route('**/api/auth/signout', route => route.fulfill({ json: { url: '/login' } }));
  await page.evaluate(() => fetch('/api/auth/signout', { method: 'POST' }));
  await page.reload();
  await expect(page.locator('#status')).toContainText('ainda não foi preparado');
  const saved = await page.evaluate(async () => { const db = await import(String('/offline/storage.js')); return db.readSales('store-a:user-a'); });
  expect(saved).toHaveLength(1);
});

test('two tabs cannot oversell the same cached stock', async ({ page, context }) => {
  await prepare(page, context); await context.setOffline(true);
  const second = await context.newPage(); await second.goto('/offline/index.html');
  for (const tab of [page, second]) {
    await tab.getByRole('button', { name: 'Com produtos', exact: true }).click();
    await tab.getByRole('button', { name: /Cabo USB ·/ }).click();
    await tab.getByRole('spinbutton', { name: 'Quantidade de Cabo USB' }).fill('2');
    await tab.getByLabel('Dinheiro recebido (R$)').fill('20,00');
  }
  await page.locator('#save').click(); await expect(page.getByRole('alert')).toContainText('Venda salva');
  await second.locator('#save').click();
  await expect(second.getByRole('alert')).toContainText('estoque salvo no aparelho é insuficiente');
  const saved = await page.evaluate(async () => { const db = await import(String('/offline/storage.js')); return db.readSales('store-a:user-a'); });
  expect(saved).toHaveLength(1);
});

test('storage failure never shows a sale as completed and leaves amount in the form', async ({ page, context }) => {
  await prepare(page, context); await context.setOffline(true);
  await page.evaluate(() => {
    const real = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function(...args) { if (this.name === 'sales') throw new DOMException('Sem espaço', 'QuotaExceededError'); return real.apply(this, args); };
  });
  await page.getByLabel('Dinheiro recebido (R$)').fill('20,00');
  await page.locator('#save').click();
  await expect(page.getByRole('alert')).toContainText('A venda não foi concluída');
  await expect(page.getByLabel('Valor da venda (R$)')).toHaveValue('12,50');
  await expect(page.locator('#status')).toContainText('0 venda(s)');
});
