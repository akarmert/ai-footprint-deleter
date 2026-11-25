import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

// Browser acceptance: runs the existing tests/*-acceptance.js browser_run_code functions
// against the production build served by server.mjs. Build first: `npm run build`.
process.env.AFC_FIXTURES_DIR ??= resolve('tests/fixtures');
const origin = (process.env.AFC_BASE_URL ??= `http://localhost:${process.env.PORT ?? 3000}`);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: { baseURL: origin, browserName: 'chromium' },
  webServer: {
    command: 'node server.mjs',
    url: `${origin}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
