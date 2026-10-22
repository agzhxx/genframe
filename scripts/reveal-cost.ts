// What DenoiseReveal costs (spec section 6), measured in Google Chrome on the built site. Its docs
// page replays the reveal several times inside a performance trace, with full motion and then with
// reduced motion (a plain fade, to compare with), and the trace is summed up per reveal: the
// frames, from requestAnimationFrame's intervals and the compositor's DrawFrame events, and the
// work on the page's main thread (style, layout, paint) and on its raster threads. The image is
// the Feed's own, from its bucket, at the size the page shows it. docs/PERF.md records the
// numbers. Run `pnpm build` first.
//
//   node scripts/reveal-cost.ts [--runs 8] [--scale 2] [--throttle 1]

import { chromium, type Page } from '@playwright/test';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { serve } from './serve.ts';

interface TraceEvent {
  name: string;
  cat: string;
  ph: string;
  ts: number;
  dur?: number;
  pid: number;
  tid: number;
  args?: { name?: string; data?: unknown };
}

const { values } = parseArgs({
  options: {
    runs: { type: 'string', default: '8' },
    scale: { type: 'string', default: '2' },
    throttle: { type: 'string', default: '1' },
  },
});
const runs = Number(values.runs);
const port = 4191;
const root = path.resolve(import.meta.dirname, '..');

async function replay(page: Page, label: string) {
  for (let run = 0; run < runs; run++) {
    await page.evaluate((mark) => {
      performance.mark(`${mark}:start`);
    }, label);
    await page.getByRole('button', { name: 'Replay' }).click();
    // The reveal is over when the reveal says so (its fade has ended), then a little quiet.
    await page.waitForFunction(() => document.querySelector('[data-slot="denoise-reveal"]')?.getAttribute('data-state') === 'revealed');
    await page.evaluate((mark) => {
      performance.mark(`${mark}:end`);
    }, label);
    await page.waitForTimeout(300);
  }
}

