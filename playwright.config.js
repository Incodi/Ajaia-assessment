import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.pw.js',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4174',
    browserName: 'chromium',
  },
  webServer: {
    command: 'node tests/browser-server.js',
    url: 'http://127.0.0.1:4174',
    env: {
      DOCS_COOKIE_SECRET: 'browser-test-cookie-secret-with-32-bytes',
      PORT: '4174',
    },
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
