import { expect, test } from './media';
import { openPlayground } from './playground';

// DenoiseReveal on its docs page: Replay remounts it, and its image, from the cache, is revealed
// again from grain.
const revealPage = 'docs/components/denoise-reveal/';

test.describe('DenoiseReveal', () => {
  test('Replay grows the image out of grain and blur, which then leaves', async ({ page }) => {
    const region = await openPlayground(page, revealPage, 'DenoiseReveal demo');
    const reveal = region.locator('[data-slot="denoise-reveal"]');
    await expect(reveal).toHaveAttribute('data-state', 'revealed');
    await region.getByRole('switch', { name: 'Slow motion (0.25×)' }).click();
    await region.getByRole('button', { name: 'Replay' }).click();
    await expect(reveal).toHaveAttribute('data-state', 'revealing');
    const image = reveal.getByRole('img');
    await expect(image).toHaveCSS('transition-property', 'opacity, filter');
    await expect(image).toHaveCSS('transition-duration', '2.4s');
    await expect(reveal.locator('[data-slot="denoise-reveal-grain"]')).toHaveCSS('mix-blend-mode', 'hard-light');
    await expect(reveal).toHaveAttribute('data-state', 'revealed', { timeout: 5000 });
    await expect(reveal.locator('[data-slot="denoise-reveal-grain"]')).toHaveCount(0);
    await expect(image).toHaveCSS('filter', 'none');
    await expect(image).toHaveCSS('opacity', '1');
  });

  test('takes 600 ms at full speed', async ({ page }) => {
    const region = await openPlayground(page, revealPage, 'DenoiseReveal demo');
    await region.getByRole('button', { name: 'Replay' }).click();
    await expect(region.locator('[data-slot="denoise-reveal"] img')).toHaveCSS('transition-duration', '0.6s');
  });

  test('with reduced motion, only fades the image in, quickly, with no grain', async ({ page }) => {
    const region = await openPlayground(page, revealPage, 'DenoiseReveal demo');
    await region.getByRole('switch', { name: 'Reduced motion' }).click();
    await region.getByRole('button', { name: 'Replay' }).click();
    const reveal = region.locator('[data-slot="denoise-reveal"]');
    await expect(reveal).toHaveAttribute('data-motion', 'reduce');
    await expect(reveal.locator('[data-slot="denoise-reveal-grain"]')).toHaveCount(0);
    await expect(reveal.getByRole('img')).toHaveCSS('transition-property', 'opacity');
    await expect(reveal.getByRole('img')).toHaveCSS('transition-duration', '0.12s');
    await expect(reveal).toHaveAttribute('data-state', 'revealed');
  });

  test('GenerationCard’s gallery replays a result arriving, revealed', async ({ page }) => {
    const region = await openPlayground(page, 'docs/components/generation-card/', 'GenerationCard demo');
    await region.getByRole('button', { name: 'Replay the reveal' }).click();
    const card = region.getByRole('article', { name: 'Image 2' });
    await expect(card).toHaveAttribute('data-status', 'running');
    await expect(card.locator('[data-slot="denoise-reveal"]')).toHaveAttribute('data-state', 'revealed', { timeout: 5000 });
    await card.getByRole('button', { name: 'Open image 2' }).click();
    await expect(region).toContainText('Pressed: Open image 2');
  });
});
