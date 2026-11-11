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
  for (const [item, file] of [['SPG Grosir', 'tanda-tambah-grosir-30hari.xlsx'], ['Survei HORECA', 'tanda-tambah-horeca-30hari.xlsx'], ['SPG Reguler', 'tanda-tambah-reguler-30hari.xlsx'], ['Ketiganya (.zip)', 'tanda-tambah-semua-30hari.zip']]) {
    await page.getByRole('button', { name: 'Unduh Excel' }).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: new RegExp('^' + item.replace(/[().]/g, '\\$&')) }).click()]);
    expect(dl.suggestedFilename()).toBe(file);
  }
  await page.getByRole('button', { name: 'Tabel' }).first().click();                       // setiap grafik punya tampilan tabel
  await expect(page.locator('table').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Insight' })).toBeVisible();
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
