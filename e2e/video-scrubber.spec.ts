import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './media';
import { openPlayground } from './playground';

// VideoScrubber on its docs page (spec section 5): scrubbing by keyboard and pointer moves the
// video, the frame keys step one frame each, and with reduced motion (end-to-end test 8) nothing
// plays by itself and the preview appears without a transition. The tests serve their own clip
// (e2e/media.ts): 4 s, 30 fps, 120 frames, so the playground's rate is set to 30 here.
const scrubberPage = 'docs/components/video-scrubber/';

async function open(page: Page) {
  const region = await openPlayground(page, scrubberPage, 'VideoScrubber demo');
  const slider = region.getByRole('slider', { name: 'Seek' });
  const video = region.locator('video');
  // Enabled once the video's metadata has loaded.
  await expect(slider).not.toHaveAttribute('aria-disabled', 'true');
  await expect(slider).toHaveAttribute('aria-valuemax', '4');
  return { region, slider, video };
}

function currentTime(video: Locator) {
  return video.evaluate((element) => (element as HTMLVideoElement).currentTime);
}

/**
 * Presses a key and returns the frame the video presents after it, at 30 fps. The frame callback
 * is set up first: a paused video presents no other frame to wait for.
 */
async function presentedFrameAfter(page: Page, video: Locator, key: string) {
  await video.evaluate((element) => {
    const next = new Promise<number>((resolve) => {
      (element as HTMLVideoElement).requestVideoFrameCallback((_now, metadata) => {
        resolve(metadata.mediaTime * 30);
      });
    });
    Object.assign(window, { nextFrame: next });
  });
  await page.keyboard.press(key);
  return page.evaluate(() => (window as unknown as { nextFrame: Promise<number> }).nextFrame);
}

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Not on the page');
  return box;
}

test.describe('VideoScrubber', () => {
  test('the keys move the video, and "," and "." step exactly one frame', async ({ page }) => {
    const { region, slider, video } = await open(page);
    await region.getByLabel('Frame rate').selectOption('30');
    // A video out of view presents no frames: keep it in view.
    await region.locator('figure').scrollIntoViewIfNeeded();
    await slider.focus();

    await page.keyboard.press('End');
    await expect.poll(() => currentTime(video)).toBe(4);
    await expect(slider).toHaveAttribute('aria-valuetext', '3 seconds 29 frames of 4 seconds');
    await page.keyboard.press('Home');
    await expect.poll(() => currentTime(video)).toBe(0);

    // Each step lands in the middle of a frame, and the browser presents that frame.
    for (const [key, frame] of [
      ['.', 1],
      ['.', 2],
      ['.', 3],
      [',', 2],
    ] as const) {
      expect(Math.round(await presentedFrameAfter(page, video, key)), key).toBe(frame);
      await expect.poll(() => currentTime(video)).toBeCloseTo((frame + 0.5) / 30, 5);
    }
    await expect(slider).toHaveAttribute('aria-valuetext', '2 frames of 4 seconds');

    // → goes 5 s on: past the end of this clip, so to its end.
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => currentTime(video)).toBe(4);
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => currentTime(video)).toBe(0);
  });

  test('a click and a drag move the video, and the preview follows the pointer', async ({ page }) => {
    const { region, slider, video } = await open(page);
    await region.getByLabel('Frame rate').selectOption('30');
    const bar = await boxOf(slider);
    const y = bar.y + bar.height / 2;

    await page.mouse.click(bar.x + bar.width / 2, y);
    await expect(slider).toBeFocused();
    // Half of 120 frames, within a frame for where the pixel falls.
    await expect.poll(() => currentTime(video)).toBeGreaterThan(59 / 30);
    expect(await currentTime(video)).toBeLessThan(62 / 30);

    await page.mouse.move(bar.x + bar.width * 0.25, y);
    await page.mouse.down();
    await page.mouse.move(bar.x + bar.width * 0.75, y, { steps: 10 });
    // The preview hangs from a layer with no height of its own: its time label shows it.
    const label = region.locator('[data-slot="video-scrubber-time"]');
    await expect(label).toBeVisible();
    await expect(label).toHaveText(/^00:00:0[23]:\d\d$/);
    await page.mouse.up();
    await expect.poll(() => currentTime(video)).toBeGreaterThan(2.9);
    expect(await currentTime(video)).toBeLessThan(3.1);

    // The preview shows a tile of the clip's sprite, loaded with the page.
    const thumbnail = region.locator('[data-slot="video-scrubber-thumbnail"] img');
    await expect(thumbnail).toHaveAttribute('src', /\/genframe\/sprites\/qjr027827t\.webp$/);
    await expect(thumbnail).toHaveJSProperty('complete', true);
    expect(await thumbnail.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(800);

    await page.mouse.move(bar.x + bar.width / 2, bar.y - 300);
    await expect(label).toBeHidden();
  });

  test('has no serious axe issues with the preview open', async ({ page }) => {
    const { slider } = await open(page);
    const bar = await boxOf(slider);
    await page.mouse.move(bar.x + bar.width * 0.4, bar.y + bar.height / 2);
    await expect(page.locator('[data-slot="video-scrubber-time"]')).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).include('[aria-label="VideoScrubber demo"]').analyze();
    const serious = violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
    expect(serious.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });

  test('with reduced motion nothing plays by itself, and the preview and thumb appear at once', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { region, slider, video } = await open(page);
    await expect(slider).toHaveAttribute('data-motion', 'reduce');
    const bar = await boxOf(slider);
    await page.mouse.move(bar.x + bar.width * 0.5, bar.y + bar.height / 2);
    const preview = region.locator('[data-slot="video-scrubber-preview"]');
    await expect(region.locator('[data-slot="video-scrubber-time"]')).toBeVisible();
    // transition-none: nothing is transitioned.
    for (const part of [preview, region.locator('[data-slot="video-scrubber-thumb"]')]) {
      expect(await part.evaluate((element) => getComputedStyle(element).transitionProperty)).toBe('none');
    }
    await page.waitForTimeout(500);
    expect(await video.evaluate((element) => (element as HTMLVideoElement).paused)).toBe(true);
  });

  test('with full motion the preview fades in over the fast token', async ({ page }) => {
    const { region, slider } = await open(page);
    await expect(slider).not.toHaveAttribute('data-motion', 'reduce');
    const preview = region.locator('[data-slot="video-scrubber-preview"]');
    expect(
      await preview.evaluate((element) => [getComputedStyle(element).transitionProperty, getComputedStyle(element).transitionDuration]),
    ).toEqual(['opacity', '0.12s']);
  });
});
