import { expect, test } from '@playwright/test';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jH9kAAAAASUVORK5CYII=', 'base64');

test('material offers niche suggestions, accepts custom text and stays hidden for beverages', async ({ page }) => {
  await page.goto('/personalization.html?mode=material');
  const field = page.getByLabel('Material (opcional)', { exact: true });
  await expect(field).toBeVisible();
  await expect(field).toHaveAttribute('list', /-options$/);
  await expect(page.locator('datalist option[value="Algodão"]')).toHaveCount(1);
  await field.fill('Linho artesanal');
  await expect(field).toHaveValue('Linho artesanal');
  for (const [niche, suggestion] of [['CONSTRUCTION', 'PVC'], ['COSMETICS', 'Vidro']]) {
    await page.getByLabel('Nicho').selectOption(niche);
    await expect(field).toBeVisible();
    await expect(page.locator(`datalist option[value="${suggestion}"]`)).toHaveCount(1);
  }
  for (const niche of ['PHONE_REPAIR', 'IT_SUPPORT', 'BEVERAGES', 'OTHER']) {
    await page.getByLabel('Nicho').selectOption(niche);
    await expect(field).toHaveCount(0);
  }
});

test('saved tenant logo appears without cropping and refreshes after personalization', async ({ page }) => {
  let logo = '/api/media/clogo-one';
  await page.route('**/api/settings/personalization', route => route.fulfill({ json: { name: 'Minha loja', logoUrl: logo } }));
  await page.route('**/api/media/*', route => route.fulfill({ contentType: 'image/png', body: png }));
  await page.goto('/personalization.html?mode=brand');
  const image = page.getByAltText('Logo de Minha loja');
  await expect(image).toHaveAttribute('src', '/api/media/clogo-one');
  await expect(image).toHaveCSS('object-fit', 'contain');
  logo = '/api/media/clogo-two';
  await page.getByRole('button', { name: 'Atualizar logo' }).click();
  await expect(image).toHaveAttribute('src', '/api/media/clogo-two');
  logo = '';
  await page.getByRole('button', { name: 'Atualizar logo' }).click();
  await expect(image).toHaveCount(0);
  await expect(page.getByText('Minha loja', { exact: true })).toBeVisible();
});

