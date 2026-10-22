import { expect, test } from './media';
import { openPlayground } from './playground';

// Key states of each component, compared with screenshots taken before (spec section 5). The
// baselines in e2e/__screenshots__ come from Chrome on Linux, as CI runs it, since other systems
// draw text a little differently. .github/workflows/screenshots.yml makes them. Elsewhere these
// tests skip.
test.skip(process.platform !== 'linux', 'Screenshot baselines are made in Chrome on Linux, in CI');

for (const [position, keys] of [
  [0, ['Home']],
  [50, []],
  [100, ['End']],
] as const) {
  test(`CompareSlider at ${String(position)}%`, async ({ page }) => {
    const region = await openPlayground(page, 'docs/components/compare-slider/', 'CompareSlider demo');
    const slider = region.getByRole('slider');
    await slider.focus();
    for (const key of keys) await page.keyboard.press(key);
    await expect(slider).toHaveAttribute('aria-valuenow', String(position));
    await slider.blur();
    await expect(region.locator('[data-slot="compare-slider"]')).toHaveScreenshot(`compare-slider-${String(position)}.png`);
  });
}

test('AspectRatioPicker with disabled ratios', async ({ page }) => {
  const region = await openPlayground(page, 'docs/components/aspect-ratio-picker/', 'AspectRatioPicker demo');
  const picker = region.locator('[data-slot="aspect-ratio-picker"]');
  await expect(picker.getByRole('radio', { disabled: true })).toHaveCount(4);
  await expect(picker).toHaveScreenshot('aspect-ratio-picker-disabled.png');
});

test('ModelPicker open, in groups, with an active option', async ({ page }) => {
  const region = await openPlayground(page, 'docs/components/model-picker/', 'ModelPicker demo');
  await region.getByRole('button', { name: /^Model: / }).click();
  const dialog = page.getByRole('dialog', { name: 'Models' });
  await expect(dialog).toBeVisible();
  // The current model keeps its check mark; the one after it is active.
  await page.keyboard.press('ArrowDown');
  await expect(dialog.getByRole('option', { name: /^Kling 2\.5 Pro / })).toHaveAttribute('aria-selected', 'true');
  await expect(dialog).toHaveScreenshot('model-picker-open.png');
});

test('PromptComposer with references, presets and the mention list open', async ({ page }) => {
  const region = await openPlayground(page, 'docs/components/prompt-composer/', 'PromptComposer demo');
  await region.getByRole('textbox', { name: 'Prompt' }).click();
  await page.keyboard.type('Slow dolly in on the @');
  await expect(region.getByRole('listbox', { name: 'References' })).toBeVisible();
  await expect(region.locator('[data-slot="prompt-composer"]')).toHaveScreenshot('prompt-composer-mentions.png');
});

// One card in each state, from GenerationCard's gallery, which has no timers.
for (const [state, name] of [
  ['queued', 'Image 4'],
  ['running', 'Image 3'],
  ['running-unknown', 'Video 2'],
  ['succeeded', 'Image 2'],
  ['failed', 'Video 1'],
  ['canceled', 'Image 1'],
] as const) {
  test(`GenerationCard ${state}`, async ({ page }) => {
    const region = await openPlayground(page, 'docs/components/generation-card/', 'GenerationCard demo');
    const card = region.getByRole('article', { name });
    if (state === 'succeeded') await expect(card.getByRole('img')).toHaveJSProperty('complete', true);
    // The pulse of unknown progress is held at its start, as every animation is here.
    await expect(card).toHaveScreenshot(`generation-card-${state}.png`);
  });
}

test('DenoiseReveal at the start of its reveal, under its grain', async ({ page }) => {
  const region = await openPlayground(page, 'docs/components/denoise-reveal/', 'DenoiseReveal demo');
  const reveal = region.locator('[data-slot="denoise-reveal"]');
  await expect(reveal).toHaveAttribute('data-state', 'revealed');
  await region.getByRole('button', { name: 'Replay' }).click();
  await expect(reveal).toHaveAttribute('data-state', 'revealing');
  // Held at its first frame: the grain over the ThumbHash, and no image yet.
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      animation.pause();
      animation.currentTime = 0;
    }
  });
  await expect(reveal).toHaveScreenshot('denoise-reveal-grain.png', { animations: 'allow' });
});

test('MediaCard placeholders: each item’s ThumbHash, before its poster', async ({ page }) => {
  const region = await openPlayground(page, 'docs/components/media-card/', 'MediaCard demo');
  await region.getByRole('switch', { name: 'Posters' }).click();
  await expect(region.locator('[data-slot="media-card-poster"]')).toHaveCount(0);
  const cards = region.locator('[data-slot="media-card"]').first().locator('..');
  await expect(cards).toHaveScreenshot('media-card-placeholders.png');
});

