import { readdirSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './media';

// Every docs page, read from content/docs, so a new page is checked without touching this file.
const docsPages = readdirSync('content/docs', { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.mdx'))
  .map((file) => `docs/${file.replace(/(^|\/)index\.mdx$/, '').replace(/\.mdx$/, '/')}`);

const pages = ['./', './studio/', ...docsPages];

for (const path of pages) {
  test(`${path} loads with no console errors and no serious axe issues`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).analyze();
    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.help} (${String(v.nodes.length)})`)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('the registry serves its catalog and every item', async ({ request }) => {
  const catalog = await request.get('r/registry.json');
  expect(catalog.ok()).toBe(true);
  const { items } = (await catalog.json()) as { items: { name: string }[] };
  expect(items.length).toBeGreaterThan(0);

  for (const { name } of items) {
    const response = await request.get(`r/${name}.json`);
    expect(response.ok(), name).toBe(true);
    const item = (await response.json()) as { name: string; files?: { content: string }[]; css?: object };
    expect(item.name).toBe(name);
    // An item brings files, CSS (like motion-tokens) or both, and nothing it brings is empty.
    const files = item.files ?? [];
    expect(files.length + Object.keys(item.css ?? {}).length, name).toBeGreaterThan(0);
    expect(files.every((file) => file.content.length > 0), name).toBe(true);
  }
});

test('search finds the getting-started page', async ({ page }) => {
  await page.goto('docs/');
  const dialog = page.getByRole('dialog');
  // A click before React has hydrated the page does nothing: click until the dialog opens.
  await expect(async () => {
    if (!(await dialog.isVisible())) await page.getByRole('button', { name: /search/i }).first().click();
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass();
  await dialog.getByRole('combobox', { name: 'Search' }).fill('registry');
  await expect(dialog.getByText('Getting started').first()).toBeVisible();

  // The dialog is on every page, and only axe with it open sees it.
  const { violations } = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.help} (${String(v.nodes.length)})`)).toEqual([]);
});
