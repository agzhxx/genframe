// How the playgrounds and the Studio respond to real interactions, in the lab (spec section 2:
// interactions at 60 fps, INP ≤ 100 ms). Each scenario opens a page of the built site in Google
// Chrome, waits for its playground to hydrate, slows the CPU 4× (Lighthouse's mobile preset), then
// drags, types, clicks and presses keys the way a person does. Two measures:
//
// - Interaction to Next Paint, from the Event Timing API: each interaction (a click, a tap, a key)
//   takes as long as its slowest event, from the input to the next paint, in steps of 8 ms; INP is
//   the slowest interaction, or the 98th percentile once there are 50 or more. Events that aren't
//   interactions (a drag's pointer moves, scrolling) don't count towards INP: the frames show them.
// - Frames, from requestAnimationFrame's intervals while the scenario runs: the median, the 95th
//   percentile and the share longer than 20 ms (a frame missed at 60 Hz).
//
// The Feed's media are the end-to-end tests' stand-ins (e2e/stand-ins.ts), so the numbers don't
// depend on the network. docs/PERF.md records them. Run `pnpm build` first.
//
//   node scripts/interactions.ts [--dir out] [--throttle 4] [--only studio,compare-slider]

import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type Browser, type Locator, type Page } from '@playwright/test';
import { serveFeedMedia } from '../e2e/stand-ins.ts';
import { mediaOrigin } from '../lib/feed-media.ts';
import { serve } from './serve.ts';

export interface InteractionReport {
  scenario: string;
  /** Interactions the page counted (`performance.interactionCount`). */
  interactions: number;
  /** In milliseconds; 0 when no interaction took 16 ms or more, Event Timing's least. */
  inp: number;
  /** The slowest interaction's events and target, as "keydown on textarea". */
  slowest: string;
  frames: number;
  medianFrame: number;
  p95Frame: number;
  /** The share of frames longer than 20 ms, from 0 to 1. */
  longFrames: number;
}

interface PageRecord {
  events: { name: string; duration: number; interactionId: number; target: string }[];
  interactionCount: number;
  intervals: number[];
}

// Runs in the page before its scripts: records Event Timing entries, and frames between start()
// and stop().
function record() {
  const events: PageRecord['events'] = [];
  const intervals: number[] = [];
  let recording = false;
  let last = 0;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as PerformanceEventTiming[]) {
      const target = entry.target instanceof Element ? entry.target : null;
      const slot = target?.getAttribute('data-slot');
      const name = target ? `${target.tagName.toLowerCase()}${slot ? `[${slot}]` : ''}` : '';
      events.push({ name: entry.name, duration: entry.duration, interactionId: entry.interactionId, target: name });
    }
    // 16 ms is the least Event Timing reports; TypeScript's DOM types don't know the option yet.
  }).observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
  function frame(now: number) {
    if (!recording) return;
    if (last) intervals.push(now - last);
    last = now;
    requestAnimationFrame(frame);
  }
  Object.assign(window, {
    lab: {
      start() {
        recording = true;
        last = 0;
        requestAnimationFrame(frame);
      },
      stop(): PageRecord {
        recording = false;
        return { events, interactionCount: performance.interactionCount, intervals };
      },
    },
  });
}

/** INP from Event Timing entries: the slowest interaction, ignoring one in every 50. */
export function interactionToNextPaint(events: PageRecord['events'], interactionCount: number) {
  const byInteraction = new Map<number, { duration: number; names: Set<string>; target: string }>();
  for (const event of events) {
    if (!event.interactionId) continue;
    const seen = byInteraction.get(event.interactionId);
    if (!seen) byInteraction.set(event.interactionId, { duration: event.duration, names: new Set([event.name]), target: event.target });
    else {
      seen.names.add(event.name);
      if (event.duration > seen.duration) {
        seen.duration = event.duration;
        seen.target = event.target || seen.target;
      }
    }
  }
  const slowest = [...byInteraction.values()].sort((a, b) => b.duration - a.duration);
  const skip = Math.min(Math.floor(interactionCount / 50), Math.max(0, slowest.length - 1));
  const chosen = slowest[skip];
  return {
    inp: chosen?.duration ?? 0,
    slowest: chosen ? `${[...chosen.names].join('/')} on ${chosen.target || 'the page'}` : '',
  };
}

