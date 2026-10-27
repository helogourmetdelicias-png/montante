import { test, expect } from '@playwright/test';

test('dashboard supports keyboard day selection and reveals underlying chart values', async ({ page }) => {
  await page.goto('/dashboard.html');
  await expect(page.getByRole('heading', { name: 'Seu negócio, em perspectiva.' })).toBeVisible();
  const slider = page.getByRole('slider');
  await slider.focus();
  await page.keyboard.press('Home');
  await expect(slider).toHaveAttribute('aria-valuetext', /01\/10\/2026/);
  await page.getByText('Ver dados do gráfico', { exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(7);
  await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true });
});

test('dashboard fits a mobile screen and handles a period without sales', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard.html');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/dashboard-mobile.png', fullPage: true });
  await page.goto('/dashboard.html?empty=1');
  await expect(page.getByText('Nenhuma venda concluída neste período.')).toBeVisible();
  await expect(page.getByText('Sem pagamentos aprovados.', { exact: true })).toBeVisible();
  expect(await page.locator('body').innerText()).not.toMatch(/NaN|Infinity/);
});
