import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './media';
import { openPlayground } from './playground';

// CameraMotionPicker on its docs page: the tiles play their clips on hover and on keyboard focus,
// never more at once than the playground's pool of two holds, and with reduced motion (spec
// section 5, end-to-end test 8) nothing plays by itself while the play buttons work.
const pickerPage = 'docs/components/camera-motion-picker/';

async function open(page: Page) {
  const region = await openPlayground(page, pickerPage, 'CameraMotionPicker demo');
  const group = region.getByRole('radiogroup', { name: 'Camera motion' });
  await expect(group.getByRole('radio')).toHaveCount(8);
  return { region, group };
}

function tile(group: Locator, move: string) {
  return group.locator('[data-slot="camera-motion-picker-option"]').filter({ has: group.page().getByRole('radio', { name: move, exact: true }) });
}

/** Whether a tile's clip is playing, its first frame shown. */
function playing(tile: Locator) {
  return tile.evaluate((element) => {
    const video = element.querySelector('video');
    const shown = !element.querySelector('[data-slot="camera-motion-picker-preview"]')?.classList.contains('opacity-0');
    return video !== null && !video.paused && video.currentTime > 0 && shown;
  });
}

/** Counts the different <video> elements that ever enter the page, not only those in it now. */
async function countVideosSeen(page: Page) {
  await page.addInitScript(() => {
    const seen = new Set<Element>();
    Object.assign(window, { videosSeen: seen });
    new MutationObserver(() => {
      for (const video of document.querySelectorAll('video')) seen.add(video);
    }).observe(document, { childList: true, subtree: true });
  });
  return () => page.evaluate(() => (window as unknown as { videosSeen: Set<Element> }).videosSeen.size);
}

const moves = ['Dolly in', 'Dolly out', 'Orbit', 'Crane up', 'Crash zoom', 'Whip pan', 'Dolly zoom', 'Bullet time'];

test.describe('CameraMotionPicker', () => {
  test('tiles play on hover, never more than the pool holds', async ({ page }) => {
    const videosSeen = await countVideosSeen(page);
    const { region, group } = await open(page);
    const live = region.locator('[data-slot="live-videos"]');
    await expect(live).toHaveAttribute('data-size', '2');

    for (const move of moves) {
      const current = tile(group, move);
      await current.hover();
      await expect.poll(() => playing(current), { timeout: 3000 }).toBe(true);
      expect(await page.locator('video').count()).toBeLessThanOrEqual(2);
      expect(Number(await live.getAttribute('data-live'))).toBeLessThanOrEqual(2);
    }
    // Leaving a tile pauses its clip.
    await page.mouse.move(0, 0);
    await expect.poll(() => playing(tile(group, 'Bullet time'))).toBe(false);
    // The pool lends the same two videos from tile to tile.
    expect(await videosSeen()).toBe(2);
  });

  test('tiles play while they have keyboard focus, and the arrows pick and play the next', async ({ page }) => {
    const { region, group } = await open(page);
    await region.getByRole('switch', { name: 'Reduced motion' }).focus();
    await page.keyboard.press('Tab');
    await expect(group.getByRole('radio', { name: 'Dolly in', exact: true })).toBeFocused();
    await expect.poll(() => playing(tile(group, 'Dolly in')), { timeout: 3000 }).toBe(true);

    await page.keyboard.press('ArrowRight');
    await expect(group.getByRole('radio', { name: 'Dolly out', exact: true })).toBeChecked();
    await expect.poll(() => playing(tile(group, 'Dolly out')), { timeout: 3000 }).toBe(true);
    await expect.poll(() => playing(tile(group, 'Dolly in'))).toBe(false);
    await expect(region.getByText('Picked: Dolly out')).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).include('[aria-label="CameraMotionPicker demo"]').analyze();
    const serious = violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
    expect(serious.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });

  test('a click picks a tile; another scene keeps the move if it has it', async ({ page }) => {
    const { region, group } = await open(page);
    // The tile's radio covers its text, so a click anywhere on the tile picks it.
    await tile(group, 'Crane up').click();
    await expect(group.getByRole('radio', { name: 'Crane up', exact: true })).toBeChecked();
    await region.getByLabel('Scene').selectOption({ label: 'The lighthouse: 4 moves, Kling 2.5' });
    await expect(group.getByRole('radio')).toHaveCount(4);
    await expect(group.getByRole('radio', { name: 'Crane up', exact: true })).toBeChecked();
  });

  test('with reduced motion nothing plays by itself; Play preview plays a tile', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { group } = await open(page);
    await expect(group).toHaveAttribute('data-motion', 'reduce');
    await expect(group.getByRole('button', { name: /^Play preview of / })).toHaveCount(8);

    // Near a tile's corner: its play button covers the middle.
    await tile(group, 'Orbit').hover({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(600);
    await expect(page.locator('video')).toHaveCount(0);

    await group.getByRole('button', { name: 'Play preview of Orbit', exact: true }).click();
    await expect(group.getByRole('button', { name: 'Pause preview of Orbit', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => playing(tile(group, 'Orbit')), { timeout: 3000 }).toBe(true);
    // The picked tile's play button follows the group in the tab order.
    await group.getByRole('radio', { name: 'Dolly in', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(group.getByRole('button', { name: 'Play preview of Dolly in', exact: true })).toBeFocused();
  });
});