test('admin changes plans and requires the exact store slug before deletion', async ({ page }) => {
  const requests: { method: string; body: unknown }[] = [];
  await page.route('**/api/admin/stores/qa-store', async route => { requests.push({ method: route.request().method(), body: route.request().postDataJSON() }); await route.fulfill({ json: { ok: true } }); });
  await page.goto('/personalization.html?mode=admin');
  await page.getByRole('button', { name: 'Gerenciar loja' }).click();
  await page.getByLabel('Plano', { exact: true }).selectOption('free');
  await page.getByRole('button', { name: 'Salvar plano' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(requests).toEqual([{ method: 'PATCH', body: { plan: 'free' } }]);
  await page.getByRole('button', { name: 'Gerenciar loja' }).click();
  await expect(page.getByRole('button', { name: 'Excluir definitivamente' })).toBeDisabled();
  await page.getByLabel('Digite loja-teste para confirmar').fill('outra-loja');
  await expect(page.getByRole('button', { name: 'Excluir definitivamente' })).toBeDisabled();
  await page.getByLabel('Digite loja-teste para confirmar').fill('loja-teste');
  await page.screenshot({ path: 'test-results/admin-store-management.png' });
  await page.getByRole('button', { name: 'Excluir definitivamente' }).click();
  expect(requests.at(-1)).toEqual({ method: 'DELETE', body: { confirmation: 'loja-teste' } });
});

test('login uses email/password, selects ambiguous stores, preserves direct login without a security code', async ({ page }) => {
  let starts = 0;
  await page.route('**/api/auth/security/start', async route => {
    const input = route.request().postDataJSON();
    expect(input.email).toBe('owner@example.com'); expect(input.password).toBe('Password123!');
    starts++;
    if (starts === 1) { expect(input.tenantChoice).toBeUndefined(); await route.fulfill({ json: { stores: [{ id: 'tenant-a', name: 'Loja A' }, { id: 'tenant-b', name: 'Loja B' }] } }); }
    else { expect(input.tenantChoice).toBe('tenant-b'); await route.fulfill({ status: 401, json: { error: 'Credencial recusada no teste.' } }); }
  });
  await page.route('**/api/auth/security/verify', route => route.fulfill({ status: 400, json: { error: 'Código inválido ou expirado.' } }));
  await page.goto('/personalization.html?mode=login');
  await expect(page.getByLabel('Identificador da loja', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Salvar esta conta neste computador', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Salvar login e senha no navegador')).toBeChecked();
  await expect(page.getByLabel('Senha', { exact: true })).toHaveAttribute('autocomplete', 'current-password');
  await expect(page.getByRole('link', { name: 'Esqueci minha senha' })).toHaveAttribute('href', '/recuperar-senha');
  await page.getByLabel('E-mail', { exact: true }).fill('owner@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('Password123!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByLabel('Escolha a loja').selectOption('tenant-b');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Credencial recusada no teste.');
  await expect(page.getByRole('heading', { name: 'Confira seu e-mail' })).toHaveCount(0);
});

test('gallery and camera preview before upload and save the screensaver only after confirmation', async ({ page }) => {
  let uploads = 0;
  await page.route('**/api/media', async route => { uploads++; await route.fulfill({ status: 201, json: { url: `/api/media/c${'a'.repeat(24)}` } }); });
  await page.route('**/api/media/*', route => route.fulfill({ contentType: 'image/png', body: png }));
  await page.route('**/api/settings/screensaver', async route => {
    expect(route.request().method()).toBe('PATCH');
    expect(route.request().postDataJSON()).toEqual({ minutes: 5, imageUrl: `/api/media/c${'a'.repeat(24)}` });
    await route.fulfill({ json: { success: true } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/personalization.html');
  await expect(page.getByLabel('Fotografar Imagem da proteção de tela')).toHaveAttribute('capture', 'environment');
  await expect(page.getByLabel('Selecionar Imagem da proteção de tela')).not.toHaveAttribute('capture', 'environment');
  await page.getByLabel('Selecionar Imagem da proteção de tela').setInputFiles({ name: 'banner.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByAltText('Prévia: Imagem da proteção de tela')).toBeVisible();
  expect(uploads).toBe(0);
  await expect(page.getByRole('button', { name: 'Salvar proteção de tela' })).toBeDisabled();
  await page.getByRole('button', { name: 'Usar esta imagem' }).click();
  expect(uploads).toBe(1);
  await page.getByLabel('Ativar após').selectOption('5');
  await page.getByRole('button', { name: 'Salvar proteção de tela' }).click();
  await expect(page.getByRole('status')).toContainText('Proteção de tela salva');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/profile-personalization-mobile.png', fullPage: true });
});

test('inactivity banner consumes the first click/key without losing or submitting the sale', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-28T12:00:00Z') });
  await page.route('**/banner-test.png', route => route.fulfill({ contentType: 'image/png', body: png }));
  await page.route('**/api/settings/screensaver', route => route.fulfill({ json: { minutes: 2, imageUrl: '/banner-test.png' } }));
  await page.goto('/personalization.html?mode=screensaver');
  const button = page.getByRole('button', { name: 'Registrar venda de teste' });
  const box = await button.boundingBox();
  await page.clock.fastForward(120001);
  await expect(page.getByRole('dialog', { name: 'Proteção de tela do PDV' })).toBeVisible();
  await page.mouse.move(5, 5);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByText('Vendas registradas: 0')).toBeVisible();
  await expect(page.getByLabel('Valor da venda')).toHaveValue('25,90');
  await page.clock.fastForward(501);
  await button.click();
  await expect(page.getByText('Vendas registradas: 1')).toBeVisible();
  await page.clock.fastForward(120001);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByText('Vendas registradas: 1')).toBeVisible();
});


test('technical product saves unit cost without a composition field', async ({ page }) => {
  let saved: any;
  await page.route('**/api/products**', async route => {
    if (route.request().method() === 'POST') { saved = route.request().postDataJSON(); await route.fulfill({ json: { product: { id: 'qa' } } }); }
    else await route.fulfill({ json: { products: [], total: 0, categories: [] } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/personalization.html?mode=product-cost');
  await page.getByRole('button', { name: 'Novo produto' }).click();
  await expect(page.getByLabel('Material (opcional)', { exact: true })).toHaveCount(0);
  await page.getByLabel('Nome do produto', { exact: true }).fill('SSD 240 GB');
  await page.getByLabel('Preço de venda (R$)', { exact: true }).fill('150,00');
  await page.getByLabel('Custo por unidade do produto / material (R$)').fill('80,50');
  await page.getByRole('button', { name: 'Salvar produto' }).click();
  await expect.poll(() => saved?.costPrice).toBe(80.5);
  expect(saved.price).toBe(150);
});

test('service separates internal materials from the customer quote', async ({ page }) => {
  await page.route('**/api/service-orders/parts**', route => route.fulfill({ json: { products: [{ id: 'qa', name: 'SSD 240 GB', price: '150.00', costPrice: '80.50', stock: '10', fractional: false }] } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/personalization.html?mode=service-cost');
  await page.getByRole('button', { name: 'Adicionar peça' }).click();
  await expect(page.getByLabel('Custo unitário da peça (R$)')).toHaveValue('80,50');
  await page.getByLabel('Materiais extras usados no serviço (R$)').fill('5,00');
  await expect(page.getByText('Custo total das peças e materiais:')).toContainText('85,50');
  await expect(page.getByText('Total da O.S.').locator('..')).toContainText('150,00');
  await page.getByLabel('Custo unitário da peça (R$)').fill('');
  await expect(page.getByText('Custo total das peças e materiais:')).toContainText('Pendente de informação');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/service-material-cost-mobile.png', fullPage: true });
});
