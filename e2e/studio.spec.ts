import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './media';
import { openPlayground } from './playground';

// The Studio (spec section 5, end-to-end test 6): submit → queued → running → reveal → open in the
// compare slider, by keyboard alone and by pointer; a clip opened and scrubbed; and with reduced
// motion (test 8) nothing plays by itself. Jobs run on the simulated generator, at 4× here.

async function openStudio(page: Page, path = 'studio/') {
  const studio = await openPlayground(page, path, 'Studio');
  await studio.getByLabel('Speed').selectOption('4');
  return studio;
}

function card(studio: Locator, name: string) {
  return studio.getByRole('article', { name });
}

function stage(studio: Locator) {
  return studio.locator('[data-slot="studio-stage"]');
}

// What the queue's live region says, in order, from now on.
async function listen(page: Page) {
  await page.evaluate(() => {
    const region = document.querySelector('[data-slot="generation-queue-status"]');
    if (!region) throw new Error('No live region');
    const heard: string[] = [];
    new MutationObserver(() => {
      const text = region.textContent.trim();
      if (text) heard.push(text);
    }).observe(region, { childList: true, subtree: true, characterData: true });
    (window as unknown as { heard: string[] }).heard = heard;
  });
  return () => page.evaluate(() => (window as unknown as { heard: string[] }).heard);
}

