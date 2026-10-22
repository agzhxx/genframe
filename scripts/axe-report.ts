// What axe finds on the built site, at every impact level (spec section 2: no serious issues on any
// docs page), on every page as it loads and in the states that only appear after an interaction:
// open lists and dialogs, jobs waiting, running, failing and finished, opened results, previews
// playing, the reduced-motion versions and a phone's width. The end-to-end tests fail on serious
// and critical issues; this report also counts the moderate and minor ones. The Feed's media are
// the end-to-end tests' stand-ins (e2e/stand-ins.ts). docs/PERF.md records the result. Run
// `pnpm build` first.
//
//   node scripts/axe-report.ts [--dir out]

import path from 'node:path';
import { parseArgs } from 'node:util';
import AxeBuilder from '@axe-core/playwright';
import { chromium, type Browser, type Locator, type Page } from '@playwright/test';
import { serveFeedMedia } from '../e2e/stand-ins.ts';
import { mediaOrigin } from '../lib/feed-media.ts';
import { pagesIn } from './page-weights.ts';
import { serve } from './serve.ts';

type Impact = 'critical' | 'serious' | 'moderate' | 'minor';

export interface AxeResult {
  /** The page, or the page and the state it was checked in. */
  name: string;
  /** axe-core's version. */
  engine: string;
  counts: Record<Impact, number>;
  /** Each rule that failed, with its impact and how many elements: "region (moderate, 2)". */
  rules: string[];
}

interface State {
  name: string;
  path: string;
  /** The playground's name, when the state starts in one: it's opened once it has hydrated. */
  region?: string;
  reducedMotion?: boolean;
  width?: number;
  /** Brings the page into the state to check. */
  reach: (page: Page, region: Locator) => Promise<void>;
}

const card = (region: Locator, name: string) => region.getByRole('article', { name });

const states: State[] = [
  {
    name: 'search dialog open',
    path: 'docs/',
    reach: async (page) => {
      const dialog = page.getByRole('dialog');
      for (let attempt = 0; attempt < 50 && !(await dialog.isVisible()); attempt++) {
        await page.getByRole('button', { name: /search/i }).first().click();
        await page.waitForTimeout(200);
      }
      await dialog.getByRole('combobox').fill('slider');
      await page.waitForTimeout(800);
    },
  },
  {
    name: 'docs page at 390 px, menu open',
    path: 'docs/components/compare-slider/',
    width: 390,
    reach: async (page) => {
      await page.getByRole('button', { name: /open sidebar|menu|toggle sidebar/i }).first().click();
      await page.waitForTimeout(500);
    },
  },
  {
    name: 'CompareSlider, dragged, reduced motion',
    path: 'docs/components/compare-slider/',
    region: 'CompareSlider demo',
    reducedMotion: true,
    reach: async (page, region) => {
      await region.getByRole('slider').focus();
      await page.keyboard.press('Shift+ArrowLeft');
    },
  },
  {
    name: 'ModelPicker open, filtered',
    path: 'docs/components/model-picker/',
    region: 'ModelPicker demo',
    reach: async (page, region) => {
      await region.getByRole('button', { name: /^Model: / }).click();
      await page.getByRole('combobox', { name: 'Search models' }).fill('kling');
      await page.waitForTimeout(300);
    },
  },
  {
    name: 'ModelPicker open, nothing matches',
    path: 'docs/components/model-picker/',
    region: 'ModelPicker demo',
    reach: async (page, region) => {
      await region.getByRole('button', { name: /^Model: / }).click();
      await page.getByRole('combobox', { name: 'Search models' }).fill('zzz');
      await page.waitForTimeout(300);
    },
  },
  {
    name: 'PromptComposer, mention list open',
    path: 'docs/components/prompt-composer/',
    region: 'PromptComposer demo',
    reach: async (page, region) => {
      await region.getByRole('textbox', { name: 'Prompt' }).click();
      await page.keyboard.press('End');
      await page.keyboard.type(' @');
      await region.getByRole('listbox', { name: 'References' }).waitFor();
    },
  },
  {
    name: 'GenerationQueue, jobs waiting, running and failed',
    path: 'docs/components/generation-queue/',
    region: 'GenerationQueue demo',
    reach: async (page, region) => {
      await region.getByLabel('Speed').selectOption('4');
      await region.getByLabel('Failures').selectOption('0.5');
      await region.getByLabel('At once').selectOption('1');
      for (let job = 0; job < 4; job++) await region.getByRole('button', { name: 'Add job' }).click();
      await page.waitForTimeout(2500);
    },
  },
  {
    name: 'GenerationQueue, all finished, unknown progress',
    path: 'docs/components/generation-queue/',
    region: 'GenerationQueue demo',
    reach: async (page, region) => {
      await region.getByLabel('Speed').selectOption('4');
      await region.getByRole('switch', { name: 'Unknown progress' }).click();
      for (let job = 0; job < 3; job++) await region.getByRole('button', { name: 'Add job' }).click();
      await region.locator('[data-slot="generation-card"][data-status="running"]').first().waitFor();
      await page.waitForTimeout(6000);
    },
  },
  {
    name: 'MediaGrid, scrolled, a clip previewing',
    path: 'docs/components/media-grid/',
    region: 'MediaGrid demo',
    reach: async (page, region) => {
      const grid = region.getByRole('list', { name: 'Worlds from Generation Feed' });
      const box = await grid.boundingBox();
      if (!box) throw new Error('No grid');
      await page.mouse.move(box.x + box.width / 2, box.y + 150);
      for (let tick = 0; tick < 10; tick++) await page.mouse.wheel(0, 300);
      await page.waitForTimeout(800);
    },
  },
  {
    name: 'VideoScrubber, preview showing',
    path: 'docs/components/video-scrubber/',
    region: 'VideoScrubber demo',
    reach: async (page, region) => {
      const bar = await region.getByRole('slider', { name: 'Seek' }).boundingBox();
      if (!bar) throw new Error('No scrubber');
      await page.mouse.move(bar.x + bar.width * 0.6, bar.y + bar.height / 2);
      await page.waitForTimeout(400);
    },
  },
  {
    name: 'CameraMotionPicker, a move picked, reduced motion',
    path: 'docs/components/camera-motion-picker/',
    region: 'CameraMotionPicker demo',
    reducedMotion: true,
    reach: async (page, region) => {
      await region.getByRole('radio', { name: 'Orbit', exact: true }).check({ force: true });
      await page.waitForTimeout(300);
    },
  },
  {
    name: 'Studio, jobs waiting and running',
    path: 'studio/',
    region: 'Studio',
    reach: async (page, region) => {
      await region.getByRole('textbox', { name: 'Prompt' }).fill('A wreck on the sea floor');
      for (let job = 0; job < 3; job++) await region.getByRole('button', { name: 'Generate' }).click();
      await page.waitForTimeout(500);
    },
  },
  {
    name: 'Studio, draft and final open',
    path: 'studio/',
    region: 'Studio',
    reach: async (_page, region) => {
      await region.getByLabel('Speed').selectOption('4');
      await region.getByRole('textbox', { name: 'Prompt' }).fill('A wreck on the sea floor');
      await region.getByRole('button', { name: 'Generate' }).click();
      await card(region, 'Image 1').getByRole('button', { name: 'Open image 1' }).click({ timeout: 15_000 });
    },
  },
  {
    name: 'Studio, a clip open, reduced motion, phone width',
    path: 'studio/',
    region: 'Studio',
    reducedMotion: true,
    width: 390,
    reach: async (page, region) => {
      await region.getByLabel('Speed').selectOption('4');
      await region.getByRole('button', { name: /^Model: / }).click();
      await page.getByRole('dialog', { name: 'Models' }).getByRole('option', { name: /^Kling 2\.5 Pro / }).click();
      await region.getByRole('textbox', { name: 'Prompt' }).fill('The robot at night');
      await region.getByRole('button', { name: 'Generate' }).click();
      await card(region, 'Video 1').getByRole('button', { name: 'Open video 1' }).click({ timeout: 20_000 });
      await page.waitForTimeout(300);
    },
  },
];

