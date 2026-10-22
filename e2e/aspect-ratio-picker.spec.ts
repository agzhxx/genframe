import type { Page } from '@playwright/test';
import { expect, test } from './media';
import { openPlayground } from './playground';

// AspectRatioPicker's docs page. Its keys are Chrome's own for radio buttons, so they're tested
// here, in the browser, as well as in jsdom. The demo disables the ratios its scene has no image
// in: 4:3, 2:3, 3:2 and 21:9.
const pickerPage = 'docs/components/aspect-ratio-picker/';

async function open(page: Page) {
  const region = await openPlayground(page, pickerPage, 'AspectRatioPicker demo');
  const group = region.getByRole('radiogroup', { name: 'Aspect ratio' });
  return {
    region,
    group,
    ratio: (ratio: string) => group.getByRole('radio', { name: new RegExp(`^${ratio},`) }),
    option: (ratio: string) => group.locator('[data-slot="aspect-ratio-picker-option"]').filter({ hasText: ratio }),
    preview: region.locator('[data-slot="aspect-ratio-picker-preview"] rect'),
    slowMotion: region.getByRole('switch', { name: 'Slow motion (0.25×)' }),
    reducedMotion: region.getByRole('switch', { name: 'Reduced motion' }),
  };
}

// The preview frame's width every animation frame, for `ms` after `start` runs.
async function previewWidthsDuring(page: Page, ms: number, start: () => Promise<void>) {
  const recording = page.evaluate(
    (duration) =>
      new Promise<number[]>((resolve) => {
        const rect = document.querySelector('[data-slot="aspect-ratio-picker-preview"] rect');
        const widths: number[] = [];
        const t0 = performance.now();
        function frame() {
          widths.push(rect?.getBoundingClientRect().width ?? 0);
          if (performance.now() - t0 < duration) requestAnimationFrame(frame);
          else resolve(widths);
        }
        requestAnimationFrame(frame);
      }),
    ms,
  );
  await start();
  return recording;
}

test.describe('AspectRatioPicker', () => {
  test('arrows pick the next ratio, skipping disabled ones; Tab leaves and comes back', async ({ page }) => {
    const { ratio } = await open(page);
    await ratio('16:9').focus();

    // 21:9, the last, is disabled: around to the first.
    await page.keyboard.press('ArrowRight');
    await expect(ratio('1:1')).toBeChecked();
    await expect(ratio('1:1')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(ratio('3:4')).toBeChecked();
    // Past 4:3, 2:3 and 3:2.
    await page.keyboard.press('ArrowRight');
    await expect(ratio('9:16')).toBeChecked();
    await page.keyboard.press('ArrowLeft');
    await expect(ratio('3:4')).toBeChecked();

    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).not.toHaveAttribute('type', 'radio');
    await page.keyboard.press('Shift+Tab');
    await expect(ratio('3:4')).toBeFocused();
  });

  test('a disabled ratio gives its reason on hover, and all of them show while the group has keyboard focus', async ({
    page,
  }) => {
    const { group, ratio, option } = await open(page);
    const reason = option('21:9').locator('[data-slot="aspect-ratio-picker-reason"]');
    const note = page.locator('[data-slot="aspect-ratio-picker-unavailable"]');
    await expect(ratio('21:9')).toBeDisabled();
    await expect(reason).toBeHidden();

    await option('21:9').hover();
    await expect(reason).toBeVisible();
    await expect(reason).toHaveText('No demo image in this ratio');

    await expect(note).toBeHidden();
    await ratio('16:9').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(note).toBeVisible();
    await expect(note).toContainText('21:9 can’t be picked: No demo image in this ratio');
    // Screen readers hear the same list as the group's description.
    await expect(group).toHaveAccessibleDescription(/4:3 can’t be picked/);
  });

  test('the preview frame scales to the picked shape, and changes at once with reduced motion', async ({ page }) => {
    const { option, preview, slowMotion, reducedMotion } = await open(page);
    await slowMotion.click();
    // Measured like the frames: the shape, without its stroke.
    const landscape = await preview.evaluate((rect) => rect.getBoundingClientRect().width);

    const scaling = await previewWidthsDuring(page, 1200, () => option('9:16').click());
    const portrait = scaling.at(-1) ?? 0;
    expect(portrait).toBeLessThan(landscape * 0.6);
    expect(scaling.some((width) => width < landscape - 2 && width > portrait + 2)).toBe(true);
    await expect(preview).toHaveCSS('stroke-width', '1.5px');

    await reducedMotion.click();
    await expect(preview).toHaveCSS('transition-property', 'none');
    const jumping = await previewWidthsDuring(page, 600, () => option('16:9').click());
    expect(jumping.every((width) => Math.abs(width - portrait) < 1 || Math.abs(width - landscape) < 1)).toBe(true);
  });

  test("the scene's image changes with the pick", async ({ page }) => {
    const { region, option } = await open(page);
    const image = region.locator('figure img');
    await expect(image).toHaveAttribute('alt', /in 16:9$/);
    await option('3:4').click();
    await expect(image).toHaveAttribute('alt', /in 3:4$/);
  });
});
