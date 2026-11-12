import { expect, test } from '@playwright/test';
import { gpsReady, login, makeUser } from './helpers';

test('PWA: aplikasi SPG tetap terbuka saat tanpa sinyal (halaman diambil dari cache)', async ({ page, context }) => {
  const s = await makeUser('SPG', 'Oki Offline', ['HORECA']);
  await login(page, s.username, s.password); await gpsReady(page);
  await page.waitForFunction(async () => !!(await navigator.serviceWorker?.getRegistration())?.active, null, { timeout: 15_000 });
  await page.reload(); await gpsReady(page);                                              // halaman kini tersimpan di cache
  await context.setOffline(true);
  await page.reload(); await expect(page.getByText('Oki Offline')).toBeVisible();        // tanpa sinyal tetap terbuka dari cache
  await context.setOffline(false);
});
