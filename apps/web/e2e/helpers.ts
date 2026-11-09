import { expect, type Page } from '@playwright/test';
export const PW = process.env.DEMO_PASSWORD ?? 'Demo12345!';
export async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', PW);
  await page.click('button[type=submit]');
  await expect(page).not.toHaveURL(/\/login/);
}
export function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}
