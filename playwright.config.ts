import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/browser',
  use: { baseURL: 'http://127.0.0.1:1420', headless: true },
  webServer: {
    command: 'pnpm --filter @harness/desktop dev',
    url: 'http://127.0.0.1:1420',
    reuseExistingServer: !process.env['CI'],
  },
  reporter: [['list'], ['html', { open: 'never' }]],
});
