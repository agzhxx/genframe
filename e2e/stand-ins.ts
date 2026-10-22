import { readFileSync } from 'node:fs';
import type { Route } from '@playwright/test';

// The docs' demos show media from the Feed's bucket (lib/feed-media.ts). The end-to-end tests
// (e2e/media.ts) and the design hand-off's screenshots (scripts/design-screenshots.ts) answer those
// requests themselves, so they don't depend on the network, and screenshots don't change with what
// a CDN sends:
//
// - a poster gets an SVG in a color of its own (from its id), so two layers always differ;
// - a video gets e2e/fixtures/clip.mp4, in byte ranges as the bucket sends them, which Chrome
//   needs to seek. It's a 4 s test pattern made by ffmpeg, not Feed media:
//
//     ffmpeg -f lavfi -i testsrc2=size=320x180:rate=30:duration=4 -c:v libx264 -pix_fmt yuv420p \
//       -profile:v baseline -g 15 -crf 32 -movflags +faststart -an e2e/fixtures/clip.mp4

const clip = readFileSync(new URL('fixtures/clip.mp4', import.meta.url));

/** A poster's stand-in: an id like "fjv7aap2t5" always gets the same colors. */
function posterSvg(id: string) {
  let hue = 7;
  for (let index = 0; index < id.length; index++) hue = (hue * 31 + id.charCodeAt(index)) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 16 9" preserveAspectRatio="none">
  <rect width="16" height="9" fill="hsl(${String(hue)} 45% 35%)"/>
  <path d="M0 9 16 0v3L5 9z" fill="hsl(${String(hue)} 60% 65%)"/>
</svg>`;
}

/** Answers a request for the Feed's media with its stand-in: route the Feed's origin here. */
export async function serveFeedMedia(route: Route) {
  const url = new URL(route.request().url());
  if (url.pathname.endsWith('.mp4')) {
    const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range ?? '');
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Number(range[2]) : clip.length - 1;
    await route.fulfill({
      status: range ? 206 : 200,
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Type': 'video/mp4',
        ...(range ? { 'Content-Range': `bytes ${String(start)}-${String(end)}/${String(clip.length)}` } : {}),
      },
      body: clip.subarray(start, end + 1),
    });
    return;
  }
  // /m/<id>/v1/<width>.<avif|webp>
  const id = url.pathname.split('/')[2] ?? '';
  await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: posterSvg(id) });
}
