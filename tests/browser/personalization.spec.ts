import { expect, test } from '@playwright/test';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jH9kAAAAASUVORK5CYII=', 'base64');

test('login uses email/password, selects ambiguous stores, then requests the security code', async ({ page }) => {
  let starts = 0;
  await page.route('**/api/auth/security/start', async route => {
    const input = route.request().postDataJSON();
    expect(input.email).toBe('owner@example.com'); expect(input.password).toBe('Password123!');
    starts++;
    if (starts === 1) { expect(input.tenantChoice).toBeUndefined(); await route.fulfill({ json: { stores: [{ id: 'tenant-a', name: 'Loja A' }, { id: 'tenant-b', name: 'Loja B' }] } }); }
    else { expect(input.tenantChoice).toBe('tenant-b'); await route.fulfill({ json: { challengeId: 'c'.repeat(25), email: input.email } }); }
  });
  await page.route('**/api/auth/security/verify', route => route.fulfill({ status: 400, json: { error: 'Código inválido ou expirado.' } }));
  await page.goto('/personalization.html?mode=login');
  await expect(page.getByLabel('Identificador da loja', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Esqueci minha senha' })).toHaveAttribute('href', '/recuperar-senha');
  await page.getByLabel('E-mail', { exact: true }).fill('owner@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('Password123!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByLabel('Escolha a loja').selectOption('tenant-b');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Confira seu e-mail' })).toBeVisible();
  await page.getByLabel('Código de segurança', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Confirmar código' }).click();
  await expect(page.getByRole('status')).toContainText('Código inválido');
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