async function check(browser: Browser, url: string, name: string, state?: State): Promise<AxeResult> {
  const context = await browser.newContext({
    viewport: { width: state?.width ?? 1280, height: 900 },
    reducedMotion: state?.reducedMotion ? 'reduce' : 'no-preference',
  });
  const page = await context.newPage();
  await page.route(`${mediaOrigin}/**`, serveFeedMedia);
  await page.goto(url);
  await page.getByRole('heading', { level: 1 }).first().waitFor();
  if (state) {
    const region = page.getByRole('region', { name: state.region ?? 'none', exact: true });
    if (state.region) {
      await page.waitForFunction((title) => document.querySelector(`[aria-label="${title}"]`)?.hasAttribute('data-hydrated'), state.region);
    } else {
      await page.waitForLoadState('load');
    }
    await state.reach(page, region);
  }
  const { violations, testEngine } = await new AxeBuilder({ page }).analyze();
  await context.close();
  const counts: Record<Impact, number> = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const violation of violations) if (violation.impact) counts[violation.impact] += 1;
  return {
    name,
    engine: testEngine.version,
    counts,
    rules: violations.map((violation) => `${violation.id} (${String(violation.impact)}, ${String(violation.nodes.length)})`),
  };
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { dir: { type: 'string', default: 'out' } } });
  const port = 4177;
  const server = await serve({ dir: path.resolve(values.dir), base: '/genframe', port });
  const browser = await chromium.launch({ channel: 'chrome' });
  const base = `http://127.0.0.1:${String(port)}/genframe`;
  const results: AxeResult[] = [];
  try {
    for (const page of pagesIn(path.resolve(values.dir))) results.push(await check(browser, `${base}${page}`, `\`${page}\``));
    for (const state of states) results.push(await check(browser, `${base}/${state.path}`, state.name, state));
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`axe-core ${results[0]?.engine ?? ''}, Google Chrome ${browser.version()}`);
  console.log('| Page or state | Critical | Serious | Moderate | Minor | Rules |');
  console.log('| --- | --- | --- | --- | --- | --- |');
  for (const result of results) {
    const { critical, serious, moderate, minor } = result.counts;
    console.log(`| ${result.name} | ${String(critical)} | ${String(serious)} | ${String(moderate)} | ${String(minor)} | ${result.rules.join(', ')} |`);
  }
  const total = (impact: Impact) => results.reduce((sum, result) => sum + result.counts[impact], 0);
  console.log(`\n${String(results.length)} checks: ${String(total('critical'))} critical, ${String(total('serious'))} serious, ${String(total('moderate'))} moderate, ${String(total('minor'))} minor.`);
}
