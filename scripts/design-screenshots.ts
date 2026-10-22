// Screenshots of the components at their key states, for the design hand-off: the PNGs in
// docs/design/screenshots/, which docs/design/README.md says to draw each Figma frame next to. They
// come from the built site, in Google Chrome at 1×, so a frame and its screenshot match pixel for
// pixel. The Feed's media are the end-to-end tests' stand-ins (e2e/stand-ins.ts): flat colors, so
// a frame shows the component rather than a photograph, and the files stay small. Then ffmpeg
// stores each with a palette of 256 colors, which UI in flat colors keeps as it is. Needs ffmpeg.
//
//   pnpm build && node scripts/design-screenshots.ts

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type Locator, type Page } from '@playwright/test';
import { serveFeedMedia } from '../e2e/stand-ins.ts';
import { mediaOrigin } from '../lib/feed-media.ts';
import { serve } from './serve.ts';

const root = path.resolve(import.meta.dirname, '..');
export const screenshotsFolder = 'docs/design/screenshots';
const port = 4174;
const base = `http://127.0.0.1:${String(port)}/genframe/`;

interface Shot {
  /** The file's name, without .png. */
  name: string;
  /** Opens the page, sets the state and returns what to capture. */
  take: (page: Page) => Promise<Locator>;
  /** Leaves animations where the shot holds them, rather than at their end. */
  held?: boolean;
}

// A page's playground, once React has hydrated it (as e2e/playground.ts waits).
async function playground(page: Page, pagePath: string, title: string) {
  await page.goto(`${base}${pagePath}`);
  await page.waitForFunction((name) => document.querySelector(`[aria-label="${name}"]`)?.hasAttribute('data-hydrated'), title);
  return page.getByRole('region', { name: title });
}

async function loaded(images: Locator) {
  for (const image of await images.all()) {
    await image.evaluate((element: HTMLImageElement) => (element.complete ? undefined : element.decode()));
  }
}

