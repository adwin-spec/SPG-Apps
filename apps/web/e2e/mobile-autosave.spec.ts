import { expect, test } from '@playwright/test';
import { login, makeUser, userApi } from './helpers';
const GPS = { lat: -7.42, lon: 109.23, acc: 12 };

test('simpan sementara saat sinyal lambat: tidak bentrok, ketikan terakhir tidak hilang, tetap bisa diedit', async ({ page }) => {
  const s = await makeUser('SPG', 'Rara Sinyal Lambat', ['HORECA']);
  const id = crypto.randomUUID();
  await userApi(s.username, s.password, `/reports/${id}`, 'PUT', { type: 'HORECA', header: { venue: 'Kopi', alamat: 'Jl 1', kecVenue: { kode: '33.02.19' }, jenisVenue: 'Cafe', kebijakan: 'Area merokok khusus', lokasi: GPS },
    entries: [{ dewasa: true, usia: '25–34', domisili: { kode: '33.02.20' }, rokokBiasa: 'Camel', tempatBeli: 'Minimarket', rasa: 'Sedang', statusTT: 'TAHU_BELUM_COBA', alasan: 'Ragu dengan rasa',
      tahuDari: 'Event', sampel: 'Guava', kekuatan: 'Pas', asap: 'Halus, nyaman', beli: { Guava: 1 }, alasanBeli: 'Rasa cocok', fotoSetuju: 'TIDAK', at: '2026-11-12T01:00:00+00:00' }] });
  const bad: string[] = [];
  page.on('response', (r) => { if (r.url().includes('/reports/') && r.status() >= 400) bad.push(`${r.request().method()} ${r.status()}`); });
  await login(page, s.username, s.password);
  const pic = page.locator('input[name=pic]'); const simpan = page.getByRole('button', { name: 'Simpan sementara' });
  await page.route('**/api/v1/reports/*', async (route) => { if (route.request().method() === 'PUT') await new Promise((r) => setTimeout(r, 2000)); await route.continue(); });
  await pic.fill('Mas Satu'); await simpan.click();
  await page.waitForTimeout(300); await pic.fill('Mas Dua'); await simpan.click();          // simpan lagi sebelum yang pertama selesai
  await page.waitForTimeout(300); await pic.fill('Mas Tiga');                               // terus mengetik saat menyimpan
  await expect(page.getByText('Disimpan').first()).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(2500); await simpan.click(); await page.waitForTimeout(2500);
  await page.unroute('**/api/v1/reports/*');
  expect(bad, 'tidak boleh ada simpanan yang ditolak').toEqual([]);
  await expect(page.getByText('diubah dari perangkat lain')).toHaveCount(0);
  await page.reload(); await expect(pic).toHaveValue('Mas Tiga');                          // ketikan terakhir tersimpan di server
  await pic.fill('Mas Empat'); await simpan.click(); await expect(page.getByText('Disimpan').first()).toBeVisible();
  await page.getByRole('button', { name: 'Ubah' }).last().click(); await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(page.getByText('Tersimpan')).toBeVisible();
  await page.reload(); await expect(pic).toHaveValue('Mas Empat');
  expect(bad).toEqual([]);
});

