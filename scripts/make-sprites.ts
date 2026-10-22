// Sprite sheets for VideoScrubber's hover preview: a clip's thumbnails in one WebP image, a tile
// every `interval` seconds from 0, and beside it a JSON file in the usual sprite shape ({ url,
// columns, rows, interval, width, height }, `url` relative to the JSON file) with the clip's frame
// rate and length. The docs' demos play Generation Feed's clips; their originals are on disk in the
// Feed's media-out/originals/, so nothing is downloaded. Commit what it writes to public/sprites/:
// CI needs neither the Feed nor these tools. It needs ffmpeg, ffprobe and cwebp.
//
//   node scripts/make-sprites.ts                 the demos' clips (demoClips below)
//   node scripts/make-sprites.ts qjr027827t --feed ../generation-feed --interval 0.25 --width 160 --quality 50
//
// Tile i shows the frame showing at i × interval, worked out with the Kit's own timecode helpers,
// so the preview and VideoScrubber agree on frames. Tiles fill rows of a near-square grid. Without
// `--width`, a tile has the area of a 160 × 90 one in the clip's shape: 90 × 160 for 9:16.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { frameCount, framesToSeconds, secondsToFrames } from '../registry/lib/timecode.ts';
import type { SpriteSheet } from '../registry/ui/video-scrubber/sprite-sheet.ts';

/**
 * The clips the demos play: VideoScrubber's story shots (lib/feed-story.ts), which the Studio plays
 * too, and the Studio's other results (lib/feed-studio.ts): the Feed's camera moves, and its worlds
 * clips in 9:16, 1:1 and 3:4.
 */
export const demoClips = [
  // The story shots
  'qjr027827t', 'hoasfc54e8', 'a7391hh3rt',
  // The red car's eight moves, then the neon alley's, the lighthouse's and the snow leopard's
  '2ku2vlkbhr', 'a6ok00bmk5', 'tvl7jqk4h2', '4m6g4ut215', 'u6lr2d2mum', 'jafcke9v49', 'h1dhp17s02', 'n960mhu8as',
  'k4hu95gmtu', 'e82ner82ms', 'tafhsg5pmo', 'phmre54mk7', '3qg8g0fs02', 'rnqrbcdgi0', '0k3pdh22ap', 'krjqtn7u8s',
  '1j5nl53q8r', 'f8n04p4giv', 'h5cbbdav89',
  // Worlds clips in 9:16, 1:1 and 3:4
  'qp6m7fe9h3', '0ri4m7gpkm', '12tn2lr22k', 'diq0ej7dfu', '05umf6fcag', 'l24jto5qnb', '91ng5l6il9', 'ac106bhn97', '87tprt8ukc',
];

/** A tile's width for a clip of this size: the area of a 160 × 90 tile, in the clip's shape. */
export function tileWidth(clipWidth: number, clipHeight: number) {
  return Math.round(Math.sqrt((160 * 90 * clipWidth) / clipHeight));
}

const root = path.resolve(import.meta.dirname, '..');

/** A time this little before a tile starts counts as that tile, as in the timecode helpers. */
const TOLERANCE = 0.000001;

/**
 * Which frames a clip's tiles show, and the grid they go in: a tile every `interval` seconds, up to
 * the one that shows the last frame, in the fewest rows of a near-square grid.
 */
export function spriteLayout(duration: number, fps: number, interval: number) {
  const lastFrame = Math.max(0, frameCount(duration, fps) - 1);
  const count = Math.floor(framesToSeconds(lastFrame, fps) / interval + TOLERANCE) + 1;
  const frames = Array.from({ length: count }, (_, tile) => secondsToFrames(tile * interval, fps));
  const columns = Math.ceil(Math.sqrt(count));
  return { frames, columns, rows: Math.ceil(count / columns) };
}

/** What VideoScrubber's `sprite` takes, plus the clip's frame rate and length. */
export interface SpriteFile extends SpriteSheet {
  fps: number;
  duration: number;
}

interface Probe {
  width: number;
  height: number;
  fps: number;
  duration: number;
}

function probe(file: string): Probe {
  const output = execFileSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate:format=duration', '-of', 'json', file],
    { encoding: 'utf8' },
  );
  const { streams, format } = JSON.parse(output) as {
    streams: { width: number; height: number; r_frame_rate: string }[];
    format: { duration: string };
  };
  const stream = streams[0];
  if (!stream) throw new Error(`${file} has no video stream`);
  // "24/1", or "24000/1001" for 23.976.
  const [frames = Number.NaN, seconds = 1] = stream.r_frame_rate.split('/').map(Number);
  return { width: stream.width, height: stream.height, fps: frames / seconds, duration: Number(format.duration) };
}

/** Makes `<out>/<id>.webp` and `<id>.json` from a clip, and returns what went into the JSON. */
export function makeSprite(
  source: string,
  out: string,
  id: string,
  { interval, width: chosenWidth, quality }: { interval: number; width?: number; quality: number },
): SpriteFile {
  const clip = probe(source);
  const width = chosenWidth ?? tileWidth(clip.width, clip.height);
  const height = Math.round((width * clip.height) / clip.width);
  const { frames, columns, rows } = spriteLayout(clip.duration, clip.fps, interval);
  const work = mkdtempSync(path.join(tmpdir(), 'genframe-sprites-'));
  try {
    const sheet = path.join(work, `${id}.png`);
    // Quoted, the select expression's commas stay in it: they don't split the filter chain.
    const select = frames.map((frame) => `eq(n,${String(frame)})`).join('+');
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-i',
      source,
      '-vf',
      `select='${select}',scale=${String(width)}:${String(height)}:flags=lanczos,tile=${String(columns)}x${String(rows)}`,
      '-frames:v',
      '1',
      '-fps_mode',
      'vfr',
      sheet,
    ]);
    execFileSync('cwebp', ['-quiet', '-q', String(quality), '-m', '6', '-metadata', 'none', sheet, '-o', path.join(out, `${id}.webp`)]);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  const sprite: SpriteFile = {
    url: `${id}.webp`,
    columns,
    rows,
    interval,
    width,
    height,
    fps: clip.fps,
    duration: clip.duration,
  };
  writeFileSync(path.join(out, `${id}.json`), `${JSON.stringify(sprite, null, 2)}\n`);
  return sprite;
}

if (import.meta.main) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      feed: { type: 'string', default: '../generation-feed' },
      out: { type: 'string', default: 'public/sprites' },
      interval: { type: 'string', default: '0.25' },
      width: { type: 'string' },
      quality: { type: 'string', default: '50' },
    },
  });
  const ids = positionals.length > 0 ? positionals : demoClips;
  const out = path.resolve(root, values.out);
  mkdirSync(out, { recursive: true });
  for (const id of ids) {
    const source = path.resolve(root, values.feed, 'media-out/originals', `${id}.mp4`);
    if (!existsSync(source)) throw new Error(`No original for ${id} at ${source}: is the Feed checked out there (--feed)?`);
    const sprite = makeSprite(source, out, id, {
      interval: Number(values.interval),
      width: values.width === undefined ? undefined : Number(values.width),
      quality: Number(values.quality),
    });
    const bytes = statSync(path.join(out, sprite.url)).size;
    const tiles = spriteLayout(sprite.duration, sprite.fps, sprite.interval).frames.length;
    console.log(
      `${id}: ${String(tiles)} tiles of ${String(sprite.width)} × ${String(sprite.height)} in ${String(sprite.columns)} × ${String(sprite.rows)}, every ${String(sprite.interval)} s, ${(bytes / 1024).toFixed(1)} KB`,
    );
  }
}
