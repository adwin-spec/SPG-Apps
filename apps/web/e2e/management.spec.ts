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
  // Setiap kotak yang bereaksi saat disentuh kursor harus tetap terbaca (bug: kotak gelap berubah putih)
  const cards = page.locator('.glass-hover');
  for (let i = 0; i < Math.min(await cards.count(), 10); i++) {
    await cards.nth(i).hover(); await page.waitForTimeout(260);
    const ratio = await cards.nth(i).evaluate((el) => {
      const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
      const lum = ([r, g, b]: number[]) => { const f = (x: number) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const bg = rgb(getComputedStyle(el).backgroundColor); const fg = rgb(getComputedStyle(el.querySelector('div') ?? el).color);
      const a = (bg[3] ?? 1); const base = a < 0.5 ? [247, 247, 247] : bg.slice(0, 3); // kaca terang tembus ke latar #F7F7F7
      const L1 = lum(base), L2 = lum(fg.slice(0, 3)); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    });
    expect(ratio, `kotak ke-${i + 1} harus tetap terbaca saat di-hover`).toBeGreaterThan(3);
  }
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
