import { expect, test } from '@playwright/test';
import { collectErrors, login } from './helpers';

const ROUTES = ['/overview', '/overview/operational', '/overview/drilldown?level=region', '/spgs', '/grosir', '/grosir/wholesalers', '/grosir/retailers', '/horeca', '/horeca/programs',
  '/reguler', '/reguler/availability', '/reguler/visibility', '/attendance', '/attendance/visits', '/attendance/plans', '/attendance/reports', '/outlets', '/outlets/products',
  '/outlets/organization', '/market', '/market/observations', '/performance', '/performance/kpi', '/performance/targets', '/approvals', '/reports', '/data-quality', '/users',
  '/integrations', '/integrations/google', '/audit', '/settings'];

test('every management page renders without runtime errors (admin)', async ({ page }) => {
  const errors = collectErrors(page);
  await login(page, 'admin@demo.tanda-tambah.local');
  for (const r of ROUTES) {
    await page.goto(r);
    await expect(page.locator('main h1').first()).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: /error|failed/i })).toHaveCount(0);
  }
  expect(errors, errors.join('\n')).toEqual([]);
});

test('menu is adapted to the role', async ({ page }) => {
  await login(page, 'spv1.sby@demo.tanda-tambah.local');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link', { name: 'Approvals' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'User Management' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Audit Trail' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Log out' }).click();
  await login(page, 'viewer@demo.tanda-tambah.local');
  await expect(nav.getByRole('link', { name: 'Overview' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'SPG Grosir' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Export/ })).toHaveCount(0); // viewer cannot export
});

test('supervisor sees only own SPGs; SPG users are sent to the field app', async ({ page }) => {
  await login(page, 'spv1.sby@demo.tanda-tambah.local');
  await page.goto('/spgs');
  await expect(page.getByText(/1–3 of 3/)).toBeVisible();
  await page.getByRole('button', { name: 'Log out' }).click();
  await login(page, 'demo-spg-003@demo.tanda-tambah.local');
  await expect(page).toHaveURL(/\/m/);
  await page.goto('/users');
  await expect(page).toHaveURL(/\/m/);
});

test('dashboard filters live in the URL and exports use them', async ({ page }) => {
  await login(page, 'national@demo.tanda-tambah.local');
  await page.goto('/overview');
  await page.getByLabel('Category').selectOption('GROSIR');
  await expect(page).toHaveURL(/category=GROSIR/);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^monthly-performance_.*\.csv$/);
  const text = await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8'));
  expect(text).toContain('"category":"GROSIR"');
});

test('transaction drill-down: list → detail with audit trail', async ({ page }) => {
  await login(page, 'spv1.sby@demo.tanda-tambah.local');
  await page.goto('/grosir');
  await page.locator('tbody tr').first().click();
  await expect(page).toHaveURL(/\/grosir\/transactions\//);
  await expect(page.getByText(/audit/i).first()).toBeVisible();
});
