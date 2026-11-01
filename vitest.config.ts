import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./apps/desktop/src', import.meta.url)),
    },
  },
  plugins: [vue()],
  test: {
    include: ['{apps,packages}/**/*.test.ts'],
    environment: 'node',
    testTimeout: 15000,
  },
});