function median(numbers: number[]) {
  const sorted = numbers.toSorted((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function percentile(numbers: number[], share: number) {
  const sorted = numbers.toSorted((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0;
}

const server = await serve({ dir: path.join(root, 'out'), base: '/genframe', port });
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: Number(values.scale),
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${String(port)}/genframe/docs/components/denoise-reveal/`);
  const region = page.getByRole('region', { name: 'DenoiseReveal demo' });
  await region.waitFor();
  await page.waitForSelector('[data-hydrated]');
  await region.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('[data-slot="denoise-reveal"]')?.getAttribute('data-state') === 'revealed');

  const setup = await page.evaluate(() => {
    const image = document.querySelector<HTMLImageElement>('[data-slot="denoise-reveal"] img');
    const gl = document.createElement('canvas').getContext('webgl');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    const renderer = gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'no WebGL';
    // Every frame's interval, from requestAnimationFrame, with the time it began.
    const frames: [number, number][] = [];
    let last = performance.now();
    const tick = (now: number) => {
      frames.push([now, now - last]);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    (window as unknown as { frames_: typeof frames }).frames_ = frames;
    const box = image?.getBoundingClientRect();
    return {
      renderer,
      // naturalWidth is corrected for the srcset's density: the poster's own width is in its URL.
      image: image?.currentSrc.split('/').at(-1) ?? 'none',
      shown: box ? `${String(Math.round(box.width))} × ${String(Math.round(box.height))} CSS px` : 'none',
      dpr: window.devicePixelRatio,
    };
  });

  const cdp = await context.newCDPSession(page);
  if (Number(values.throttle) > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(values.throttle) });
  const events: TraceEvent[] = [];
  cdp.on('Tracing.dataCollected', ({ value }) => {
    events.push(...(value as unknown as TraceEvent[]));
  });
  const finished = new Promise<void>((resolve) => {
    cdp.once('Tracing.tracingComplete', () => {
      resolve();
    });
  });
  await cdp.send('Tracing.start', {
    categories: [
      'devtools.timeline',
      'disabled-by-default-devtools.timeline',
      'disabled-by-default-devtools.timeline.frame',
      'blink.user_timing',
      'cc',
      'toplevel',
      'gpu',
      'viz',
    ].join(','),
  });

  await replay(page, 'full');
  await page.getByRole('switch', { name: 'Reduced motion' }).click();
  await replay(page, 'reduced');

  await cdp.send('Tracing.end');
  await finished;
  const frames = await page.evaluate(() => (window as unknown as { frames_: [number, number][] }).frames_);

  // The page's renderer: the process with our marks. Its main thread and raster threads by name.
  const marks = events.filter((event) => event.cat.includes('blink.user_timing') && /^(full|reduced):/.test(event.name));
  const pid = marks[0]?.pid;
  const threadNames = new Map(
    events
      .filter((event) => event.ph === 'M' && event.name === 'thread_name' && event.pid === pid)
      .map((event) => [event.tid, event.args?.name ?? '']),
  );
  const mainTid = [...threadNames].find(([, name]) => name === 'CrRendererMain')?.[0];
  const rasterTids = new Set([...threadNames].filter(([, name]) => name.startsWith('CompositorTileWorker')).map(([tid]) => tid));
  const compositorTid = [...threadNames].find(([, name]) => name === 'Compositor')?.[0];

  // The GPU process's main thread and the display compositor, where Chrome rasterizes and draws
  // with a GPU.
  const gpuThreads = new Set(
    events
      .filter((event) => event.ph === 'M' && event.name === 'thread_name' && ['CrGpuMain', 'VizCompositorThread'].includes(event.args?.name ?? ''))
      .map((event) => `${String(event.pid)}:${String(event.tid)}`),
  );

  const windows = (label: string) => {
    const starts = marks.filter((event) => event.name === `${label}:start`).map((event) => event.ts);
    const ends = marks.filter((event) => event.name === `${label}:end`).map((event) => event.ts);
    return starts.map((start, index) => [start, ends[index] ?? start] as const);
  };

  function summarize(label: string) {
    const spans = windows(label);
    const inside = (event: TraceEvent) => spans.some(([start, end]) => event.ts >= start && event.ts <= end);
    const total = (filter: (event: TraceEvent) => boolean) =>
      events.filter((event) => event.ph === 'X' && filter(event) && inside(event)).reduce((sum, event) => sum + (event.dur ?? 0), 0) /
      1000 /
      spans.length;
    const count = (filter: (event: TraceEvent) => boolean) => events.filter((event) => filter(event) && inside(event)).length / spans.length;
    // Main-thread work by kind, as DevTools groups it.
    const work = (names: string[]) => total((event) => event.tid === mainTid && names.includes(event.name));
    const paints = count((event) => event.tid === mainTid && event.name === 'Paint' && event.ph === 'X');
    const raster = total((event) => rasterTids.has(event.tid) && event.name === 'RasterTask');
    const mainBusy = total((event) => event.tid === mainTid && event.name === 'RunTask');
    const drawn = count((event) => event.tid === compositorTid && event.name === 'DrawFrame');
    const duration = spans.reduce((sum, [start, end]) => sum + (end - start), 0) / 1000 / spans.length;
    const gpuBusy = total((event) => gpuThreads.has(`${String(event.pid)}:${String(event.tid)}`) && event.name === 'RunTask');
    return {
      duration,
      drawn,
      paints,
      raster,
      mainBusy,
      gpuBusy,
      style: work(['UpdateLayoutTree', 'RecalculateStyles']),
      layout: work(['Layout']),
      paint: work(['Paint', 'PrePaint', 'PaintImage']),
    };
  }

  // The frame intervals during each label's spans, by matching performance.now() to the marks.
  const markTimes = await page.evaluate(() =>
    performance.getEntriesByType('mark').map((mark) => [mark.name, mark.startTime] as const),
  );
  function frameIntervals(label: string) {
    const starts = markTimes.filter(([name]) => name === `${label}:start`).map(([, time]) => time);
    const ends = markTimes.filter(([name]) => name === `${label}:end`).map(([, time]) => time);
    return frames
      .filter(([time]) => starts.some((start, index) => time >= start && time <= (ends[index] ?? start)))
      .map(([, interval]) => interval);
  }

  console.log(`Chrome ${browser.version()}, ${setup.renderer}`);
  console.log(
    `Poster ${setup.image}, shown at ${setup.shown}, device pixel ratio ${String(setup.dpr)}, CPU throttling ${values.throttle}×, ${String(runs)} reveals each`,
  );
  console.log('');
  console.log('| Per reveal | Full motion | Reduced motion |');
  console.log('| --- | --- | --- |');
  const full = summarize('full');
  const reduced = summarize('reduced');
  const fullFrames = frameIntervals('full');
  const reducedFrames = frameIntervals('reduced');
  const ms = (value: number) => `${value.toFixed(1)} ms`;
  const rows: [string, string, string][] = [
    ['Duration (click to revealed)', ms(full.duration), ms(reduced.duration)],
    ['Frames drawn by the compositor', full.drawn.toFixed(1), reduced.drawn.toFixed(1)],
    ['Frame interval, median', ms(median(fullFrames)), ms(median(reducedFrames))],
    ['Frame interval, 95th percentile', ms(percentile(fullFrames, 0.95)), ms(percentile(reducedFrames, 0.95))],
    ['Frame interval, longest', ms(Math.max(...fullFrames)), ms(Math.max(...reducedFrames))],
    [
      'Frames longer than 20 ms',
      (fullFrames.filter((interval) => interval > 20).length / runs).toFixed(2),
      (reducedFrames.filter((interval) => interval > 20).length / runs).toFixed(2),
    ],
    ['Main thread busy', ms(full.mainBusy), ms(reduced.mainBusy)],
    ['  of which style', ms(full.style), ms(reduced.style)],
    ['  of which layout', ms(full.layout), ms(reduced.layout)],
    ['  of which paint', ms(full.paint), ms(reduced.paint)],
    ['Paints', full.paints.toFixed(1), reduced.paints.toFixed(1)],
    ['Raster on tile workers', ms(full.raster), ms(reduced.raster)],
    ['GPU process and display compositor busy', ms(full.gpuBusy), ms(reduced.gpuBusy)],
  ];
  for (const row of rows) console.log(`| ${row.join(' | ')} |`);
} finally {
  await browser.close();
  server.close();
}
