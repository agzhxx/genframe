import { expect, type Page } from '@playwright/test';

/**
 * Opens a docs page and returns its playground once React has hydrated it. A playground's code
 * loads after the page (components/docs/demo.tsx), and until it runs, the playground's HTML is
 * there but doesn't respond to keys or clicks.
 */
export async function openPlayground(page: Page, path: string, title: string) {
  await page.goto(path);
  const region = page.getByRole('region', { name: title });
  await expect(region).toHaveAttribute('data-hydrated', '');
  return region;
}
