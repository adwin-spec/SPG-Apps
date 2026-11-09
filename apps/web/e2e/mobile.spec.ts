import { expect, test } from '@playwright/test';
import { collectErrors, login } from './helpers';

const API = process.env.API_URL ?? 'http://localhost:4000/api/v1';

test('SPG Reguler completes a visit fully offline and it syncs exactly once', async ({ page, context, request }) => {
  const email = 'demo-spg-006@demo.tanda-tambah.local';
  const tok = (await (await request.post(`${API}/auth/login`, { data: { email, password: 'Demo12345!' } })).json()).data.accessToken;
  const h = { Authorization: `Bearer ${tok}` };
  const boot = (await (await request.get(`${API}/field/bootstrap`, { headers: h })).json()).data;
  const o = boot.outlets[1];
  const count = async (p: string) => (await (await request.get(`${API}${p}`, { headers: h })).json()).meta.total as number;
  const before = { orders: await count('/regular/orders?mine=true'), visits: await count('/visits?mine=true') };
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: Number(o.latitude), longitude: Number(o.longitude), accuracy: 10 });
  const errors = collectErrors(page);
  await login(page, email);
  await expect(page).toHaveURL(/\/m/);
  await expect(page.getByRole('heading', { name: 'Attendance' })).toBeVisible();
  if (await page.getByRole('button', { name: 'Check in', exact: true }).count()) await page.getByRole('button', { name: 'Check in', exact: true }).click();
  await expect(page.getByText(/Checked in/)).toBeVisible();
  await page.goto(`/m?s=outlets&start=${o.id}`);
  await expect(page.getByRole('button', { name: 'Check in at outlet' })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Check in at outlet' }).click();
  await page.getByRole('tab', { name: 'Order' }).click();
  await page.getByLabel('SKU').selectOption({ index: 1 });
  await page.getByLabel('Quantity').fill('3');
  await page.getByRole('button', { name: 'Save order' }).click();
  await expect(page.getByText(/Outlet order ·/)).toBeVisible();
  await page.getByRole('button', { name: 'Check out of outlet' }).click();
  await expect(page.locator('header').getByText(/Offline · 3/)).toBeVisible();
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('header').getByText('Synced')).toBeVisible({ timeout: 30_000 });
  expect(await count('/regular/orders?mine=true')).toBe(before.orders + 1);
  expect(await count('/visits?mine=true')).toBe(before.visits + 1);
  expect(errors).toEqual([]);
});
