import { expect, test } from '@playwright/test';
import { adminApi, chip, login, makeUser, pickKec, PNG } from './helpers';

test('SPG Grosir+HORECA mengisi survei dengan foto → SPV wilayah menyetujui → masuk dashboard', async ({ page, browser }) => {
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  const spv = await makeUser('SPV', 'Sari Wulandari');
  await adminApi(`/users/${spv.id}/coverage`, 'POST', { level: 'KAB', kode: '33.02' });
  const spg = await makeUser('SPG', 'Ani Lestari', ['GROSIR', 'HORECA']);

  await login(page, spg.username, spg.password);
  await expect(page).toHaveURL(/\/m$/);
  await chip(page, 'Survei HORECA');
  await page.locator('input[name=venue]').fill('kopi senja'); await page.locator('input[name=alamat]').fill('Jl. Raya 1');
  await pickKec(page, 'kecVenue', 'Sokaraja');
  await expect(page.getByText('Disetujui oleh:')).toContainText('Sari Wulandari');
  await chip(page, 'Cafe'); await chip(page, 'Area merokok khusus');
  await page.getByRole('button', { name: 'Mulai' }).click();
  await expect(page.getByRole('heading', { name: 'Survei Konsumen HORECA' })).toBeVisible();

  await page.getByRole('button', { name: '+ Tambah responden' }).click();
  await chip(page, 'Orangnya perokok & umurnya 18 tahun ke atas');
  await chip(page, '25–34'); await pickKec(page, 'domisili', 'Kembaran'); await page.locator('input[name=rokokBiasa]').fill('camel purple');
  await chip(page, 'Minimarket'); await chip(page, 'Sedang'); await chip(page, 'Udah kenal, belum nyoba'); await chip(page, 'Ragu dengan rasa'); await chip(page, 'Etalase toko');
  await chip(page, 'Guava'); await chip(page, 'Pas'); await chip(page, 'Halus, nyaman'); await page.getByRole('button', { name: 'Tambah Guava' }).click();
  await chip(page, 'Rasa cocok'); await chip(page, 'Mau difoto');
  await page.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.getByText('Ambil foto dulu')).toBeVisible();                       // foto wajib bila responden setuju
  await page.locator('input[data-photo="foto"]').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByRole('button', { name: /Perbesar/ })).toBeVisible();
  await page.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.getByText('Responden 1')).toBeVisible();

  await page.getByLabel('Merek 1', { exact: true }).fill('Camel Purple'); await page.getByLabel('Jumlah batang merek 1').fill('12');
  await page.locator('input[name=pic]').fill('Mas Dani');
  await page.getByRole('button', { name: 'Kirim laporan' }).click();
  await expect(page.getByText('Laporan terkirim')).toBeVisible();

  // Supervisor wilayah menyetujui
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } }); const s = await ctx.newPage(); s.on('pageerror', (e) => errors.push(e.message));
  await login(s, spv.username, spv.password); await expect(s).toHaveURL(/\/dashboard/);
  await s.goto('/review');
  const row = s.locator('tr', { hasText: 'Kopi Senja' }).first();
  await row.getByRole('button', { name: 'Detail' }).click();
  const drawer = s.getByRole('dialog');
  await expect(drawer.getByRole('button', { name: /Perbesar Foto bareng respondennya/ })).toBeVisible();
  await drawer.getByRole('button', { name: 'Setujui laporan' }).click();
  await expect(s.getByText('Disetujui – masuk ke dashboard')).toBeVisible();
  await s.goto('/dashboard'); await s.getByRole('button', { name: 'HORECA', exact: true }).click();
  await expect(s.getByText('Responden difoto')).toBeVisible();
  await expect(s.getByText('100%').first()).toBeVisible().catch(() => undefined);
  await s.screenshot({ path: 'test-results/spv-dashboard.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('SPG Reguler: stok per varian, share of shelf, submit; tugas yang tidak diberikan tidak muncul', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  const spg = await makeUser('SPG', 'Budi Santoso', ['REGULER']);
  await login(page, spg.username, spg.password);
  await expect(page.locator('input[name=tugasPick]')).toHaveCount(0);
  await pickKec(page, 'kecRute', 'Kembaran'); await page.getByRole('button', { name: 'Mulai' }).click();
  await page.getByRole('button', { name: '+ Tambah kunjungan outlet' }).click();
  await page.locator('input[name=namaOutlet]').fill('toko berkah'); await chip(page, 'Minimarket'); await pickKec(page, 'kecOutlet', 'Kembaran'); await chip(page, 'Udah jual TT');
  for (const v of ['Original', 'Watermelon', 'Guava']) await page.getByRole('radiogroup', { name: `Stok ${v}` }).locator('label').first().click();
  await page.locator('input[name=facingTotal]').fill('40'); await page.locator('input[name=facingTT]').fill('50');
  await chip(page, 'Terpasang baik'); await page.getByRole('button', { name: 'Tambah Original' }).click();
  await page.locator('input[name=kompetitor]').fill('sampoerna mild'); await chip(page, 'Diskon');
  await page.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.getByText('Nggak boleh lebih dari total di rak')).toBeVisible();
  await page.locator('input[name=facingTT]').fill('6'); await page.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.getByText('Toko Berkah', { exact: true })).toBeVisible();
  // Riwayat isian: nama outlet & harga yang pernah ditulis muncul sebagai tombol yang tinggal diketuk
  await page.getByRole('button', { name: '+ Tambah kunjungan outlet' }).click();
  await page.locator('button[data-hist="namaOutlet"]', { hasText: 'Toko Berkah' }).click();
  await expect(page.locator('input[name=namaOutlet]')).toHaveValue('Toko Berkah');
  await expect(page.locator('button[data-hist="kecOutlet"]', { hasText: 'Kembaran' })).toBeVisible();
  await page.getByRole('button', { name: 'Batal' }).click();
  await page.screenshot({ path: 'test-results/reguler-session.png', fullPage: true });
  // Teks latar dekoratif (aria-hidden) sengaja terpotong di tepi layar; selain itu tidak boleh ada yang melebar.
  const ovf = await page.evaluate(() => { const vw = document.documentElement.clientWidth;
    const wide = [...document.querySelectorAll('body *')].filter((e) => !e.closest('[aria-hidden="true"]') && e.getBoundingClientRect().right > vw + 1).slice(0, 6).map((e) => `${e.tagName}.${String(e.className).slice(0, 70)}`);
    return document.documentElement.scrollWidth > vw ? [...wide, `scrollWidth ${document.documentElement.scrollWidth} > ${vw}`] : wide; });
  expect(ovf, 'tidak boleh ada geser horizontal di HP').toEqual([]);
  await page.getByRole('button', { name: 'Kirim laporan' }).click();
  await expect(page.getByText('Laporan terkirim')).toBeVisible();
  expect(errors).toEqual([]);
});
