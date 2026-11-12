import { expect, test } from '@playwright/test';
import { ADMIN, adminApi, login, makeUser, userApi } from './helpers';

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
  await expect(page.locator('.tt-map')).toBeVisible();                                   // peta lokasi
  await expect(page.locator('.tt-map canvas').first()).toBeAttached();                   // titik digambar di canvas (ringan untuk ribuan titik)
  await expect(page.getByText(/[1-9][\d.]* titik kunjungan outlet · mengikuti filter/)).toBeVisible();
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

test('admin menghapus laporan dengan alasan, lalu memulihkannya', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  const spg = await makeUser('SPG', 'Hapus Uji', ['REGULER']);
  const id = crypto.randomUUID(); const gps = { lat: -7.43, lon: 109.25, acc: 10 };
  await userApi(spg.username, spg.password, `/reports/${id}`, 'PUT', { type: 'REGULER', header: { kecRute: { kode: '33.02.20' }, lokasi: gps }, entries: [
    { gps, namaOutlet: 'Toko Hapus', tipeOutlet: 'Kios', kecOutlet: { kode: '33.02.20' }, statusOutlet: 'BELUM', facingTotal: 10, posm: 'Tidak ada', beli: { Original: 1 }, kompetitor: 'Surya 16', promoKomp: 'Diskon' }] });
  await userApi(spg.username, spg.password, `/reports/${id}/submit`, 'POST');
  await login(page, ADMIN.username, ADMIN.password); await expect(page).toHaveURL(/dashboard/); await page.goto('/review');
  const row = page.locator('tr', { hasText: 'Hapus Uji' }).first();
  await row.getByRole('button', { name: 'Detail' }).click();
  const drawer = page.getByRole('dialog'); await expect(drawer.getByText('GPS awal rute:')).toBeVisible();
  await drawer.getByRole('button', { name: 'Hapus', exact: true }).click();
  await page.getByLabel('Alasan penghapusan').fill('Laporan ganda');
  await page.getByRole('dialog', { name: 'Hapus laporan ini?' }).getByRole('button', { name: 'Hapus' }).click();
  await expect(page.getByText('1 laporan dihapus')).toBeVisible();
  await page.getByRole('button', { name: 'Dihapus', exact: true }).click();
  const gone = page.locator('tr', { hasText: 'Hapus Uji' }).first(); await expect(gone).toContainText('Laporan ganda');
  await gone.getByRole('button', { name: 'Pulihkan' }).click();
  await expect(page.getByText('Dipulihkan')).toBeVisible();
  expect(errors).toEqual([]);
});

test('supervisor menghapus satu isian salah dari laporan SPG; jejaknya tetap tercatat', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  const spv = await makeUser('SPV', 'Sinta Supervisor');
  await adminApi(`/users/${spv.id}/coverage`, 'POST', { level: 'KAB', kode: '33.02' });
  const spg = await makeUser('SPG', 'Isian Ganda', ['REGULER']);
  const id = crypto.randomUUID(); const gps = { lat: -7.43, lon: 109.25, acc: 10 };
  const outlet = (n: string, at: string) => ({ gps, namaOutlet: n, tipeOutlet: 'Kios', kecOutlet: { kode: '33.02.20' }, statusOutlet: 'BELUM', facingTotal: 10, posm: 'Tidak ada', beli: { Original: 1 }, kompetitor: 'Surya 16', promoKomp: 'Diskon', at });
  await userApi(spg.username, spg.password, `/reports/${id}`, 'PUT', { type: 'REGULER', header: { kecRute: { kode: '33.02.20' }, lokasi: gps },
    entries: [outlet('Toko Asli', '2026-11-12T01:00:00+00:00'), outlet('Toko Dobel', '2026-11-12T02:00:00+00:00')] });
  await userApi(spg.username, spg.password, `/reports/${id}/submit`, 'POST');
  await login(page, spv.username, spv.password); await expect(page).toHaveURL(/dashboard|review/); await page.goto('/review');
  await page.locator('tr', { hasText: 'Isian Ganda' }).first().getByRole('button', { name: 'Detail' }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('button', { name: 'Hapus Toko Dobel' }).click();
  await page.getByLabel('Alasan penghapusan').fill('Outlet diisi dua kali');
  await page.getByRole('dialog', { name: 'Hapus Toko Dobel?' }).getByRole('button', { name: 'Hapus isian' }).click();
  await expect(page.getByText('Toko Dobel dihapus')).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Hapus Toko Dobel' })).toHaveCount(0);
  await expect(drawer.locator('[data-removed]')).toContainText('Isian dihapus (1)');
  await expect(drawer.locator('[data-log]')).toContainText('Isian dihapus');
  await expect(drawer.locator('[data-log]')).toContainText('Outlet diisi dua kali');
  await page.keyboard.press('Escape');
  // Menu Log aktivitas: supervisor melihat penghapusan isian di wilayahnya
  await page.getByRole('link', { name: 'Log aktivitas' }).first().click(); await expect(page).toHaveURL(/activity/);
  await page.locator('[data-kind=isian]').click();
  await expect(page.locator('[data-activity]')).toContainText('Outlet diisi dua kali');
  await expect(page.locator('[data-activity]')).toContainText('Isian Ganda');
  expect(errors).toEqual([]);
});