function percentile(values: number[], share: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0;
}

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Not on the page');
  return box;
}

/**
 * Clicks the middle of an element with plain mouse events. Playwright's own click() checks its
 * target from inside the page while the events run, which would count towards their time.
 */
async function click(page: Page, locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  const box = await boxOf(locator);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/** Drags the mouse from one point to the next through each, in `steps` moves per stretch. */
async function drag(page: Page, points: [number, number][], steps = 30) {
  const [first, ...rest] = points;
  if (!first) return;
  await page.mouse.move(first[0], first[1]);
  await page.mouse.down();
  for (const [x, y] of rest) await page.mouse.move(x, y, { steps });
  await page.mouse.up();
}

interface Scenario {
  name: string;
  path: string;
  /** The playground's name; its `data-hydrated` says when it responds. */
  region: string;
  /** Settings made before the CPU is slowed: they aren't part of the measurement. */
  prepare?: (region: Locator, page: Page) => Promise<void>;
  run: (region: Locator, page: Page) => Promise<void>;
}

const scenarios: Scenario[] = [
  {
    name: 'compare-slider',
    path: 'docs/components/compare-slider/',
    region: 'CompareSlider demo',
    run: async (region, page) => {
      const box = await boxOf(region.locator('[data-slot="compare-slider"]'));
      const handle = await boxOf(region.getByRole('slider'));
      const y = box.y + box.height / 2;
      // Drag the handle across and back, click where it should spring to, then the keys.
      await drag(page, [
        [handle.x + handle.width / 2, handle.y + handle.height / 2],
        [box.x + box.width * 0.15, y],
        [box.x + box.width * 0.85, y],
        [box.x + box.width * 0.5, y],
      ]);
      await page.mouse.click(box.x + box.width * 0.2, y);
      await page.waitForTimeout(400);
      await page.mouse.click(box.x + box.width * 0.8, y);
      await page.waitForTimeout(400);
      for (const key of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'Shift+ArrowLeft', 'PageDown', 'Home', 'End']) {
        await page.keyboard.press(key);
        await page.waitForTimeout(120);
      }
    },
  },
  {
    name: 'aspect-ratio-picker',
    path: 'docs/components/aspect-ratio-picker/',
    region: 'AspectRatioPicker demo',
    run: async (region, page) => {
      await region.getByRole('radio', { checked: true }).first().focus();
      for (let step = 0; step < 7; step++) {
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(250);
      }
      await click(page, region.getByRole('radio', { name: /^1:1/ }).first());
      await page.waitForTimeout(300);
    },
  },
  {
    name: 'model-picker',
    path: 'docs/components/model-picker/',
    region: 'ModelPicker demo',
    run: async (region, page) => {
      await click(page, region.getByRole('button', { name: /^Model: / }));
      const search = page.getByRole('combobox', { name: 'Search models' });
      await search.waitFor();
      await page.keyboard.type('kling', { delay: 80 });
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await search.waitFor({ state: 'detached' });
      await page.waitForTimeout(300);
      await click(page, region.getByRole('button', { name: /^Model: / }));
      await search.waitFor();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    },
  },
  {
    name: 'prompt-composer',
    path: 'docs/components/prompt-composer/',
    region: 'PromptComposer demo',
    run: async (region, page) => {
      await click(page, region.getByRole('textbox', { name: 'Prompt' }));
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.press('Backspace');
      await page.keyboard.type('A red car on a mountain road at dusk, rain on the glass, ', { delay: 60 });
      await page.keyboard.type('@c', { delay: 60 });
      await region.getByRole('listbox', { name: 'References' }).waitFor();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await page.keyboard.type('in the lead', { delay: 60 });
      await page.keyboard.press('ControlOrMeta+Enter');
      await page.waitForTimeout(500);
    },
  },
  {
    name: 'generation-queue',
    path: 'docs/components/generation-queue/',
    region: 'GenerationQueue demo',
    prepare: async (region) => {
      await region.getByLabel('Speed').selectOption('4');
      await region.getByLabel('Failures').selectOption('0');
    },
    run: async (region, page) => {
      const add = region.getByRole('button', { name: 'Add job' });
      // Each new job joins at the top and the others slide down; two run at once, the rest wait.
      for (let job = 0; job < 4; job++) {
        await click(page, add);
        await page.waitForTimeout(300);
      }
      const reveals = region.locator('[data-slot="denoise-reveal"][data-state="revealed"]');
      await reveals.nth(3).waitFor({ timeout: 20_000 });
      await page.waitForTimeout(800);
      // Removing cards slides the ones below them up.
      await click(page, region.getByRole('button', { name: /^Remove image 3$/ }));
      await page.waitForTimeout(400);
      await click(page, region.getByRole('button', { name: /^Remove image 1$/ }));
      await page.waitForTimeout(600);
    },
  },
  {
    name: 'denoise-reveal',
    path: 'docs/components/denoise-reveal/',
    region: 'DenoiseReveal demo',
    run: async (region, page) => {
      for (let replay = 0; replay < 3; replay++) {
        await click(page, region.getByRole('button', { name: 'Replay' }));
        await region.locator('[data-slot="denoise-reveal"][data-state="revealed"]').waitFor();
        await page.waitForTimeout(300);
      }
    },
  },
  {
    name: 'media-grid',
    path: 'docs/components/media-grid/',
    region: 'MediaGrid demo',
    run: async (region, page) => {
      const grid = await boxOf(region.getByRole('list', { name: 'Worlds from Generation Feed' }));
      await page.mouse.move(grid.x + grid.width / 2, grid.y + 120);
      for (let tick = 0; tick < 24; tick++) {
        await page.mouse.wheel(0, 240);
        await page.waitForTimeout(50);
      }
      // Rest on a few cards on the way back, as someone looking for a clip would.
      for (let tick = 0; tick < 6; tick++) {
        await page.mouse.wheel(0, -400);
        await page.mouse.move(grid.x + grid.width * (0.2 + 0.15 * (tick % 4)), grid.y + 150, { steps: 5 });
        await page.waitForTimeout(250);
      }
    },
  },
  {
    name: 'video-scrubber',
    path: 'docs/components/video-scrubber/',
    region: 'VideoScrubber demo',
    prepare: async (region) => {
      await region.getByLabel('Frame rate').selectOption('30');
    },
    run: async (region, page) => {
      const bar = await boxOf(region.getByRole('slider', { name: 'Seek' }));
      const y = bar.y + bar.height / 2;
      await page.mouse.move(bar.x + bar.width * 0.1, y);
      await page.mouse.move(bar.x + bar.width * 0.9, y, { steps: 30 });
      await drag(page, [
        [bar.x + bar.width * 0.2, y],
        [bar.x + bar.width * 0.8, y],
        [bar.x + bar.width * 0.4, y],
      ]);
      await page.mouse.click(bar.x + bar.width * 0.6, y);
      for (const key of ['.', '.', '.', ',', 'ArrowRight', 'ArrowLeft', 'Home']) {
        await page.keyboard.press(key);
        await page.waitForTimeout(150);
      }
    },
  },
  {
    name: 'camera-motion-picker',
    path: 'docs/components/camera-motion-picker/',
    region: 'CameraMotionPicker demo',
    run: async (region, page) => {
      const group = region.getByRole('radiogroup', { name: 'Camera motion' });
      const tiles = group.locator('[data-slot="camera-motion-picker-option"]');
      for (let tile = 0; tile < 3; tile++) {
        const box = await boxOf(tiles.nth(tile));
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3, { steps: 8 });
        await page.waitForTimeout(500);
      }
      await group.getByRole('radio').first().focus();
      for (let step = 0; step < 4; step++) {
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(400);
      }
    },
  },
  {
    name: 'studio',
    path: 'studio/',
    region: 'Studio',
    prepare: async (region) => {
      await region.getByLabel('Speed').selectOption('4');
    },
    run: async (region, page) => {
      // An image: type the prompt, generate three, watch them wait, run and reveal, open the first.
      await click(page, region.getByRole('textbox', { name: 'Prompt' }));
      await page.keyboard.type('A wreck on the sea floor, light from above', { delay: 60 });
      for (let job = 0; job < 3; job++) await page.keyboard.press('ControlOrMeta+Enter');
      const card = (name: string) => region.getByRole('article', { name });
      await card('Image 3').locator('[data-slot="denoise-reveal"][data-state="revealed"]').waitFor({ timeout: 20_000 });
      await click(page, card('Image 1').getByRole('button', { name: 'Open image 1' }));
      const stage = region.locator('[data-slot="studio-stage"]');
      const slider = await boxOf(stage.locator('[data-slot="compare-slider"]'));
      const y = slider.y + slider.height / 2;
      await drag(page, [
        [slider.x + slider.width * 0.5, y],
        [slider.x + slider.width * 0.15, y],
        [slider.x + slider.width * 0.75, y],
      ]);
      // A clip: pick a video model and a camera move, generate, open it and scrub.
      await click(page, region.getByRole('button', { name: /^Model: / }));
      await page.getByRole('combobox', { name: 'Search models' }).waitFor();
      await page.keyboard.type('cinema', { delay: 60 });
      await page.keyboard.press('Enter');
      const orbit = page.getByRole('radio', { name: 'Orbit', exact: true });
      await click(page, region.locator('[data-slot="camera-motion-picker-option"]').filter({ has: orbit }));
      await click(page, region.getByRole('button', { name: 'Generate' }));
      await card('Video 1').locator('[data-slot="denoise-reveal"][data-state="revealed"]').waitFor({ timeout: 20_000 });
      await click(page, card('Video 1').getByRole('button', { name: 'Open video 1' }));
      const bar = await boxOf(stage.getByRole('slider', { name: 'Seek' }));
      const barY = bar.y + bar.height / 2;
      await drag(page, [
        [bar.x + bar.width * 0.2, barY],
        [bar.x + bar.width * 0.8, barY],
      ]);
      await page.waitForTimeout(500);
    },
  },
];

