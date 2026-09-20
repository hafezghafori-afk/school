import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 7_000
  },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run dev -- --host 127.0.0.1 --port 4173',
        // Point the dev server's /api proxy at a port nothing listens on. The
        // specs mock what they need; anything they miss must fail, not reach a
        // real backend. When one happens to be running on the default :5000 it
        // answers the mock token with 401 «توکن نامعتبر», the app correctly
        // redirects to /login, and every affected spec fails in a way that
        // looks like an app bug. That trap has cost real debugging time twice.
        env: { VITE_PROXY_TARGET: 'http://127.0.0.1:59999' },
        url: baseURL,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
