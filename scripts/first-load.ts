// How a page of the built site loads, in the lab: first contentful paint, largest contentful paint
// and its element, layout shift, and when the page first responds: the nav's search opens its
// dialog, which needs the page hydrated and, since M8, the search's own code; or, with
// `--probe playground`, the page's playground toggles its slow motion, which needs the playground's
// code. Google Chrome, its CPU slowed 4× and the network at
// 150 ms and 1.6 Mbps, as Lighthouse's mobile preset; the Feed's media are refused, so only the
// site's own files load. The median of a few runs, at a phone's width and a desktop's. docs/PERF.md
// records these numbers; Lighthouse CI comes in M8. Run `pnpm build` first.
//
//   node scripts/first-load.ts [--dir out] [--page /] [--runs 3] [--probe search|playground]

import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type Browser } from '@playwright/test';
import { mediaOrigin } from '../lib/feed-media.ts';
import { serve } from './serve.ts';

export interface FirstLoad {
  fcp: number;
  lcp: number;
  /** What the largest contentful paint was: a tag and the start of its text. */
  lcpElement: string;
  cls: number;
  /** When the probe first responded (the search opened, or the playground's switch toggled), in ms from the navigation. */
  responsive: number;
}

interface Vitals {
  fcp: number;
  lcp: number;
  lcpElement: string;
  cls: number;
}

export function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

export type Probe = 'search' | 'playground';

async function load(browser: Browser, url: string, viewport: { width: number; height: number }, probe: Probe): Promise<FirstLoad> {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.route(`${mediaOrigin}/**`, (route) => route.abort());
  await page.addInitScript(() => {
    const vitals: Vitals = { fcp: 0, lcp: 0, lcpElement: '', cls: 0 };
    Object.assign(window, { vitals });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as LargestContentfulPaint[]) {
        vitals.lcp = Math.round(entry.startTime);
        vitals.lcpElement = entry.element ? `${entry.element.tagName.toLowerCase()} “${entry.element.textContent.slice(0, 30)}”` : '';
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
        if (!entry.hadRecentInput) vitals.cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (entry.name === 'first-contentful-paint') vitals.fcp = Math.round(entry.startTime);
    }).observe({ type: 'paint', buffered: true });
  });

  const start = Date.now();
  await page.goto(url, { waitUntil: 'commit', timeout: 60_000 });
  const target =
    probe === 'search'
      ? page.getByRole('button', { name: /search/i }).first()
      : page.getByRole('switch', { name: 'Slow motion (0.25×)' }).first();
  const responded = () =>
    probe === 'search' ? page.getByRole('dialog').isVisible() : target.evaluate((element) => element.getAttribute('aria-checked') === 'true');
  let responsive = Number.NaN;
  for (let attempt = 0; attempt < 300 && Number.isNaN(responsive); attempt++) {
    await target.click({ timeout: 100, noWaitAfter: true }).catch(() => undefined);
    if (await responded().catch(() => false)) responsive = Date.now() - start;
    else await page.waitForTimeout(100);
  }
  if (probe === 'search') await page.keyboard.press('Escape');
  await page.waitForLoadState('load');
  await page.waitForTimeout(1000);
  const vitals = await page.evaluate(() => (window as unknown as { vitals: Vitals }).vitals);
  await context.close();
  return { ...vitals, cls: Math.round(vitals.cls * 1000) / 1000, responsive };
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      dir: { type: 'string', default: 'out' },
      page: { type: 'string', default: '/' },
      runs: { type: 'string', default: '3' },
      probe: { type: 'string', default: 'search' },
    },
  });
  const port = 4175;
  const server = await serve({ dir: path.resolve(values.dir), base: '/genframe', port });
  const browser = await chromium.launch({ channel: 'chrome' });
  const url = `http://127.0.0.1:${String(port)}/genframe${values.page}`;
  try {
    console.log('| Width | FCP | LCP | LCP element | CLS | Responds |');
    console.log('| --- | --- | --- | --- | --- | --- |');
    for (const viewport of [
      { width: 412, height: 823 },
      { width: 1350, height: 940 },
    ]) {
      const runs: FirstLoad[] = [];
      const probe: Probe = values.probe === 'playground' ? 'playground' : 'search';
      for (let run = 0; run < Number(values.runs); run++) runs.push(await load(browser, url, viewport, probe));
      const ms = (key: 'fcp' | 'lcp' | 'responsive') => `${(median(runs.map((run) => run[key])) / 1000).toFixed(1)} s`;
      console.log(
        `| ${String(viewport.width)} px | ${ms('fcp')} | ${ms('lcp')} | ${runs[0]?.lcpElement ?? ''} | ${String(Math.max(...runs.map((run) => run.cls)))} | ${ms('responsive')} |`,
      );
    }
  } finally {
    await browser.close();
    server.close();
  }
}
