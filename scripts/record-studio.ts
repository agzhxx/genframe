// Records the Studio for the README and for posts: a silent screen recording of the built site in
// Google Chrome at 1440 × 810 (16:9; the screencast captures CSS pixels), played by a script at a
// person's pace, with the Feed's real media. Two images are generated, one from the keyboard and one
// with the button; they run side by side and sharpen out of grain; the first opens in CompareSlider,
// draft against final, and the divider is dragged; then a video model, the orbit move, and a clip
// generated, opened and scrubbed. Each prompt is the Feed's own description of the media the Studio
// will show for those settings, so the demo reads true; the page still says generation is simulated.
// A recording has no pointer, so the page gets a drawn one, and each key pressed shows at the
// bottom. Frames come from the DevTools protocol's screencast; ffmpeg makes the MP4 for posts, and
// libwebp's img2webp an animated WebP of the image part for the README.
//
// Run `pnpm build` first, with the network on (the media come from the Feed's bucket), then
// `node scripts/record-studio.ts [folder]` (default: demo-clips/, which git ignores). Needs ffmpeg
// and img2webp (`brew install ffmpeg webp`). Copy the WebP into docs/media/ when it should change.

// The functions passed to page.evaluate and addInitScript run in the page, with the DOM.
/// <reference lib="dom" />

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type CDPSession, type Locator, type Page } from '@playwright/test';
import { serve } from './serve.ts';

const root = path.resolve(import.meta.dirname, '..');
const out = path.resolve(process.argv[2] ?? path.join(root, 'demo-clips'));
const port = 4179;
const viewport = { width: 1440, height: 810 };
/** The README's copy: smaller, and fewer frames a second. */
const webpWidth = 960;
const webpFps = 12;

/** Runs in the page: a drawn pointer that follows the mouse, and each key pressed, at the bottom. */
function decorate(): void {
  addEventListener('DOMContentLoaded', () => {
    const pointer = document.createElement('div');
    pointer.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M5 3l14 8-6.5 1.5L9.5 19z" ' +
      'fill="white" stroke="black" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    pointer.style.cssText =
      'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(-50px,-50px)';
    const keys = document.createElement('div');
    keys.style.cssText =
      'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;pointer-events:none;' +
      'padding:6px 14px;border-radius:8px;background:rgb(0 0 0/0.8);color:white;font:600 18px/1.4 system-ui;' +
      'opacity:0;transition:opacity 150ms';
    document.body.append(pointer, keys);
    addEventListener(
      'pointermove',
      (event) => {
        pointer.style.transform = `translate(${String(event.clientX - 5)}px, ${String(event.clientY - 3)}px)`;
      },
      { capture: true, passive: true },
    );
    let hide = 0;
    addEventListener(
      'keydown',
      (event) => {
        // Letters typed into the prompt show in the prompt; only keys that do something else show here.
        if (['Shift', 'Meta', 'Control', 'Alt'].includes(event.key)) return;
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) return;
        const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
        keys.textContent = `${event.ctrlKey ? 'Ctrl+' : ''}${event.metaKey ? '⌘' : ''}${key}`;
        keys.style.opacity = '1';
        clearTimeout(hide);
        hide = window.setTimeout(() => {
          keys.style.opacity = '0';
        }, 900);
      },
      { capture: true },
    );
  });
}

interface Frame {
  data: string;
  at: number;
}

/** Collects the screencast's frames until `stop` is called. */
async function screencast(cdp: CDPSession) {
  const frames: Frame[] = [];
  cdp.on('Page.screencastFrame', (frame) => {
    frames.push({ data: frame.data, at: frame.metadata.timestamp ?? Date.now() / 1000 });
    void cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId });
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92 });
  return {
    frames,
    async stop() {
      await cdp.send('Page.stopScreencast');
      return Date.now() / 1000;
    },
  };
}

