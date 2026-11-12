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
