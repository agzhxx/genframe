import type { Locator, Page } from '@playwright/test';
import { expect, test } from './media';
import { openPlayground } from './playground';

// Spec section 5, end-to-end test 3: dragging and the keyboard both move the slider, and two
// videos stay in step after a seek. On CompareSlider's docs page, in its playground.
const sliderPage = 'docs/components/compare-slider/';

async function open(page: Page) {
  const region = await openPlayground(page, sliderPage, 'CompareSlider demo');
  return {
    slider: region.getByRole('slider'),
    root: region.locator('[data-slot="compare-slider"]'),
    divider: region.locator('[data-slot="compare-slider-divider"]'),
    media: region.getByLabel('Media'),
    slowMotion: region.getByRole('switch', { name: 'Slow motion (0.25×)' }),
    reducedMotion: region.getByRole('switch', { name: 'Reduced motion' }),
  };
}

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Not on the page');
  return box;
}

// Where the divider is, in % of the slider's width, every animation frame for `ms` after
// `start` runs.
async function dividerFramesDuring(root: Locator, ms: number, start: () => Promise<void>) {
  const recording = root.evaluate(
    (element, duration) =>
      new Promise<number[]>((resolve) => {
        const divider = element.querySelector('[data-slot="compare-slider-divider"]');
        const frames: number[] = [];
        const t0 = performance.now();
        function frame() {
          const box = element.getBoundingClientRect();
          const x = divider?.getBoundingClientRect().x ?? box.x;
          frames.push(((x - box.x) / box.width) * 100);
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

test.describe('CompareSlider', () => {
  test('dragging the handle moves the divider with the pointer', async ({ page }) => {
    const { slider, root, divider } = await open(page);
    const box = await boxOf(root);
    const handle = await boxOf(slider);

    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2, { steps: 8 });
    await expect(root).toHaveAttribute('data-dragging', '');
    // Nothing animates while dragging.
    await expect(divider).toHaveCSS('transition-property', 'none');
    await page.mouse.up();

    await expect(slider).toHaveAttribute('aria-valuenow', '25');
    await expect(slider).toHaveAttribute('aria-valuetext', '25% Final');
    await expect(root).not.toHaveAttribute('data-dragging');
    await expect(slider).toBeFocused();
  });

  test('the keyboard moves it', async ({ page }) => {
    const { slider } = await open(page);
    await slider.focus();

    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuenow', '51');
    await page.keyboard.press('Shift+ArrowLeft');
    await expect(slider).toHaveAttribute('aria-valuenow', '41');
    await page.keyboard.press('PageUp');
    await expect(slider).toHaveAttribute('aria-valuenow', '51');
    await page.keyboard.press('End');
    await expect(slider).toHaveAttribute('aria-valuetext', '100% Final');
    await page.keyboard.press('Home');
    await expect(slider).toHaveAttribute('aria-valuenow', '0');
  });

  test('a click on the track springs the divider there: past it, then back', async ({ page }) => {
    const { slider, root, slowMotion } = await open(page);
    // 880 ms instead of 220 ms, so there are frames to see.
    await slowMotion.click();
    const box = await boxOf(root);

    const frames = await dividerFramesDuring(root, 1200, () =>
      page.mouse.click(box.x + box.width * 0.8, box.y + box.height / 2),
    );
    await expect(slider).toHaveAttribute('aria-valuenow', '80');
    expect(frames.some((x) => x > 55 && x < 75)).toBe(true);
    expect(Math.max(...frames)).toBeGreaterThan(80.3);
    expect(frames.at(-1)).toBeCloseTo(80, 1);
  });

  test('with reduced motion, the divider goes straight to a click', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { root, divider, slowMotion, reducedMotion } = await open(page);
    await expect(reducedMotion).toBeChecked();
    await expect(divider).toHaveCSS('transition-property', 'none');
    await slowMotion.click();
    const box = await boxOf(root);

    const frames = await dividerFramesDuring(root, 600, () =>
      page.mouse.click(box.x + box.width * 0.8, box.y + box.height / 2),
    );
    expect(frames.every((x) => Math.abs(x - 50) < 0.5 || Math.abs(x - 80) < 0.5)).toBe(true);
    expect(frames.at(-1)).toBeCloseTo(80, 1);
  });

  test('two videos stay in step after a seek, from either video', async ({ page }) => {
    const { media } = await open(page);
    await media.selectOption({ label: 'Two videos: the ferry' });
    const videos = page.locator('[data-slot="compare-slider"] video');
    await expect(videos).toHaveCount(2);

    // How far apart they are, once neither is seeking.
    const apart = () =>
      videos.evaluateAll((elements) => {
        const [clock, follower] = elements as HTMLVideoElement[];
        if (!clock || !follower || clock.seeking || follower.seeking) return Infinity;
        return Math.abs(clock.currentTime - follower.currentTime);
      });
    const times = () => videos.evaluateAll((elements) => (elements as HTMLVideoElement[]).map((video) => video.currentTime));
    const playing = () => videos.evaluateAll((elements) => (elements as HTMLVideoElement[]).map((video) => !video.paused));

    // They play by themselves (muted), both.
    await expect.poll(playing).toEqual([true, true]);

    // A seek on the clock (the before video), as the demo's time bar does, while playing.
    await videos.nth(0).evaluate((video: HTMLVideoElement) => {
      video.currentTime = 2;
    });
    await expect.poll(apart, { timeout: 5000 }).toBeLessThan(1 / 30);
    expect((await times())[1]).toBeGreaterThan(1.9);

    // A seek on the follower moves the clock too.
    await videos.nth(1).evaluate((video: HTMLVideoElement) => {
      video.currentTime = 0.5;
    });
    await expect.poll(apart, { timeout: 5000 }).toBeLessThan(1 / 30);
    expect((await times())[0]).toBeLessThan(1.5);

    // Pausing either pauses both, and paused they show the same frame.
    await videos.nth(1).evaluate((video: HTMLVideoElement) => {
      video.pause();
    });
    await expect.poll(playing).toEqual([false, false]);
    await videos.nth(0).evaluate((video: HTMLVideoElement) => {
      video.currentTime = 3;
    });
    await expect.poll(times).toEqual([3, 3]);
  });
});
