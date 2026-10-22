import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './media';
import { openPlayground } from './playground';

// Spec section 5, end-to-end test 4: type to filter, choose with Enter, and the estimate updates.
// On ModelPicker's docs page, in its playground, which starts on Kling 2.5 at the sale price.
const pickerPage = 'docs/components/model-picker/';

async function open(page: Page) {
  const region = await openPlayground(page, pickerPage, 'ModelPicker demo');
  return {
    region,
    trigger: region.getByRole('button', { name: /^Model: / }),
    // The list opens in a portal at the end of the page, outside the playground.
    dialog: page.getByRole('dialog', { name: 'Models' }),
    search: page.getByRole('combobox', { name: 'Search models' }),
    estimate: region.locator('[data-slot="demo-estimate"]'),
    slowMotion: region.getByRole('switch', { name: 'Slow motion (0.25×)' }),
    reducedMotion: region.getByRole('switch', { name: 'Reduced motion' }),
  };
}

/**
 * The model of the option the search box points at with aria-activedescendant, if that option is
 * the selected one: the first part of its name, and "(current)" when it's the chosen model.
 */
async function activeOptionName(page: Page) {
  return page.getByRole('combobox', { name: 'Search models' }).evaluate((search) => {
    const active = document.getElementById(search.getAttribute('aria-activedescendant') ?? '');
    if (active?.getAttribute('aria-selected') !== 'true') return null;
    const ids = (active.getAttribute('aria-labelledby') ?? '').split(' ');
    const model = document.getElementById(ids[0] ?? '')?.textContent ?? '';
    return ids.length > 3 ? `${model} (current)` : model;
  });
}

test.describe('ModelPicker', () => {
  test('typing filters, Enter chooses, and the estimate follows the choice and the settings', async ({ page }) => {
    const { region, trigger, dialog, search, estimate } = await open(page);
    await expect(estimate).toHaveText('5 s × $0.021 ≈ $0.11');

    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(search).toBeFocused();
    await expect.poll(() => activeOptionName(page)).toBe('Kling 2.5 (current)');

    // By a badge: the two 1080p models, the first one active.
    await page.keyboard.type('1080p');
    await expect(dialog.getByRole('option')).toHaveCount(2);
    await expect.poll(() => activeOptionName(page)).toBe('Soul 2');
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => activeOptionName(page)).toBe('Kling 2.5 Pro');
    await page.keyboard.press('Enter');

    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAccessibleName('Model: Kling 2.5 Pro');
    await expect(estimate).toHaveText('5 s × $0.035 ≈ $0.18');

    // Two videos a run, at the list price.
    await region.getByLabel('Images or videos per run').selectOption('2');
    await expect(estimate).toHaveText('10 s × $0.035 ≈ $0.35');
    await region.getByLabel('Prices').selectOption('list');
    await expect(estimate).toHaveText('10 s × $0.07 ≈ $0.70');

    // Every option's estimate follows the settings too.
    await trigger.click();
    await expect(dialog.getByRole('option', { name: /^Kling 2\.5 Video/ })).toHaveAccessibleName(
      'Kling 2.5 Video 720p 5 s ≈ $0.42 10 s × $0.042',
    );
  });

  test('Esc closes the list without choosing, and focus goes back to the button', async ({ page }) => {
    const { trigger, dialog, estimate } = await open(page);
    await trigger.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAccessibleName('Model: Kling 2.5');
    await expect(estimate).toHaveText('5 s × $0.021 ≈ $0.11');
  });

  test('the open list follows the combobox pattern, and axe finds no serious issues', async ({ page }) => {
    const { trigger, dialog, search } = await open(page);
    await trigger.click();
    await expect(search).toHaveAttribute('aria-expanded', 'true');
    await expect(search).toHaveAttribute('aria-autocomplete', 'list');
    const listId = await search.getAttribute('aria-controls');
    await expect(page.locator(`[id="${listId ?? ''}"]`)).toHaveAttribute('role', 'listbox');

    const { violations } = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.help} (${String(v.nodes.length)})`)).toEqual([]);

    // Nothing matches: no active option, and the list says it's collapsed.
    await page.keyboard.type('sora');
    await expect(dialog.getByText('No models match “sora”')).toBeVisible();
    await expect(search).toHaveAttribute('aria-expanded', 'false');
    await expect(search).not.toHaveAttribute('aria-activedescendant');
    // An empty listbox is invalid ARIA (axe: aria-required-children, critical).
    const empty = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
    expect(empty.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
  });

  test('the popover opens in slow motion with the playground, and at once with reduced motion', async ({ page }) => {
    const { trigger, dialog, slowMotion, reducedMotion } = await open(page);
    await slowMotion.click();
    await trigger.click();
    await expect(dialog).toHaveCSS('animation-duration', '0.48s');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await slowMotion.click();
    await reducedMotion.click();
    await trigger.click();
    await expect(dialog).toHaveCSS('animation-name', 'none');
  });
});