async function measure(browser: Browser, base: string, scenario: Scenario, throttle: number): Promise<InteractionReport> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.route(`${mediaOrigin}/**`, serveFeedMedia);
  await page.addInitScript(record);
  await page.goto(`${base}${scenario.path}`);
  const region = page.getByRole('region', { name: scenario.region, exact: true });
  await page.waitForFunction((name) => document.querySelector(`[aria-label="${name}"]`)?.hasAttribute('data-hydrated'), scenario.region);
  await region.scrollIntoViewIfNeeded();
  await scenario.prepare?.(region, page);
  await page.waitForTimeout(500);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  // A quiet main thread before the first interaction: work queued by the setup isn't part of it.
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    (window as unknown as { lab: { start: () => void } }).lab.start();
  });
  await scenario.run(region, page);
  await page.waitForTimeout(300);
  const result = await page.evaluate(() => (window as unknown as { lab: { stop: () => PageRecord } }).lab.stop());
  await context.close();
  const { inp, slowest } = interactionToNextPaint(result.events, result.interactionCount);
  const frames = result.intervals;
  return {
    scenario: scenario.name,
    interactions: result.interactionCount,
    inp,
    slowest,
    frames: frames.length,
    medianFrame: percentile(frames, 0.5),
    p95Frame: percentile(frames, 0.95),
    longFrames: frames.filter((interval) => interval > 20).length / Math.max(1, frames.length),
  };
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      dir: { type: 'string', default: 'out' },
      throttle: { type: 'string', default: '4' },
      only: { type: 'string' },
    },
  });
  const port = 4176;
  const server = await serve({ dir: path.resolve(values.dir), base: '/genframe', port });
  const browser = await chromium.launch({ channel: 'chrome' });
  const chosen = values.only ? scenarios.filter((scenario) => values.only?.split(',').includes(scenario.name)) : scenarios;
  try {
    console.log(`CPU slowed ${values.throttle}×, Google Chrome ${browser.version()}`);
    console.log('| Scenario | Interactions | INP | Slowest interaction | Frames | Median | 95th percentile | Over 20 ms |');
    console.log('| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const scenario of chosen) {
      const report = await measure(browser, `http://127.0.0.1:${String(port)}/genframe/`, scenario, Number(values.throttle));
      console.log(
        `| ${report.scenario} | ${String(report.interactions)} | ${report.inp ? `${String(report.inp)} ms` : '< 16 ms'} | ${report.slowest} | ${String(report.frames)} | ${report.medianFrame.toFixed(1)} ms | ${report.p95Frame.toFixed(1)} ms | ${(report.longFrames * 100).toFixed(1)}% |`,
      );
    }
  } finally {
    await browser.close();
    server.close();
  }
}
