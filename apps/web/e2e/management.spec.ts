import { expect, test } from '@playwright/test';
import { ADMIN, adminApi, login, makeUser } from './helpers';

test('admin: semua halaman tampil tanpa error, data contoh mengisi ketiga dashboard, wilayah SPV bisa diatur', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  await adminApi('/admin/samples?n=60', 'POST');
  await login(page, ADMIN.username, ADMIN.password); await expect(page).toHaveURL(/\/dashboard/);
  for (const t of ['Grosir', 'HORECA', 'Reguler']) {
    await page.getByRole('button', { name: t, exact: true }).click();
    await expect(page.locator('.num').first()).toBeVisible();
  }
  await expect(page.getByText('Share of shelf').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/admin-dashboard-reguler.png', fullPage: true });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Unduh Excel' }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^tanda-tambah-reguler-30hari\.xlsx$/);
  await page.getByRole('button', { name: /Kab\. Banyumas|Kab\. Cilacap|Kab\. Purbalingga|Kab\. Banjarnegara/ }).first().click();  // drill-down wilayah
  await expect(page.getByLabel('Kecamatan')).toBeEnabled();
  const spv = await makeUser('SPV', 'Rudi Hartono');
  await page.goto('/users');
  const block = page.locator(`[data-spv="${spv.username}"]`);
  await block.getByLabel(/Cari kecamatan/).fill('Sokaraja'); await page.getByRole('button', { name: /^Sokaraja/ }).first().click();
  await expect(block.getByText('Kec. Sokaraja · Kab. Banyumas')).toBeVisible();
  for (const p of ['/review', '/settings', '/wilayah', '/audit']) { await page.goto(p); await expect(page.locator('h1')).toBeVisible(); }
  await adminApi('/admin/samples', 'DELETE');
  expect(errors).toEqual([]);
});

test('SPG tidak bisa membuka halaman manajemen', async ({ page }) => {
  const spg = await makeUser('SPG', 'Citra Dewi', ['GROSIR']);
  await login(page, spg.username, spg.password); await expect(page).toHaveURL(/\/m$/);
  await page.goto('/dashboard'); await expect(page).toHaveURL(/\/m$/);
});
