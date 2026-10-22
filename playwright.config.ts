import { defineConfig } from '@playwright/test';

// The production build (`pnpm build`), served the way GitHub Pages serves it (scripts/serve.ts).
const port = 4173;
const baseURL = `http://127.0.0.1:${String(port)}/genframe/`;

export default defineConfig({
  testDir: 'e2e',
  // Screenshot baselines, one folder for all, made on Linux only (e2e/screenshots.spec.ts).
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    // Google Chrome, which GitHub's runners already have, as in the Timeline.
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node scripts/serve.ts --port ${String(port)}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
