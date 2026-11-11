import { defineConfig, devices } from '@playwright/test';

/** Web E2E: expects API (:4000, seeded with demo data) and web (:3000) to be running – see README / CI workflow. */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  // Lokasi uji (Sokaraja, Banyumas) dengan izin lokasi sudah diberikan
  use: { baseURL: process.env.WEB_URL ?? 'http://localhost:3000', trace: 'off', screenshot: 'only-on-failure', geolocation: { latitude: -7.4565, longitude: 109.2864, accuracy: 15 }, permissions: ['geolocation'] },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile/ },
  ],
});
