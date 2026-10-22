import type { Locator, Page } from '@playwright/test';
import { expect, test } from './media';
import { openPlayground } from './playground';

// The first page on the template, with a playground whose demo has a full and a reduced version.
const hookPage = 'docs/utilities/use-reduced-motion/';
const fullMotion = 'transform, translate, scale, rotate';

function clipboard(page: Page) {
  return page.evaluate(() => navigator.clipboard.readText());
}

async function open(page: Page) {
  const region = await openPlayground(page, hookPage, 'useReducedMotion demo');
  return {
    square: region.locator('[data-slot="square"]'),
    move: region.getByRole('button', { name: /^Move/ }),
    slowMotion: region.getByRole('switch', { name: 'Slow motion (0.25×)' }),
    reducedMotion: region.getByRole('switch', { name: 'Reduced motion' }),
  };
}

// The square's left edge and opacity every animation frame, for `ms` after `start` runs.
async function framesDuring(square: Locator, ms: number, start: () => Promise<void>) {
  const recording = square.evaluate(
    (element, duration) =>
      new Promise<{ x: number; opacity: number }[]>((resolve) => {
        const frames: { x: number; opacity: number }[] = [];
        const t0 = performance.now();
        function frame() {
          // The reduced version swaps the element, so look it up again every frame.
          const current = element.isConnected ? element : document.querySelector('[data-slot="square"]');
          if (current) {
            frames.push({
              x: current.getBoundingClientRect().x,
              opacity: Number(getComputedStyle(current).opacity),
            });
          }
          if (performance.now() - t0 < duration) requestAnimationFrame(frame);
          else resolve(frames);
        }
        requestAnimationFrame(frame);
      }),
    ms,
  );
  await start();
  return recording;
}

test.describe('install commands', () => {
  test('the copy button puts the right command on the clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(hookPage);
    // The Installation section's two code blocks: the namespace form, then the URL form.
    const blocks = page.locator('h2#installation ~ div:has(> [role="tablist"])');
    const namespaced = blocks.nth(0);
    const byUrl = blocks.nth(1);

    // A click before React has hydrated the page does nothing: click until one copies.
    await expect(async () => {
      await namespaced.getByRole('button', { name: 'Copy Text' }).click();
      expect(await clipboard(page)).toBe('npx shadcn@latest add @genframe/use-reduced-motion');
    }).toPass();

    await byUrl.getByRole('button', { name: 'Copy Text' }).click();
    expect(await clipboard(page)).toBe(
      'npx shadcn@latest add https://agzhxx.github.io/genframe/r/use-reduced-motion.json',
    );

    await namespaced.getByRole('tab', { name: 'pnpm' }).click();
    await namespaced.getByRole('button', { name: 'Copy Text' }).click();
    expect(await clipboard(page)).toBe('pnpm dlx shadcn@latest add @genframe/use-reduced-motion');
  });
});

test.describe('the playground toggles', () => {
  test('Reduced motion switches the demo to its reduced version', async ({ page }) => {
    const { square, reducedMotion } = await open(page);
    await expect(reducedMotion).not.toBeChecked();
    await expect(square).toHaveCSS('transition-property', fullMotion);

    await reducedMotion.click();
    await expect(reducedMotion).toBeChecked();
    await expect(page.locator('[data-motion="reduce"]')).toHaveCount(1);
    await expect(square).toHaveCSS('transition-property', 'opacity');
  });

  test('Reduced motion starts at the system setting, and can turn it off', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { square, reducedMotion } = await open(page);
    await expect(reducedMotion).toBeChecked();
    await expect(square).toHaveCSS('transition-property', 'opacity');

    await reducedMotion.click();
    await expect(reducedMotion).not.toBeChecked();
    await expect(square).toHaveCSS('transition-property', fullMotion);
  });

  test('Slow motion makes the transitions four times as long', async ({ page }) => {
    const { square, slowMotion } = await open(page);
    await expect(square).toHaveCSS('transition-duration', '0.22s');

    await slowMotion.click();
    await expect(slowMotion).toBeChecked();
    await expect(square).toHaveCSS('transition-duration', '0.88s');
  });

  test('the demo slides with full motion and fades in place with reduced motion', async ({ page }) => {
    const { square, move, slowMotion, reducedMotion } = await open(page);
    // Slowed down to 880 ms; each recording runs past that.
    await slowMotion.click();
    const start = (await square.boundingBox())?.x ?? 0;
    const near = (x: number) => (frame: { x: number }) => Math.abs(frame.x - x) < 1;

    // Full motion: frames between the two ends, fully opaque all the way.
    const slide = await framesDuring(square, 1200, () => move.click());
    const end = slide.at(-1)?.x ?? start;
    expect(end).toBeGreaterThan(start + 100);
    expect(slide.some((frame) => frame.x > start + 1 && frame.x < end - 1)).toBe(true);
    expect(slide.every((frame) => frame.opacity === 1)).toBe(true);

    // Reduced motion: never in between, but fading in where it lands.
    await reducedMotion.click();
    const fade = await framesDuring(square, 1200, () => move.click());
    const back = fade.filter(near(start));
    expect(fade.every((frame) => near(start)(frame) || near(end)(frame))).toBe(true);
    expect(back.some((frame) => frame.opacity > 0 && frame.opacity < 1)).toBe(true);
    expect(back.at(-1)?.opacity).toBe(1);
  });
});