test('tab Riwayat: SPG melihat riwayat simpan, menarik laporan yang sudah dikirim, mengubah, lalu mengirim lagi', async ({ page }) => {
  const s = await makeUser('SPG', 'Tia Riwayat', ['HORECA']);
  const id = crypto.randomUUID();
  const rep = { type: 'HORECA', header: { venue: 'Kafe Riwayat', alamat: 'Jl 2', kecVenue: { kode: '33.02.19' }, jenisVenue: 'Cafe', kebijakan: 'Area merokok khusus', lokasi: GPS },
    entries: [{ dewasa: true, usia: '25–34', domisili: { kode: '33.02.20' }, rokokBiasa: 'Camel', tempatBeli: 'Minimarket', rasa: 'Sedang', statusTT: 'TAHU_BELUM_COBA', alasan: 'Ragu dengan rasa',
      tahuDari: 'Event', sampel: 'Guava', kekuatan: 'Pas', asap: 'Halus, nyaman', beli: { Guava: 1 }, alasanBeli: 'Rasa cocok', fotoSetuju: 'TIDAK', at: '2026-11-12T01:00:00+00:00' }],
    closing: { terlaris: [{ merek: 'Camel', batang: 10 }], pic: 'Mas Kafe' } };
  await userApi(s.username, s.password, `/reports/${id}`, 'PUT', rep);
  await userApi(s.username, s.password, `/reports/${id}/submit`, 'POST');
  await login(page, s.username, s.password);
  await page.locator('[data-tab=riwayat]').click();
  const row = page.locator(`[data-hist-row="${id}"]`);
  await expect(row).toContainText('Kafe Riwayat'); await expect(row).toContainText('Menunggu');
  await row.getByRole('button', { name: /Kafe Riwayat/ }).click();
  await expect(row.locator('[data-hist-log]')).toContainText('Dibuat'); await expect(row.locator('[data-hist-log]')).toContainText('Dikirim');
  await row.locator(`[data-reopen-ask="${id}"]`).click();
  await expect(row).toContainText('ditarik dari antrean');
  await row.locator(`[data-reopen="${id}"]`).click();
  await expect(page.getByText('Laporan ditarik dari antrean')).toBeVisible();
  await expect(page.locator('input[name=pic]')).toHaveValue('Mas Kafe');                    // laporan terbuka lagi untuk diedit
  await page.locator('input[name=pic]').fill('Mbak Kafe');
  await page.getByRole('button', { name: 'Kirim laporan' }).click();
  await expect(page.getByText('Laporan terkirim')).toBeVisible();
  await page.locator('[data-tab=riwayat]').click(); await row.getByRole('button', { name: /Kafe Riwayat/ }).click();
  await expect(row.locator('[data-hist-log]')).toContainText('Ditarik untuk diubah');
});

test('dibiarkan terbuka seharian: layar mati tidak menghilangkan ketikan, sesi kedaluwarsa diperbarui otomatis', async ({ page, context }) => {
  const s = await makeUser('SPG', 'Gita Seharian', ['HORECA']);
  const id = crypto.randomUUID();
  await userApi(s.username, s.password, `/reports/${id}`, 'PUT', { type: 'HORECA', header: { venue: 'Kafe Seharian', alamat: 'Jl 3', kecVenue: { kode: '33.02.19' }, jenisVenue: 'Cafe', kebijakan: 'Area merokok khusus', lokasi: GPS } });
  await login(page, s.username, s.password);
  const pic = page.locator('input[name=pic]'); await expect(pic).toBeVisible();
  // Tanpa sinyal, SPG mengetik lalu layar mati → HP menutup aplikasi. Saat dibuka lagi ketikan masih ada.
  await context.setOffline(true);
  await pic.fill('Bu Sari');
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.evaluate(() => { location.reload(); }).catch(() => undefined);
  await expect(pic).toHaveValue('Bu Sari');
  await context.setOffline(false);
  // Sesi (token 15 menit) sudah kedaluwarsa saat dibuka lagi: server menjawab 401 sekali → aplikasi memperbarui sesi & mengulang.
  let first = true;
  await page.route('**/api/v1/reports/*?lite=1', async (route) => {
    if (first && route.request().method() === 'PUT') { first = false; return route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":{"code":"UNAUTHENTICATED","message":"Token kedaluwarsa"}}' }); }
    return route.continue();
  });
  await page.getByRole('button', { name: 'Simpan sementara' }).click();
  await expect(page.getByText('Disimpan', { exact: true })).toBeVisible();
  expect(first).toBe(false);
  await expect(page).not.toHaveURL(/login/);
  await page.unroute('**/api/v1/reports/*?lite=1');
  const d = await userApi(s.username, s.password, `/reports/${id}`);
  expect(d.data.closing.pic).toBe('Bu Sari');
});