/** The key states, in the order docs/design/README.md lists their frames. */
export const shots: Shot[] = [
  {
    name: 'compare-slider',
    take: async (page) => {
      const region = await playground(page, 'docs/components/compare-slider/', 'CompareSlider demo');
      await loaded(region.locator('img'));
      return region.locator('[data-slot="compare-slider"]');
    },
  },
  {
    name: 'aspect-ratio-picker',
    take: async (page) => {
      const region = await playground(page, 'docs/components/aspect-ratio-picker/', 'AspectRatioPicker demo');
      return region.locator('[data-slot="aspect-ratio-picker"]');
    },
  },
  {
    name: 'model-picker-open',
    take: async (page) => {
      const region = await playground(page, 'docs/components/model-picker/', 'ModelPicker demo');
      await region.getByRole('button', { name: /^Model: / }).click();
      await page.keyboard.press('ArrowDown');
      return page.getByRole('dialog', { name: 'Models' });
    },
  },
  {
    name: 'prompt-composer',
    take: async (page) => {
      const region = await playground(page, 'docs/components/prompt-composer/', 'PromptComposer demo');
      await region.getByRole('textbox', { name: 'Prompt' }).click();
      await page.keyboard.type('Slow dolly in on the @');
      await loaded(region.locator('img'));
      return region.locator('[data-slot="prompt-composer"]');
    },
  },
  {
    name: 'generation-card-states',
    take: async (page) => {
      const region = await playground(page, 'docs/components/generation-card/', 'GenerationCard demo');
      await loaded(region.locator('img'));
      return region.getByRole('list', { name: 'Card states' });
    },
  },
  {
    name: 'denoise-reveal-grain',
    take: async (page) => {
      const region = await playground(page, 'docs/components/denoise-reveal/', 'DenoiseReveal demo');
      const reveal = region.locator('[data-slot="denoise-reveal"][data-state="revealed"]');
      await reveal.waitFor();
      await region.getByRole('button', { name: 'Replay' }).click();
      await region.locator('[data-slot="denoise-reveal"][data-state="revealing"]').waitFor();
      // Held at the start of the reveal: the grain over the ThumbHash.
      await page.evaluate(() => {
        for (const animation of document.getAnimations()) {
          animation.pause();
          animation.currentTime = 0;
        }
      });
      return region.locator('[data-slot="denoise-reveal"]');
    },
    held: true,
  },
  {
    name: 'media-card',
    take: async (page) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const region = await playground(page, 'docs/components/media-card/', 'MediaCard demo');
      await loaded(region.locator('[data-slot="media-card-poster"]'));
      return region.locator('[data-slot="media-card"]').first().locator('..');
    },
  },
  {
    name: 'video-scrubber-preview',
    take: async (page) => {
      const region = await playground(page, 'docs/components/video-scrubber/', 'VideoScrubber demo');
      const slider = region.getByRole('slider', { name: 'Seek' });
      await slider.and(page.locator('[aria-valuemax="4"]')).waitFor();
      const bar = await slider.boundingBox();
      if (!bar) throw new Error('No scrubber');
      await page.mouse.move(bar.x + bar.width * 0.6, bar.y + bar.height / 2);
      await loaded(region.locator('[data-slot="video-scrubber-thumbnail"] img'));
      return region.locator('figure');
    },
  },
  {
    name: 'camera-motion-picker',
    take: async (page) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const region = await playground(page, 'docs/components/camera-motion-picker/', 'CameraMotionPicker demo');
      const group = region.getByRole('radiogroup', { name: 'Camera motion' });
      await loaded(group.locator('img'));
      await page.mouse.move(0, 0);
      return group;
    },
  },
  {
    name: 'studio',
    take: async (page) => {
      // Tall enough for the whole Studio, so the bar at the top doesn't cover it.
      await page.setViewportSize({ width: 1280, height: 1600 });
      const studio = await playground(page, 'studio/', 'Studio');
      await studio.getByLabel('Speed').selectOption('4');
      await studio.getByRole('textbox', { name: 'Prompt' }).fill('A wreck on the sea floor, light from above');
      await studio.getByRole('button', { name: 'Generate' }).click();
      const job = studio.getByRole('article', { name: 'Image 1' });
      await job.locator('[data-slot="denoise-reveal"][data-state="revealed"]').waitFor({ timeout: 10_000 });
      await job.getByRole('button', { name: 'Open image 1' }).click();
      await loaded(studio.locator('[data-slot="studio-stage"] img'));
      await page.mouse.move(0, 0);
      return studio;
    },
  },
];

// Stores a screenshot with a palette of 256 colors: UI in flat colors stays as it is, at a third of the size or less.
function withPalette(file: string) {
  const work = mkdtempSync(path.join(tmpdir(), 'genframe-design-'));
  const out = path.join(work, path.basename(file));
  try {
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-i',
      file,
      '-filter_complex',
      'split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=none',
      out,
    ]);
    renameSync(out, file);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const folder = path.join(root, screenshotsFolder);
  mkdirSync(folder, { recursive: true });
  const server = await serve({ dir: path.join(root, 'out'), base: '/genframe', port });
  const browser = await chromium.launch({ channel: 'chrome' });
  let total = 0;
  try {
    for (const shot of shots) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
      await page.route(`${mediaOrigin}/**`, serveFeedMedia);
      const target = await shot.take(page);
      const file = path.join(folder, `${shot.name}.png`);
      await target.screenshot({ path: file, animations: shot.held ? 'allow' : 'disabled', caret: 'hide' });
      withPalette(file);
      const bytes = statSync(file).size;
      total += bytes;
      console.log(`${screenshotsFolder}/${shot.name}.png: ${(bytes / 1024).toFixed(1)} KB`);
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`${String(shots.length)} screenshots, ${(total / 1024).toFixed(1)} KB in all`);
}