// Presses Tab until focus is on `target`, as a keyboard user would get there.
async function tabTo(page: Page, target: Locator, most = 40) {
  for (let step = 0; step < most; step++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('Tab never reached it');
}

async function seriousIssues(page: Page) {
  const { violations } = await new AxeBuilder({ page }).include('[aria-label="Studio"]').analyze();
  return violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id}: ${violation.help} (${String(violation.nodes.length)})`);
}

test.describe('Studio', () => {
  test('by keyboard alone: submit, wait in line, run, reveal, open the draft and final, move the slider', async ({ page }) => {
    const studio = await openStudio(page);
    const heard = await listen(page);
    // Keyboard users Tab to the prompt; focus() puts them there, and keys do the rest.
    await studio.getByRole('textbox', { name: 'Prompt' }).focus();
    await page.keyboard.type('A wreck on the sea floor, light from above');
    for (let count = 0; count < 3; count++) await page.keyboard.press('Control+Enter');

    // Two run at once; the third waits in line, then runs, then is revealed.
    await expect(card(studio, 'Image 3')).toHaveAttribute('data-status', 'queued');
    await expect(card(studio, 'Image 3').locator('[data-slot="generation-card-status"]')).toHaveText(/^Next in line/);
    await expect(card(studio, 'Image 1')).toHaveAttribute('data-status', 'running');
    await expect(card(studio, 'Image 3')).toHaveAttribute('data-status', 'running', { timeout: 10_000 });
    for (const name of ['Image 1', 'Image 2', 'Image 3']) {
      await expect(card(studio, name).locator('[data-slot="denoise-reveal"]')).toHaveAttribute('data-state', 'revealed', {
        timeout: 10_000,
      });
    }
    expect(await heard()).toEqual(
      expect.arrayContaining(['Image 1 started', 'Image 2 started', 'Image 3 queued', 'Image 3 is ready']),
    );

    const open = studio.getByRole('button', { name: 'Open image 3' });
    await tabTo(page, open);
    await page.keyboard.press('Enter');
    await expect(stage(studio).getByRole('heading', { name: 'Image 3' })).toBeFocused();
    const slider = stage(studio).getByRole('slider', { name: 'Draft and Final' });
    await tabTo(page, slider);
    await page.keyboard.press('End');
    await expect(slider).toHaveAttribute('aria-valuenow', '100');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuetext', '1% Final');

    // Close goes back to the Open button.
    await tabTo(page, stage(studio).getByRole('button', { name: 'Close image 3' }));
    await page.keyboard.press('Enter');
    await expect(stage(studio)).toHaveCount(0);
    await expect(open).toBeFocused();
  });

  test('by pointer: a video model, a camera move, a clip opened and scrubbed', async ({ page }) => {
    const studio = await openStudio(page);
    await studio.getByRole('button', { name: /^Model: / }).click();
    await page.getByRole('dialog', { name: 'Models' }).getByRole('option', { name: /^Cinema Studio 4\.0 / }).click();
    const moves = studio.getByRole('radiogroup', { name: 'Camera move' });
    await moves.getByRole('radio', { name: 'Orbit', exact: true }).click({ force: true });
    await expect(moves.getByRole('radio', { name: 'Orbit', exact: true })).toBeChecked();
    await studio.getByRole('textbox', { name: 'Prompt' }).fill('The car on the mountain road');
    await studio.getByRole('button', { name: 'Generate' }).click();

    await expect(card(studio, 'Video 1')).toHaveAttribute('data-status', 'succeeded', { timeout: 10_000 });
    await card(studio, 'Video 1').getByRole('button', { name: 'Open video 1' }).click();
    const video = stage(studio).locator('video');
    await expect(video).toHaveAttribute('aria-label', /: orbit$/);
    await expect(stage(studio)).toContainText('Made with Cinema Studio 4.0');
    // It plays by itself, muted, with full motion.
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => !element.paused)).toBe(true);

    // The scrubber's preview shows the clip's sprite; a click seeks there.
    const scrubber = stage(studio).getByRole('slider', { name: 'Seek' });
    await expect(scrubber).toHaveAttribute('aria-valuemax', '4');
    const bar = await scrubber.boundingBox();
    if (!bar) throw new Error('No scrubber');
    await page.mouse.move(bar.x + bar.width * 0.75, bar.y + bar.height / 2);
    await expect(stage(studio).locator('[data-slot="video-scrubber-thumbnail"] img')).toHaveJSProperty('complete', true);
    await page.mouse.click(bar.x + bar.width * 0.75, bar.y + bar.height / 2);
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(2.5);
  });

  test('with reduced motion: nothing plays by itself, the moves have play buttons, and the reveal is a fade', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const studio = await openStudio(page);
    await expect(studio.getByRole('switch', { name: 'Reduced motion' })).toBeChecked();
    await studio.getByRole('button', { name: /^Model: / }).click();
    await page.getByRole('dialog', { name: 'Models' }).getByRole('option', { name: /^Kling 2\.5 Pro / }).click();
    await expect(studio.getByRole('button', { name: /^Play preview of / })).toHaveCount(8);
    await studio.getByRole('textbox', { name: 'Prompt' }).fill('The robot at night');
    await studio.getByRole('button', { name: 'Generate' }).click();

    const reveal = card(studio, 'Video 1').locator('[data-slot="denoise-reveal"]');
    await expect(reveal).toHaveAttribute('data-state', 'revealed', { timeout: 10_000 });
    await expect(reveal).toHaveAttribute('data-motion', 'reduce');
    await expect(reveal.locator('[data-slot="denoise-reveal-grain"]')).toHaveCount(0);
    await card(studio, 'Video 1').getByRole('button', { name: 'Open video 1' }).click();
    const video = stage(studio).locator('video');
    await expect(video).toHaveJSProperty('autoplay', false);
    await page.waitForTimeout(500);
    expect(await video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
    expect(await page.locator('video').evaluateAll((all) => all.filter((element) => !(element as HTMLVideoElement).paused).length)).toBe(0);
    // Play still works.
    await stage(studio).getByRole('button', { name: 'Play' }).click();
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => !element.paused)).toBe(true);
  });

  test('axe finds no serious issues while jobs wait, run, fail and finish, and with each result open', async ({ page }) => {
    const studio = await openStudio(page);
    const prompt = studio.getByRole('textbox', { name: 'Prompt' });
    await prompt.fill('A wreck on the sea floor');
    for (let count = 0; count < 3; count++) await studio.getByRole('button', { name: 'Generate' }).click();
    await expect(card(studio, 'Image 3')).toHaveAttribute('data-status', 'queued');
    expect(await seriousIssues(page)).toEqual([]);

    await studio.getByLabel('Failures').selectOption('1');
    await studio.getByRole('radio', { name: '1:1, square' }).check({ force: true });
    await studio.getByRole('button', { name: 'Generate' }).click();
    await expect(card(studio, 'Image 4')).toHaveAttribute('data-status', 'failed', { timeout: 10_000 });
    await expect(card(studio, 'Image 1')).toHaveAttribute('data-status', 'succeeded', { timeout: 10_000 });
    await card(studio, 'Image 1').getByRole('button', { name: 'Open image 1' }).click();
    expect(await seriousIssues(page)).toEqual([]);

    await studio.getByLabel('Failures').selectOption('0');
    await studio.getByRole('button', { name: /^Model: / }).click();
    const models = page.getByRole('dialog', { name: 'Models' });
    await expect(models).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
    expect(violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
    await models.getByRole('option', { name: /^Kling 2\.5 Pro / }).click();
    await studio.getByRole('button', { name: 'Generate' }).click();
    await expect(card(studio, 'Video 1')).toHaveAttribute('data-status', 'succeeded', { timeout: 15_000 });
    await card(studio, 'Video 1').getByRole('button', { name: 'Open video 1' }).click();
    await expect(stage(studio).getByRole('slider', { name: 'Seek' })).toBeVisible();
    expect(await seriousIssues(page)).toEqual([]);
  });

  test('runs live on the home page, its HTML there before its code', async ({ page }) => {
    await page.goto('./');
    // Server-rendered in place: the composer is in the page's HTML.
    const html = await (await page.request.get('./')).text();
    expect(html).toContain('data-slot="studio-note"');
    expect(html).not.toMatch(/<div hidden id="S:/);
    const studio = await openStudio(page, './');
    await studio.getByRole('textbox', { name: 'Prompt' }).fill('A wreck on the sea floor');
    await studio.getByRole('button', { name: 'Generate' }).click();
    await expect(card(studio, 'Image 1')).toHaveAttribute('data-status', 'succeeded', { timeout: 10_000 });
  });
});
