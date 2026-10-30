import { test, expect } from '@playwright/test';
test('loads the Monaco worker and mounts/disposes native browser adapters', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const workers: string[] = [];
  page.on('worker', (worker) => workers.push(worker.url()));
  await page.goto('/tests/browser.html');
  await expect(page.locator('#status')).toHaveText('ready');
  await expect(page.locator('.monaco-editor').first()).toBeVisible();
  await expect(page.locator('.xterm')).toBeVisible();
  await expect.poll(() => workers.length).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Dispose' }).click();
  await expect(page.locator('#status')).toHaveText('disposed');
  await expect(page.locator('.xterm')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('renders the empty shell and reports an unavailable native host in browser-only mode', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'What’s on your mind?' }),
  ).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Runtime unavailable');
});