test('MediaCard with reduced motion: posters, and play buttons on the clips', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const region = await openPlayground(page, 'docs/components/media-card/', 'MediaCard demo');
  await expect(region.getByRole('button', { name: 'Play preview' })).toHaveCount(2);
  for (const poster of await region.locator('[data-slot="media-card-poster"]').all()) {
    await expect(poster).toHaveJSProperty('complete', true);
  }
  const cards = region.locator('[data-slot="media-card"]').first().locator('..');
  await expect(cards).toHaveScreenshot('media-card-play-buttons.png');
});

test('MediaGrid’s first screen, placed in pixels', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const region = await openPlayground(page, 'docs/components/media-grid/', 'MediaGrid demo');
  const grid = region.getByRole('list', { name: 'Worlds from Generation Feed' });
  await expect(grid).toHaveAttribute('data-layout', 'pixels');
  const box = grid.locator('..');
  const boxRect = await box.boundingBox();
  // The posters in view: the first screen's, which load at once or soon.
  for (const poster of await grid.locator('[data-slot="media-card-poster"]').all()) {
    const rect = await poster.boundingBox();
    if (rect && boxRect && rect.y < boxRect.y + boxRect.height) await expect(poster).toHaveJSProperty('complete', true);
  }
  await expect(box).toHaveScreenshot('media-grid-first-screen.png');
});

test('VideoScrubber with its hover preview: a sprite tile and its timecode', async ({ page }) => {
  const region = await openPlayground(page, 'docs/components/video-scrubber/', 'VideoScrubber demo');
  const slider = region.getByRole('slider', { name: 'Seek' });
  // The tests' clip is 4 s; the video shows its poster until it plays or seeks.
  await expect(slider).toHaveAttribute('aria-valuemax', '4');
  const bar = await slider.boundingBox();
  if (!bar) throw new Error('No scrubber');
  await page.mouse.move(bar.x + bar.width * 0.6, bar.y + bar.height / 2);
  await expect(region.locator('[data-slot="video-scrubber-time"]')).toHaveText('00:00:02:09');
  await expect(region.locator('[data-slot="video-scrubber-thumbnail"] img')).toHaveJSProperty('complete', true);
  await expect(region.locator('figure')).toHaveScreenshot('video-scrubber-preview.png');
});

test('CameraMotionPicker with a picked tile', async ({ page }) => {
  const region = await openPlayground(page, 'docs/components/camera-motion-picker/', 'CameraMotionPicker demo');
  const group = region.getByRole('radiogroup', { name: 'Camera motion' });
  await expect(group.getByRole('radio', { name: 'Dolly in', exact: true })).toBeChecked();
  for (const poster of await group.locator('img').all()) await expect(poster).toHaveJSProperty('complete', true);
  await expect(group).toHaveScreenshot('camera-motion-picker-picked.png');
});

test('CameraMotionPicker with reduced motion: posters and play buttons', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const region = await openPlayground(page, 'docs/components/camera-motion-picker/', 'CameraMotionPicker demo');
  const group = region.getByRole('radiogroup', { name: 'Camera motion' });
  await expect(group.getByRole('button', { name: /^Play preview of / })).toHaveCount(8);
  for (const poster of await group.locator('img').all()) await expect(poster).toHaveJSProperty('complete', true);
  await expect(group).toHaveScreenshot('camera-motion-picker-reduced.png');
});

// The Studio is taller than the default window: a tall one, so the bar at the top doesn't cover it.
test('Studio with an image’s draft and final open', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1600 });
  const studio = await openPlayground(page, 'studio/', 'Studio');
  await studio.getByLabel('Speed').selectOption('4');
  await studio.getByRole('textbox', { name: 'Prompt' }).fill('A wreck on the sea floor, light from above');
  await studio.getByRole('button', { name: 'Generate' }).click();
  const job = studio.getByRole('article', { name: 'Image 1' });
  await expect(job.locator('[data-slot="denoise-reveal"]')).toHaveAttribute('data-state', 'revealed', { timeout: 10_000 });
  await job.getByRole('button', { name: 'Open image 1' }).click();
  for (const image of await studio.locator('[data-slot="studio-stage"] img').all()) {
    await expect(image).toHaveJSProperty('complete', true);
  }
  await page.mouse.move(0, 0);
  await expect(studio).toHaveScreenshot('studio-image-open.png');
});

test('Studio with reduced motion and a video model: camera moves with play buttons, one picked', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 1600 });
  const studio = await openPlayground(page, 'studio/', 'Studio');
  await studio.getByRole('button', { name: /^Model: / }).click();
  await page.getByRole('dialog', { name: 'Models' }).getByRole('option', { name: /^Cinema Studio 4\.0 / }).click();
  const moves = studio.getByRole('radiogroup', { name: 'Camera move' });
  await moves.getByRole('radio', { name: 'Crane up', exact: true }).check({ force: true });
  for (const poster of await moves.locator('img').all()) await expect(poster).toHaveJSProperty('complete', true);
  await page.mouse.move(0, 0);
  await expect(studio).toHaveScreenshot('studio-camera-moves-reduced.png');
});
