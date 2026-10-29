import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', testMatch: 'daily-cash.spec.ts',
  use: { baseURL: 'http://127.0.0.1:4191', headless: true, trace: 'retain-on-failure' },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config tests/browser/vite.personalization.config.mjs --port 4191', url: 'http://127.0.0.1:4191', reuseExistingServer: !process.env.CI },
});
