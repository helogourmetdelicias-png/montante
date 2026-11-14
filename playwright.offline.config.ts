import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', testMatch: 'offline.spec.ts', workers: 1,
  use: { baseURL: 'http://127.0.0.1:4194', headless: true, trace: 'retain-on-failure', serviceWorkers: 'allow' },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config tests/browser/vite.offline.config.mjs --port 4194', url: 'http://127.0.0.1:4194/offline-setup.html', reuseExistingServer: !process.env.CI },
});
