import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './media';
import { openPlayground } from './playground';

// The queue's part of spec section 5, end-to-end test 6 (submit → queued → running → reveal →
// open), on GenerationQueue's docs page. Its playground runs jobs on the simulated generator: 3 to
// 6 s for an image at 1×, seeded, so the same jobs run the same way every time.
const queuePage = 'docs/components/generation-queue/';

async function open(page: Page) {
  const region = await openPlayground(page, queuePage, 'GenerationQueue demo');
  return {
    region,
    add: region.getByRole('button', { name: 'Add job' }),
    card: (name: string) => region.getByRole('article', { name }),
    set: async (label: 'At once' | 'Failures' | 'Speed', value: string) => {
      await region.getByLabel(label).selectOption(value);
    },
  };
}

function statusOf(card: Locator) {
  return card.locator('[data-slot="generation-card-status"]');
}

// How many of the queue's cards are sliding: transitions of transform on its items.
function slidingCards(page: Page) {
  return page.evaluate(
    () =>
      document
        .getAnimations()
        .filter(
          (animation) =>
            (animation as CSSTransition).transitionProperty === 'transform' &&
            animation.effect instanceof KeyframeEffect &&
            animation.effect.target?.matches('[data-slot="generation-queue-item"]'),
        ).length,
  );
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

async function seriousIssues(page: Page) {
  const { violations } = await new AxeBuilder({ page }).include('[aria-label="GenerationQueue demo"]').analyze();
  return violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id}: ${violation.help} (${String(violation.nodes.length)})`);
}

test.describe('GenerationQueue', () => {
  test('a job waits in line, runs, is revealed and opens', async ({ page }) => {
    const { region, add, card, set } = await open(page);
    await set('At once', '1');
    await set('Failures', '0');
    const heard = await listen(page);
    await add.click();
    await add.click();

    const first = card('Image 1');
    const second = card('Image 2');
    await expect(second).toHaveAttribute('data-status', 'queued');
    await expect(statusOf(second)).toHaveText(/^Next in line · done in about \d+ s$/);
    const bar = first.getByRole('progressbar', { name: 'Image 1' });
    await expect(bar).toHaveAttribute('aria-valuenow', /^\d+$/);
    await expect(bar).toHaveAttribute('aria-valuetext', /^\d+%, (about \d+ seconds? left|almost done)$/);

    await expect(first).toHaveAttribute('data-status', 'succeeded', { timeout: 10_000 });
    await expect(first.locator('[data-slot="denoise-reveal"]')).toHaveAttribute('data-state', 'revealed');
    await expect(second).toHaveAttribute('data-status', 'running');
    await first.getByRole('button', { name: 'Open image 1' }).click();
    await expect(region.locator('[data-slot="demo-opened"]')).toContainText('Opened Image 1');
    // Each click is its own change; a job that waited starts without a word.
    expect((await heard()).slice(0, 3)).toEqual(['Image 1 started', 'Image 2 queued', 'Image 1 is ready']);
  });

  test('cancel refunds a job in line, not a running one; retry queues it again in its place', async ({ page }) => {
    const { region, add, card, set } = await open(page);
    await set('At once', '1');
    const heard = await listen(page);
    await add.click();
    await add.click();

    await card('Image 2').getByRole('button', { name: 'Cancel image 2' }).click();
    await expect(statusOf(card('Image 2'))).toHaveText('Canceled · refunded');
    await card('Image 1').getByRole('button', { name: 'Cancel image 1' }).click();
    await expect(statusOf(card('Image 1'))).toHaveText('Canceled');

    await card('Image 2').getByRole('button', { name: 'Retry image 2' }).click();
    await expect(card('Image 2')).toHaveAttribute('data-status', 'running');
    await card('Image 1').getByRole('button', { name: 'Retry image 1' }).click();
    await expect(statusOf(card('Image 1'))).toHaveText(/^Next in line/);
    // Newest first, as before the retries.
    await expect(region.getByRole('article')).toHaveCount(2);
    expect(await region.getByRole('article').evaluateAll((cards) => cards.map((card) => card.textContent.slice(0, 7)))).toEqual([
      'Image 2',
      'Image 1',
    ]);
    expect(await heard()).toEqual([
      'Image 1 started',
      'Image 2 queued',
      'Image 2 canceled, refunded',
      'Image 1 canceled',
      'Image 2 started',
      'Image 1 queued',
    ]);
  });

  test('a failed job says why, and a retry can succeed', async ({ page }) => {
    const { add, card, set } = await open(page);
    await set('Failures', '1');
    await set('Speed', '4');
    const heard = await listen(page);
    await add.click();
    const job = card('Image 1');
    await expect(statusOf(job)).toHaveText('Failed: Simulated failure', { timeout: 10_000 });
    await set('Failures', '0');
    await job.getByRole('button', { name: 'Retry image 1' }).click();
    await expect(job).toHaveAttribute('data-status', 'succeeded', { timeout: 10_000 });
    expect(await heard()).toEqual([
      'Image 1 started',
      'Image 1 failed: Simulated failure',
      'Image 1 started',
      'Image 1 is ready',
    ]);
  });

  test('removing a card moves focus to the next one, and the others slide into the gap', async ({ page }) => {
    const { region, add, card, set } = await open(page);
    await set('At once', '3');
    await set('Failures', '0');
    await set('Speed', '4');
    for (let count = 0; count < 3; count++) await add.click();
    for (const name of ['Image 1', 'Image 2', 'Image 3']) {
      await expect(card(name).locator('[data-slot="denoise-reveal"]')).toHaveAttribute('data-state', 'revealed', {
        timeout: 10_000,
      });
    }
    await card('Image 3').getByRole('button', { name: 'Remove image 3' }).focus();
    await page.keyboard.press('Enter');
    expect(await slidingCards(page)).toBeGreaterThan(0);
    await expect(card('Image 3')).toHaveCount(0);
    await expect(card('Image 2')).toBeFocused();

    // With reduced motion, they jump.
    await region.getByRole('switch', { name: 'Reduced motion' }).click();
    await card('Image 2').getByRole('button', { name: 'Remove image 2' }).click();
    expect(await slidingCards(page)).toBe(0);
    await expect(card('Image 1')).toBeFocused();
  });

  test('unknown progress has no value, and its pulse keeps still with reduced motion', async ({ page }) => {
    const { region, add, card } = await open(page);
    await region.getByRole('switch', { name: 'Unknown progress' }).click();
    await add.click();
    const job = card('Image 1');
    const bar = job.getByRole('progressbar', { name: 'Image 1' });
    await expect(bar).toHaveAttribute('aria-valuetext', /^Generating, about \d+ seconds left$/);
    expect(await bar.getAttribute('aria-valuenow')).toBeNull();
    const shimmer = job.locator('[data-slot="generation-card-shimmer"]');
    await expect(shimmer).toHaveCSS('animation-name', 'pulse');
    await region.getByRole('switch', { name: 'Reduced motion' }).click();
    await expect(shimmer).toHaveCSS('animation-name', 'none');
  });

  test('axe finds no serious issues while jobs wait, run, fail and finish', async ({ page }) => {
    const { add, card, set } = await open(page);
    await set('At once', '1');
    await set('Failures', '0');
    await set('Speed', '4');
    await add.click();
    await add.click();
    await expect(card('Image 2')).toHaveAttribute('data-status', 'queued');
    expect(await seriousIssues(page)).toEqual([]);
    await expect(card('Image 1')).toHaveAttribute('data-status', 'succeeded', { timeout: 10_000 });
    await set('Failures', '1');
    await add.click();
    await expect(card('Image 3')).toHaveAttribute('data-status', 'failed', { timeout: 10_000 });
    await card('Image 2').getByRole('button', { name: /^(Cancel|Remove) image 2$/ }).click();
    expect(await seriousIssues(page)).toEqual([]);
  });
});
