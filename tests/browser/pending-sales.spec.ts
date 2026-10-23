import { test, expect } from '@playwright/test';

test('confirma Pix manual pela tela recuperada', async ({ page }) => {
  await page.route('**/api/sales/sale-a/payments/attempt-a/confirm', async route => {
    expect(route.request().method()).toBe('POST');
    await route.fulfill({ json: { status: 'approved' } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Confirmar recebimento' }).click();
  await expect(page.getByRole('status')).toHaveText('Dados da venda atualizados');
});

test('cancelamento exige confirmação e permite desistir', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/sales/sale-a/cancel', async route => {
    calls++;
    expect(route.request().postDataJSON()).toEqual({ cashRefunded: false });
    await route.fulfill({ json: { status: 'cancelled' } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Cancelar venda', exact: true }).click();
  await page.getByRole('button', { name: 'Manter venda', exact: true }).click();
  expect(calls).toBe(0);
  await page.getByRole('button', { name: 'Cancelar venda', exact: true }).click();
  await page.getByRole('button', { name: 'Sim, cancelar venda' }).click();
  await expect(page.getByRole('status')).toBeVisible();
  expect(calls).toBe(1);
});

test('parcela em dinheiro exige confirmação da devolução', async ({ page }) => {
  const bodies: unknown[] = [];
  await page.route('**/api/sales/sale-a/cancel', async route => {
    const body = route.request().postDataJSON(); bodies.push(body);
    await route.fulfill(body.cashRefunded
      ? { json: { status: 'cancelled' } }
      : { status: 409, json: { cashRefundRequired: true, cashToReturn: '10.00' } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Cancelar venda', exact: true }).click();
  await page.getByRole('button', { name: 'Sim, cancelar venda' }).click();
  await expect(page.getByText('Devolva o dinheiro antes de cancelar')).toBeVisible();
  await page.getByRole('button', { name: 'Já devolvi o dinheiro. Cancelar venda' }).click();
  await expect(page.getByRole('status')).toBeVisible();
  expect(bodies).toEqual([{ cashRefunded: false }, { cashRefunded: true }]);
});

test('erro do provedor aparece e mantém ações disponíveis', async ({ page }) => {
  await page.route('**/api/sales/sale-a/cancel', route => route.fulfill({ status: 409, json: { error: 'A cobrança continua ativa no gateway.' } }));
  await page.goto('/?mode=online');
  await expect(page.getByRole('button', { name: 'Confirmar recebimento' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancelar venda', exact: true }).click();
  await page.getByRole('button', { name: 'Sim, cancelar venda' }).click();
  await expect(page.getByRole('alert')).toHaveText('A cobrança continua ativa no gateway.');
  await expect(page.getByRole('button', { name: 'Sim, cancelar venda' })).toBeEnabled();
});

for (const mode of ['expired', 'other-operator']) {
  test(`não oferece confirmação manual: ${mode}`, async ({ page }) => {
    await page.goto(`/?mode=${mode}`);
    await expect(page.getByRole('button', { name: 'Confirmar recebimento' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cancelar venda', exact: true })).toBeVisible();
  });
}
