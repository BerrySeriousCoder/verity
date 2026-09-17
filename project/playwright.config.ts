import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './apps/api/test/browser',
  workers: 1,
  timeout: 60_000,
  // First-use Next.js compilation and the PDF worker are part of this flow.
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://127.0.0.1:3000',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm --filter @verity/web dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
