import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './media';
import { openPlayground } from './playground';

// The media grid and card on their docs pages (spec section 5, end-to-end tests 7 and 8): a long
// grid scrolled to its end never has more live videos than its pool holds, CSS places the first
// screen where the pixel layout puts it, and with reduced motion nothing plays by itself. The
// playground's grid holds 120 of the Feed's worlds, 30 of them clips, and scrolls in its own box.
const gridPage = 'docs/components/media-grid/';
const cardPage = 'docs/components/media-card/';

async function openGrid(page: Page) {
  const region = await openPlayground(page, gridPage, 'MediaGrid demo');
  const grid = region.getByRole('list', { name: 'Worlds from Generation Feed' });
  await expect(grid).toHaveAttribute('data-layout', 'pixels');
  return { region, grid };
}

function liveVideos(region: Locator) {
  return region.locator('[data-slot="live-videos"]');
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

test.describe('MediaGrid', () => {
  test('scrolled to its end with clips hovered on the way, it never has more live videos than its pool', async ({ page }) => {
    test.setTimeout(120_000);
    const videosSeen = await countVideosSeen(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    const { region, grid } = await openGrid(page);
    await region.getByLabel('Pool size').selectOption('2');
    const box = grid.locator('..');

    let hovered = 0;
    let maxCards = 0;
    let maxVideos = 0;
    let lastPosition = 0;
    for (let step = 0; step < 200 && lastPosition < 120; step++) {
      // Rest the pointer on each clip in view just past the 100 ms intent: a fast sweep.
      const boxRect = await box.boundingBox();
      const clips = grid.locator('[role="listitem"]:has([data-kind="video"]) [data-slot="media-card-link"]');
      for (let index = 0, count = await clips.count(); index < count; index++) {
        const rect = await clips.nth(index).boundingBox();
        const middle = rect ? rect.y + rect.height / 2 : Number.NaN;
        if (!rect || !boxRect || middle < boxRect.y + 10 || middle > boxRect.y + boxRect.height - 10) continue;
        await page.mouse.move(rect.x + rect.width / 2, middle);
        await page.waitForTimeout(150);
        hovered++;
        maxVideos = Math.max(maxVideos, await page.locator('video').count());
        const live = Number(await liveVideos(region).getAttribute('data-live'));
        expect(live).toBeLessThanOrEqual(2);
      }
      const state = await grid.evaluate((list) => {
        const cards = [...list.querySelectorAll('[role="listitem"]')];
        return { cards: cards.length, last: Math.max(...cards.map((card) => Number(card.getAttribute('aria-posinset')))) };
      });
      maxCards = Math.max(maxCards, state.cards);
      lastPosition = Math.max(lastPosition, state.last);
      await box.evaluate((element) => {
        element.scrollBy({ top: element.clientHeight * 0.5, behavior: 'instant' });
      });
      await page.waitForTimeout(50);
    }

    expect(lastPosition).toBe(120);
    expect(hovered).toBeGreaterThan(20);
    expect(maxVideos).toBeLessThanOrEqual(2);
    // The pool lends the same two videos from card to card.
    expect(await videosSeen()).toBe(2);
    // Only the cards within about a screen of the view are in the page.
    expect(maxCards).toBeLessThan(60);
    await expect(liveVideos(region)).toHaveAttribute('data-size', '2');
  });

  test('a clip plays its preview within 1.5 s of the pointer resting on it', async ({ page }) => {
    const { grid } = await openGrid(page);
    const clip = grid.locator('[role="listitem"]:has([data-kind="video"])').first();
    await clip.locator('[data-slot="media-card-link"]').hover();
    const video = clip.locator('video');
    await expect
      .poll(() => video.evaluate((element) => !(element as HTMLVideoElement).paused && (element as HTMLVideoElement).currentTime > 0), {
        timeout: 1500,
      })
      .toBe(true);
    await expect(clip.locator('[data-slot="media-card-preview"]')).not.toHaveClass(/opacity-0/);

    const { violations } = await new AxeBuilder({ page }).include('[aria-label="MediaGrid demo"]').analyze();
    const serious = violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
    expect(serious.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });

  test('a plain click opens a card in place; Ctrl or Cmd-click keeps the link', async ({ page }) => {
    const { region, grid } = await openGrid(page);
    const card = grid.getByRole('link').first();
    await expect(card).toHaveAttribute('href', /^https:\/\/generation-feed\.vercel\.app\/m\/[0-9a-v]{10}$/);
    await card.click();
    await expect(region.getByText(/^Opened: /)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${gridPage}$`));
  });

  for (const width of [390, 1280]) {
    test(`CSS places the first screen where the pixel layout does, at ${String(width)} px`, async ({ browser }) => {
      const viewport = { width, height: 900 };
      async function read(javaScriptEnabled: boolean) {
        const context = await browser.newContext({ viewport, javaScriptEnabled });
        const page = await context.newPage();
        await page.route('https://pub-b6efd72fde71478fa4b96c65e2f0928d.r2.dev/**', (route) => route.abort());
        await page.goto(gridPage);
        const grid = page.getByRole('list', { name: 'Worlds from Generation Feed' });
        await expect(grid).toHaveAttribute('data-layout', javaScriptEnabled ? 'pixels' : 'css');
        const cards = await grid.evaluate((list) => {
          const origin = list.getBoundingClientRect();
          return [...list.querySelectorAll('[role="listitem"]')].map((card) => {
            const rect = card.getBoundingClientRect();
            return {
              position: Number(card.getAttribute('aria-posinset')),
              x: rect.x - origin.x,
              y: rect.y - origin.y,
              width: rect.width,
              height: rect.height,
            };
          });
        });
        await context.close();
        return cards;
      }

      const css = await read(false);
      expect(css).toHaveLength(40);
      const pixels = await read(true);
      const byPosition = new Map(css.map((card) => [card.position, card]));
      const compared = pixels.filter((card) => byPosition.has(card.position));
      expect(compared.length).toBeGreaterThan(5);
      for (const card of compared) {
        const before = byPosition.get(card.position);
        for (const key of ['x', 'y', 'width', 'height'] as const) {
          expect(Math.abs(card[key] - (before?.[key] ?? Number.NaN)), `card ${String(card.position)} ${key}`).toBeLessThan(0.5);
        }
      }
    });
  }

  test('with reduced motion nothing plays by itself; a play button plays it', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { grid } = await openGrid(page);
    const clip = grid.locator('[role="listitem"]:has([data-kind="video"])').first();
    // Near the corner: the play button covers the middle.
    await clip.locator('[data-slot="media-card-link"]').hover({ position: { x: 12, y: 12 } });
    await page.waitForTimeout(600);
    await expect(page.locator('video')).toHaveCount(0);

    await clip.getByRole('button', { name: 'Play preview' }).click();
    await expect(clip.getByRole('button', { name: 'Pause preview' })).toHaveAttribute('aria-pressed', 'true');
    await expect(clip.locator('video')).toHaveCount(1);
  });
});

test.describe('MediaCard', () => {
  test('a clip previews on hover; a card without a link is a button named by its caption', async ({ page }) => {
    const region = await openPlayground(page, cardPage, 'MediaCard demo');
    const clip = region.locator('[data-slot="media-card"][data-kind="video"]').first();
    await clip.locator('[data-slot="media-card-link"]').hover();
    await expect(clip.locator('video')).toHaveCount(1);

    const button = region.getByRole('button', { name: 'Sun rays over the lake A card that’s a button' });
    await button.click();
    await expect(region.getByText(/^Opened: Sun rays/)).toBeVisible();

    await region.getByLabel('Placeholder').selectOption('color');
    await region.getByRole('switch', { name: 'Posters' }).click();
    await expect(region.locator('[data-slot="media-card-poster"]')).toHaveCount(0);
    await expect(region.locator('[data-slot="media-card-media"]').first()).toHaveCSS('background-color', /^rgb\(/);
  });
});
