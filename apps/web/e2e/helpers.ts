import { expect, type Page } from '@playwright/test';

export const API = process.env.API_URL ?? 'http://localhost:4000/api/v1';
export const ADMIN = { username: process.env.E2E_ADMIN_USER ?? 'admin', password: process.env.E2E_ADMIN_PASSWORD ?? 'Admin12345!' };

async function token(u: string, p: string) {
  const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
  expect(r.ok, await r.clone().text()).toBeTruthy();
  return (await r.json()).data.accessToken as string;
}
export async function adminApi(path: string, method = 'GET', body?: unknown) {
  const t = await token(ADMIN.username, ADMIN.password);
  const r = await fetch(`${API}${path}`, { method, headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j)); return j.data;
}
export async function makeUser(role: 'SPG' | 'SPV', name: string, tugas: string[] = []) {
  const username = `e2e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const u = await adminApi('/users', 'POST', { username, name, password: 'Rahasia123', role, tugas });
  return { ...u, username, password: 'Rahasia123' };
}
export async function login(page: Page, username: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username); await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
}
export const chip = (page: Page, text: string) => page.locator('label').filter({ hasText: new RegExp('^' + text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '$') }).first().click();
export async function pickKec(page: Page, q: string, name: string) {
  await page.locator(`input[data-kecq="${q}"]`).fill(name.slice(0, 6));
  await page.getByRole('option', { name: new RegExp('^' + name) }).first().click();
}
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