/** Writes frames `from`–`to` as an ffmpeg concat list, each frame held until the next. */
function writeFrames(frames: Frame[], ended: number, folder: string) {
  rmSync(folder, { recursive: true, force: true });
  mkdirSync(folder, { recursive: true });
  const list = frames.flatMap((frame, index) => {
    const file = path.join(folder, `${String(index).padStart(5, '0')}.jpg`);
    writeFileSync(file, Buffer.from(frame.data, 'base64'));
    const next = frames[index + 1]?.at ?? ended;
    return [`file '${file}'`, `duration ${Math.max(0.001, next - frame.at).toFixed(4)}`];
  });
  list.push(`file '${path.join(folder, `${String(frames.length - 1).padStart(5, '0')}.jpg`)}'`);
  writeFileSync(path.join(folder, 'frames.txt'), `${list.join('\n')}\n`);
  return path.join(folder, 'frames.txt');
}

const quiet = ['-y', '-hide_banner', '-loglevel', 'error'];

function makeMp4(list: string, file: string) {
  execFileSync('ffmpeg', [
    ...quiet,
    ...['-f', 'concat', '-safe', '0', '-i', list],
    ...['-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '20', '-preset', 'slow'],
    ...['-movflags', '+faststart', file],
  ]);
}

/** An animated WebP of `from`–`to` seconds of the MP4, for the README. */
function makeWebp(mp4: string, file: string, from: number, to: number, folder: string) {
  const stills = path.join(folder, 'webp');
  rmSync(stills, { recursive: true, force: true });
  mkdirSync(stills, { recursive: true });
  execFileSync('ffmpeg', [
    ...quiet,
    ...['-ss', String(from), '-to', String(to), '-i', mp4],
    ...['-vf', `fps=${String(webpFps)},scale=${String(webpWidth)}:-2:flags=lanczos`],
    path.join(stills, '%04d.png'),
  ]);
  const pngs = readdirSync(stills)
    .filter((name) => name.endsWith('.png'))
    .sort()
    .map((name) => path.join(stills, name));
  const delay = String(Math.round(1000 / webpFps));
  execFileSync('img2webp', ['-loop', '0', '-lossy', '-q', '60', '-m', '6', '-d', delay, ...pngs, '-o', file]);
}

/** Where an element is once it's in view and has stopped moving: the page scrolls smoothly. */
async function boxOf(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  let box = await locator.boundingBox();
  for (let check = 0; check < 40; check++) {
    await locator.page().waitForTimeout(50);
    const next = await locator.boundingBox();
    if (box && next && next.x === box.x && next.y === box.y) return next;
    box = next;
  }
  if (!box) throw new Error('Not on the page');
  return box;
}

/** Moves the mouse to a point in `ms`, the way a hand does, rather than in one jump. */
async function glide(page: Page, x: number, y: number, ms = 600) {
  const steps = Math.max(2, Math.round(ms / 16));
  const from = await page.evaluate(() => ({ x: (window as unknown as { mx?: number }).mx ?? 720, y: (window as unknown as { my?: number }).my ?? 405 }));
  for (let step = 1; step <= steps; step++) {
    const t = step / steps;
    const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    await page.mouse.move(from.x + (x - from.x) * eased, from.y + (y - from.y) * eased);
    await page.waitForTimeout(16);
  }
  await page.evaluate(([nx, ny]) => Object.assign(window, { mx: nx, my: ny }), [x, y]);
}

/** Glides to the middle of an element and clicks it. */
async function clickOn(page: Page, locator: Locator, ms = 600) {
  const box = await boxOf(locator);
  await glide(page, box.x + box.width / 2, box.y + box.height / 2, ms);
  await page.waitForTimeout(120);
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.up();
}

/** Scrolls the page with the wheel, a notch at a time, until `locator` sits near the top. */
async function scrollTo(page: Page, locator: Locator, top = 90) {
  for (let notch = 0; notch < 40; notch++) {
    const box = await locator.boundingBox();
    if (!box) throw new Error('Not on the page');
    const distance = box.y - top;
    if (Math.abs(distance) < 40) return;
    await page.mouse.wheel(0, Math.sign(distance) * Math.min(120, Math.abs(distance)));
    await page.waitForTimeout(40);
  }
}

/** Waits until every image inside `locator` has loaded, so a reveal starts from the real picture. */
async function imagesLoaded(locator: Locator) {
  await locator.evaluate(async (element) => {
    await Promise.all(
      [...element.querySelectorAll('img')].map(
        (image) =>
          new Promise<void>((resolve) => {
            // A picture that fails is still done: the recording goes on without it.
            if (image.complete) resolve();
            else for (const type of ['load', 'error']) image.addEventListener(type, () => { resolve(); }, { once: true });
          }),
      ),
    );
  });
}

mkdirSync(out, { recursive: true });
const server = await serve({ dir: path.join(root, 'out'), base: '/genframe', port });
const browser = await chromium.launch({ channel: 'chrome', args: ['--mute-audio'] });
const context = await browser.newContext({ viewport });
const page = await context.newPage();
try {
  await page.addInitScript(decorate);
  await page.goto(`http://127.0.0.1:${String(port)}/genframe/studio/`);
  await page.waitForFunction(() => document.querySelector('[aria-label="Studio"]')?.hasAttribute('data-hydrated'));
  const studio = page.getByRole('region', { name: 'Studio', exact: true });
  // Twice the simulator's speed: the jobs run in 1.5 to 3 s (images) and 4 to 7 s (clips).
  await studio.getByLabel('Speed').selectOption('2');
  await page.mouse.move(720, 405);
  await page.waitForTimeout(1200);

  const cdp = await context.newCDPSession(page);
  const recording = await screencast(cdp);
  await page.waitForTimeout(500);

  // 1. A prompt, generated twice: the jobs run two at a time, and sharpen out of grain.
  const prompt = studio.getByRole('textbox', { name: 'Prompt' });
  await clickOn(page, prompt, 700);
  await page.keyboard.type('A sunken airplane wreck on white sand, sun rays from the surface', { delay: 40 });
  await page.waitForTimeout(400);
  // The first from the keyboard; the second with the button, while the first runs.
  await page.keyboard.press('ControlOrMeta+Enter');
  await page.waitForTimeout(500);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('A stray cat in a dry doorway on a wet street, at blue hour', { delay: 40 });
  await page.waitForTimeout(300);
  await clickOn(page, studio.getByRole('button', { name: 'Generate' }), 500);
  const card = (name: string) => studio.getByRole('article', { name });
  await scrollTo(page, studio.getByRole('heading', { name: 'Generations' }), 120);
  for (const name of ['Image 1', 'Image 2']) {
    await card(name).locator('[data-slot="denoise-reveal"][data-state="revealed"]').waitFor({ timeout: 30_000 });
  }
  await page.waitForTimeout(600);
  const imagePartEnds = Date.now() / 1000;

  // 2. The first opens in CompareSlider: draft against final, the divider dragged across.
  await clickOn(page, card('Image 1').getByRole('button', { name: 'Open image 1' }), 600);
  const stage = studio.locator('[data-slot="studio-stage"]');
  const slider = stage.locator('[data-slot="compare-slider"]');
  await imagesLoaded(slider);
  await scrollTo(page, stage, 80);
  await page.waitForTimeout(600);
  const box = await boxOf(slider);
  const y = box.y + box.height / 2;
  await glide(page, box.x + box.width / 2, y, 500);
  await page.mouse.down();
  await glide(page, box.x + box.width * 0.15, y, 900);
  await glide(page, box.x + box.width * 0.85, y, 1200);
  await glide(page, box.x + box.width * 0.4, y, 800);
  await page.mouse.up();
  await page.waitForTimeout(500);
  // A click springs the divider there.
  await clickOn(page, slider, 400);
  await page.waitForTimeout(700);
  const compareEnds = Date.now() / 1000;

  // 3. A video model, the orbit move, a clip generated, opened and scrubbed.
  await scrollTo(page, prompt, 100);
  await clickOn(page, studio.getByRole('button', { name: /^Model: / }), 600);
  const search = page.getByRole('combobox', { name: 'Search models' });
  await search.waitFor();
  await page.waitForTimeout(400);
  await page.keyboard.type('cinema', { delay: 90 });
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  const moves = studio.getByRole('radiogroup', { name: 'Camera move' });
  await moves.waitFor();
  await imagesLoaded(moves);
  await scrollTo(page, studio.locator('[data-slot="studio-camera-move"]'), 90);
  const tile = (move: string) =>
    moves.locator('[data-slot="camera-motion-picker-option"]').filter({ has: page.getByRole('radio', { name: move, exact: true }) });
  // Resting on a tile plays its move.
  const dolly = await boxOf(tile('Dolly in'));
  await glide(page, dolly.x + dolly.width / 2, dolly.y + dolly.height / 3, 600);
  await page.waitForTimeout(1300);
  await clickOn(page, tile('Orbit'), 600);
  await page.waitForTimeout(900);
  await scrollTo(page, prompt, 100);
  await clickOn(page, prompt, 500);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('A small red vintage car on a winding mountain road far below', { delay: 40 });
  await page.waitForTimeout(300);
  await clickOn(page, studio.getByRole('button', { name: 'Generate' }), 500);
  await scrollTo(page, studio.getByRole('heading', { name: 'Generations' }), 120);
  await card('Video 1').locator('[data-slot="denoise-reveal"][data-state="revealed"]').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(600);
  await clickOn(page, card('Video 1').getByRole('button', { name: 'Open video 1' }), 600);
  await stage.locator('video').waitFor();
  await page.waitForFunction(() => {
    const video = document.querySelector<HTMLVideoElement>('[data-slot="studio-stage"] video');
    return video !== null && video.readyState >= 3;
  });
  await scrollTo(page, stage, 80);
  await page.waitForTimeout(1300);
  const bar = await boxOf(stage.getByRole('slider', { name: 'Seek' }));
  const barY = bar.y + bar.height / 2;
  // Hovering shows the sprite's thumbnail of that time; then a drag scrubs.
  await glide(page, bar.x + bar.width * 0.2, barY, 600);
  await glide(page, bar.x + bar.width * 0.7, barY, 1000);
  await page.waitForTimeout(300);
  await page.mouse.down();
  await glide(page, bar.x + bar.width * 0.3, barY, 1200);
  await glide(page, bar.x + bar.width * 0.85, barY, 1100);
  await page.mouse.up();
  await page.waitForTimeout(1500);

  const ended = await recording.stop();
  await cdp.detach();
  const { frames } = recording;
  const start = frames[0]?.at ?? ended;
  const folder = path.join(out, 'studio-frames');
  const mp4 = path.join(out, 'studio.mp4');
  makeMp4(writeFrames(frames, ended, folder), mp4);
  // The README's loop: the image part, from the first keystroke to the draft against the final.
  const webp = path.join(out, 'studio.webp');
  makeWebp(mp4, webp, 0.8, compareEnds - start, folder);
  rmSync(folder, { recursive: true, force: true });
  const mb = (file: string) => (statSync(file).size / 1e6).toFixed(1);
  console.log(`studio.mp4: ${(ended - start).toFixed(1)} s, ${String(frames.length)} frames, ${mb(mp4)} MB`);
  console.log(`studio.webp: ${(compareEnds - start - 0.8).toFixed(1)} s, ${mb(webp)} MB (the image part ends at ${(imagePartEnds - start).toFixed(1)} s)`);
} catch (error) {
  // What the page showed when a step failed, to see why.
  await page.screenshot({ path: path.join(out, 'failed.png') }).catch(() => undefined);
  throw error;
} finally {
  await browser.close();
  server.close();
}
