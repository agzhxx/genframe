import { test as base } from '@playwright/test';
import { mediaOrigin } from '../lib/feed-media';
import { serveFeedMedia } from './stand-ins';

/** Playwright's `test`, with the Feed's media served by the test (e2e/stand-ins.ts). */
export const test = base.extend({
  // Playwright calls this argument `use`; React's lint rules would take that for its hook.
  page: async ({ page }, provide) => {
    await page.route(`${mediaOrigin}/**`, serveFeedMedia);
    await provide(page);
  },
});

export { expect } from '@playwright/test';
