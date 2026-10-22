import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './media';
import { openPlayground } from './playground';

// Spec section 5, end-to-end test 5: @-mention a reference by keyboard, and Cmd/Ctrl+Enter
// submits. On PromptComposer's docs page, in its playground, which starts with two references
// (@car and @alley) and Kling 2.5 in its toolbar.
const composerPage = 'docs/components/prompt-composer/';

// A 1 × 1 PNG, for adding a reference the way a user would.
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function open(page: Page) {
  const region = await openPlayground(page, composerPage, 'PromptComposer demo');
  return {
    region,
    composer: region.locator('[data-slot="prompt-composer"]'),
    box: region.getByRole('textbox', { name: 'Prompt' }),
    list: region.getByRole('listbox', { name: 'References' }),
    references: region.getByRole('list', { name: 'References' }),
    submission: region.locator('[data-slot="demo-submission"]'),
    reducedMotion: region.getByRole('switch', { name: 'Reduced motion' }),
  };
}

// Hands the page a file the way a drop or a paste would: in a DataTransfer, on the given event.
async function dispatchFile(page: Page, selector: string, kind: 'drop' | 'paste', name: string) {
  await page.evaluate(
    ({ selector, kind, name, bytes }) => {
      const target = document.querySelector(selector);
      if (!target) throw new Error(`Nothing matches ${selector}`);
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)], name, { type: 'image/png' }));
      if (kind === 'paste') {
        target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
        return;
      }
      for (const type of ['dragenter', 'dragover', 'drop']) {
        target.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
      }
    },
    { selector, kind, name, bytes: [...png] },
  );
}

test.describe('PromptComposer', () => {
  test('an @-mention goes in by keyboard, and Cmd/Ctrl+Enter submits', async ({ page }) => {
    const { box, list, references, composer, submission } = await open(page);
    await box.click();
    await page.keyboard.type('Slow dolly in on the @');
    await expect(list).toBeVisible();
    await expect(list.getByRole('option')).toHaveText(['@car', '@alley']);
    await expect(list.getByRole('option', { name: '@car' })).toHaveAttribute('aria-selected', 'true');
    const active = await box.getAttribute('aria-activedescendant');
    await expect(list.getByRole('option', { name: '@car' })).toHaveAttribute('id', active ?? '');

    await page.keyboard.press('ArrowDown');
    await expect(list.getByRole('option', { name: '@alley' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');
    await expect(list).toBeHidden();
    await expect(box).toHaveValue('Slow dolly in on the @alley ');
    await expect(box).toBeFocused();
    await expect(references.getByRole('listitem').filter({ hasText: '@alley' })).toHaveAttribute('data-mentioned', '');

    await page.keyboard.type('at night');
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(composer).toHaveAttribute('aria-busy', 'true');
    await expect(box).toHaveValue('Slow dolly in on the @alley at night');
    await expect(submission).toContainText('Slow dolly in on the @alley at night');
    await expect(submission).toContainText('@car, @alley');
    await expect(submission).toContainText('Dolly in');
    await expect(submission).toContainText('Kling 2.5, 16:9, ≈ $0.11');
    await expect(composer).not.toHaveAttribute('aria-busy');
  });

  test('a picked image becomes a reference, which the keyboard removes', async ({ page }) => {
    const { region, references } = await open(page);
    await region.locator('input[type="file"]').setInputFiles({ name: 'Red Car.png', mimeType: 'image/png', buffer: png });
    const added = references.getByRole('listitem').filter({ hasText: '@red-car' });
    await expect(added).toBeVisible();
    await expect(added.locator('img')).toHaveAttribute('src', /^blob:/);

    const remove = region.getByRole('button', { name: 'Remove @red-car' });
    await remove.focus();
    await page.keyboard.press('Delete');
    await expect(added).toHaveCount(0);
    // The last reference went: focus is on the one before it.
    await expect(region.getByRole('button', { name: 'Remove @alley' })).toBeFocused();
  });

  test('dropped and pasted images become references, up to four', async ({ page }) => {
    const { references } = await open(page);
    await dispatchFile(page, '[data-slot="prompt-composer-box"]', 'drop', 'dropped.png');
    await expect(references.getByRole('listitem').filter({ hasText: '@dropped' })).toBeVisible();
    await dispatchFile(page, '[data-slot="prompt-composer-text"]', 'paste', 'pasted.png');
    await expect(references.getByRole('listitem').filter({ hasText: '@pasted' })).toBeVisible();
    // Four of four: the add button is gone.
    await expect(references.getByRole('button', { name: 'Add reference images' })).toHaveCount(0);
  });

  test('the box grows with the prompt', async ({ page }) => {
    const { box } = await open(page);
    const before = (await box.boundingBox())?.height ?? 0;
    await box.click();
    for (const line of ['A red car', 'on a mountain road', 'at golden hour', 'with snow', 'on the peaks']) {
      await page.keyboard.type(line);
      await page.keyboard.press('Enter');
    }
    const after = (await box.boundingBox())?.height ?? 0;
    expect(after).toBeGreaterThan(before + 40);
  });

  test('the open list has no serious axe issues, and drops in, or only fades with reduced motion', async ({ page }) => {
    const { box, list, reducedMotion } = await open(page);
    await box.click();
    await page.keyboard.type('@');
    await expect(list).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).include('[data-slot="prompt-composer"]').analyze();
    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.help} (${String(v.nodes.length)})`)).toEqual([]);
    await expect(list).toHaveCSS('transition-property', 'opacity, transform');

    // The switch takes focus, which closes the list; back in the prompt, it opens again.
    await reducedMotion.click();
    await box.focus();
    await page.keyboard.press('End');
    await expect(list).toBeVisible();
    await expect(list).toHaveCSS('transition-property', 'opacity');
  });
});
