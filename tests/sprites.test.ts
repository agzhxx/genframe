// @vitest-environment node
// The sprite sheets in public/sprites/, which scripts/make-sprites.ts made from Generation Feed's
// clips and which VideoScrubber's demo and the Studio show: each image is the grid its JSON says,
// its tiles cover the clip, and each of the demos' clips has one. With the Feed checked out next to
// this repo, the clips are the Feed's.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { storyClips } from '@/lib/feed-story';
import { studioResults } from '@/lib/feed-studio';
import { demoClips, spriteLayout, tileWidth, type SpriteFile } from '@/scripts/make-sprites';

const folder = 'public/sprites';
const feedManifest = fileURLToPath(new URL('../../generation-feed/data/manifest.json', import.meta.url));

/** A WebP image's size from its header: lossy (VP8), lossless (VP8L) or extended (VP8X). */
function webpSize(bytes: Buffer) {
  expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
  expect(bytes.toString('ascii', 8, 12)).toBe('WEBP');
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
  if (chunk === 'VP8L') {
    const bits = bytes.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  expect(chunk).toBe('VP8 ');
  return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
}

const sprites = readdirSync(folder)
  .filter((file) => file.endsWith('.json'))
  .map((file) => ({
    id: file.replace(/\.json$/, ''),
    sprite: JSON.parse(readFileSync(`${folder}/${file}`, 'utf8')) as SpriteFile,
  }));

describe('spriteLayout', () => {
  it('takes a tile every interval up to the one showing the last frame', () => {
    // The Feed's story clips: 121 frames at 24 fps, the last one at 5 s.
    const { frames, columns, rows } = spriteLayout(5.041667, 24, 0.25);
    expect(frames).toEqual(Array.from({ length: 21 }, (_, tile) => tile * 6));
    expect([columns, rows]).toEqual([5, 5]);
    // 120 frames: the last starts before 5 s, so no tile for 5 s.
    expect(spriteLayout(5, 24, 0.25).frames).toHaveLength(20);
    expect(spriteLayout(5, 24, 0.5).frames).toEqual([0, 12, 24, 36, 48, 60, 72, 84, 96, 108]);
  });

  it('picks the frame showing at each tile’s time, at fractional rates too', () => {
    // 2 s at 29.97 fps holds 60 frames; the last starts at 1.969 s, in the tile from 1.5 s.
    expect(spriteLayout(2, 29.97, 0.5).frames).toEqual([0, 14, 29, 44]);
    expect(spriteLayout(2.05, 29.97, 0.5).frames).toEqual([0, 14, 29, 44, 59]);
  });

  it('lays tiles out in a near-square grid with no empty row', () => {
    expect(spriteLayout(1, 24, 0.25)).toMatchObject({ columns: 2, rows: 2 });
    expect(spriteLayout(2.9, 24, 0.25)).toMatchObject({ columns: 4, rows: 3 });
    expect(spriteLayout(0.01, 24, 0.25)).toMatchObject({ frames: [0], columns: 1, rows: 1 });
  });
});

describe('tileWidth', () => {
  it('gives a tile the area of a 160 × 90 one, in the clip’s shape', () => {
    expect(tileWidth(1920, 1080)).toBe(160);
    expect(tileWidth(720, 1280)).toBe(90);
    expect(tileWidth(960, 960)).toBe(120);
    expect(tileWidth(828, 1108)).toBe(104);
  });
});

describe('the sprite sheets in public/sprites', () => {
  it('are the demos’ clips, each once', () => {
    expect(new Set(demoClips).size).toBe(demoClips.length);
    expect(sprites.map(({ id }) => id).sort()).toEqual([...demoClips].sort());
  });

  it('are the ones the demos import, for every clip they play', () => {
    const clips = [...storyClips, ...studioResults.filter((result) => result.kind === 'video')];
    for (const clip of clips) {
      expect(clip.sprite, clip.id).toEqual(sprites.find(({ id }) => id === clip.id)?.sprite);
    }
    expect(new Set(clips.map((clip) => clip.id))).toEqual(new Set(demoClips));
  });

  it.each(sprites)('$id: an image the grid its JSON says, whose tiles cover the clip', ({ id, sprite }) => {
    expect(sprite.url).toBe(`${id}.webp`);
    for (const value of [sprite.columns, sprite.rows, sprite.width, sprite.height]) {
      expect(Number.isInteger(value) && value > 0).toBe(true);
    }
    expect(webpSize(readFileSync(`${folder}/${sprite.url}`))).toEqual({
      width: sprite.columns * sprite.width,
      height: sprite.rows * sprite.height,
    });
    const tiles = spriteLayout(sprite.duration, sprite.fps, sprite.interval).frames.length;
    expect(tiles).toBeLessThanOrEqual(sprite.columns * sprite.rows);
    expect(tiles).toBeGreaterThan((sprite.rows - 1) * sprite.columns);
  });

  it.skipIf(!existsSync(feedManifest))('are of the Feed’s clips, at their length, in their shape', () => {
    const manifest = JSON.parse(readFileSync(feedManifest, 'utf8')) as {
      id: string;
      kind: string;
      collection: string;
      width: number;
      height: number;
      durationSec?: number;
    }[];
    for (const { id, sprite } of sprites) {
      const entry = manifest.find((item) => item.id === id);
      expect(entry, id).toMatchObject({ kind: 'video' });
      expect(['story', 'camera-moves', 'worlds'], id).toContain(entry?.collection);
      expect(Math.round(sprite.duration), id).toBe(entry?.durationSec);
      expect(sprite.width / sprite.height, id).toBeCloseTo((entry?.width ?? 0) / (entry?.height ?? 1), 2);
      expect(sprite.width, id).toBe(tileWidth(entry?.width ?? 0, entry?.height ?? 1));
    }
  });
});
