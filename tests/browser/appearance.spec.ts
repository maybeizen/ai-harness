import { test, expect } from '@playwright/test';
test('restores appearance preferences across reload and respects narrow layouts', async ({
  page,
}) => {
  await page.goto('/tests/chat.html');
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await page.getByLabel('Theme', { exact: true }).selectOption('light');
  await page.getByLabel('Accent color', { exact: true }).selectOption('violet');
  await page.getByLabel('Density', { exact: true }).selectOption('compact');
  await page.getByLabel('Reduce motion', { exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'violet');
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await page.screenshot({
    path: '.cache/workstation-light.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 700, height: 800 });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 700);
  await page.screenshot({
    path: '.cache/workstation-light-narrow.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await page.getByLabel('Theme', { exact: true }).selectOption('dark');
  await page.keyboard.press('Escape');
  await page.screenshot({
    path: '.cache/workstation-dark-narrow.png',
    fullPage: true,
    animations: 'disabled',
  });
});
test('keeps messages readable through light and dark theme changes', async ({
  page,
}) => {
  await page.goto('/tests/chat.html');
  await page
    .getByRole('button', { name: 'Connect a provider', exact: true })
    .click();
  const card = page.getByRole('region', { name: 'OpenAI API', exact: true });
  await card
    .getByLabel('OpenAI API API key', { exact: true })
    .fill('fixture-key');
  await card
    .getByRole('button', { name: 'Connect API key', exact: true })
    .click();
  await page.getByRole('button', { name: 'Select model', exact: true }).click();
  await page.getByRole('option', { name: 'Fixture One', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Message', exact: true })
    .fill('A saved code example');
  await page
    .getByRole('textbox', { name: 'Message', exact: true })
    .press('Enter');
  await expect(
    page.getByRole('heading', { name: 'A useful reply' }),
  ).toBeVisible();
  await expect(page.locator('.shiki span').first()).toBeVisible();
  await page.screenshot({
    path: '.cache/workstation-dark-chat.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await page.getByLabel('Theme', { exact: true }).selectOption('light');
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('heading', { name: 'A useful reply' }),
  ).toBeVisible();
  await page.screenshot({
    path: '.cache/workstation-light-chat.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 1440);
});
