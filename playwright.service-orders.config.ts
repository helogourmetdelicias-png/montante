import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', testMatch: '**/service-orders.spec.ts', workers: 1, timeout: 90000,
  use: { baseURL: 'http://127.0.0.1:3100', headless: true, actionTimeout: 15000, navigationTimeout: 15000, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3100', url: 'http://127.0.0.1:3100/login', timeout: 120000, reuseExistingServer: false, env: { NEXTAUTH_URL: 'http://127.0.0.1:3100', AUTH_URL: 'http://127.0.0.1:3100' } },
});
