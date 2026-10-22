// @vitest-environment node
// The demos' media, copied by hand from the Feed's manifest (lib/feed-media.ts): typos there would
// only show as broken images on the live site, so the copy is checked here. With the Feed checked
// out next to this repo, as on Agzhan's machine, the queue's results are compared with its
// manifest too.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { thumbHashToApproximateAspectRatio } from 'thumbhash';
import { describe, expect, it } from 'vitest';
import {
  cameraScenes,
  dayNightPairs,
  draftFinalPairs,
  ferryClip,
  mediaOrigin,
  posterSrcSet,
  posterUrl,
  previewUrl,
  ratioScenes,
  videoUrl,
  type FeedImage,
} from '@/lib/feed-media';
import { cameraMoves, cameraMoveScenes } from '@/lib/feed-camera-moves';
import { imageResults, resultRatios, videoResults } from '@/lib/feed-results';
import { storyClips } from '@/lib/feed-story';
import { studioRatios, studioResults, type StudioMedia } from '@/lib/feed-studio';
import { worlds } from '@/lib/feed-worlds';
import { demoModels } from '@/lib/demo-models';
import { parseRatio } from '@/registry/ui/aspect-ratio-picker/ratio-math';

const feedManifest = fileURLToPath(new URL('../../generation-feed/data/manifest.json', import.meta.url));

const pairs = [...draftFinalPairs, ...dayNightPairs];
const images: FeedImage[] = [
  ...pairs.flatMap((pair) => [pair.before, pair.after]),
  ...ratioScenes.flatMap((scene) => Object.values(scene.images).filter((image) => image !== undefined)),
  ...cameraScenes.map((scene) => scene.image),
  ferryClip,
  ...Object.values(imageResults).flat(),
  ...Object.values(videoResults).flat(),
  ...storyClips,
  ...cameraMoveScenes.flatMap((scene) => scene.clips),
];
const results = resultRatios.flatMap((ratio) =>
  [...imageResults[ratio], ...videoResults[ratio]].map((result) => ({ ratio, result })),
);

describe('the Feed media in the demos', () => {
  it('has Feed ids: 10 characters of base32hex, each used once', () => {
    for (const image of images) expect(image.id, image.description).toMatch(/^[0-9a-v]{10}$/);
    expect(new Set(images.map((image) => image.id)).size).toBe(images.length);
  });

  it('pairs two images of the same shape, within 1%', () => {
    for (const { name, before, after } of pairs) {
      expect(before.width / before.height / (after.width / after.height), name).toBeCloseTo(1, 1);
    }
  });

  it('has each scene in the ratio it is listed under, and only the four the Feed made', () => {
    for (const scene of ratioScenes) {
      expect(Object.keys(scene.images).sort(), scene.name).toEqual(['16:9', '1:1', '3:4', '9:16']);
      for (const [ratio, image] of Object.entries(scene.images)) {
        const { width, height } = parseRatio(ratio);
        expect((image?.width ?? 0) / (image?.height ?? 1), `${scene.name} ${ratio}`).toBeCloseTo(width / height, 3);
      }
    }
  });

  it('names each camera scene once, the way mentions can call it', () => {
    const names = cameraScenes.map((scene) => scene.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it('has three results of each kind in each ratio of the queue’s demo, in that ratio within 1%', () => {
    for (const ratio of resultRatios) {
      expect(imageResults[ratio], ratio).toHaveLength(3);
      expect(videoResults[ratio], ratio).toHaveLength(3);
    }
    for (const { ratio, result } of results) {
      const { width, height } = parseRatio(ratio);
      expect(result.width / result.height / (width / height), result.id).toBeCloseTo(1, 1);
    }
  });

  it('has a ThumbHash for each result, in the result’s shape', () => {
    for (const { result } of results) {
      const bytes = Uint8Array.from(atob(result.thumbhash), (char) => char.charCodeAt(0));
      expect(thumbHashToApproximateAspectRatio(bytes) / (result.width / result.height), result.id).toBeCloseTo(1, 0);
    }
  });

  it.skipIf(!existsSync(feedManifest))('has the results as the Feed’s manifest has them', () => {
    const manifest = JSON.parse(readFileSync(feedManifest, 'utf8')) as {
      id: string;
      kind: string;
      collection: string;
      width: number;
      height: number;
      thumbhash: string;
      prompt: string;
      durationSec?: number;
    }[];
    for (const [kind, byRatio] of [
      ['image', imageResults],
      ['video', videoResults],
    ] as const) {
      for (const result of Object.values(byRatio).flat()) {
        const entry = manifest.find((item) => item.id === result.id);
        expect(entry, result.id).toMatchObject({
          kind,
          collection: 'worlds',
          width: result.width,
          height: result.height,
          thumbhash: result.thumbhash,
          prompt: result.prompt,
        });
        if ('duration' in result) expect(entry?.durationSec, result.id).toBe(result.duration);
      }
    }
  });

  it('has the grid’s worlds: 120 different ones, three images then a clip, each in its ThumbHash’s shape', () => {
    expect(worlds).toHaveLength(120);
    expect(new Set(worlds.map((world) => world.id)).size).toBe(120);
    expect(worlds.map((world) => world.kind[0]).join('')).toBe('iiiv'.repeat(30));
    for (const world of worlds) {
      expect(world.id, world.description).toMatch(/^[0-9a-v]{10}$/);
      expect(world.kind === 'video' ? world.duration : undefined, world.id).toBe(world.kind === 'video' ? 5 : undefined);
      const bytes = Uint8Array.from(atob(world.thumbhash), (char) => char.charCodeAt(0));
      expect(thumbHashToApproximateAspectRatio(bytes) / (world.width / world.height), world.id).toBeCloseTo(1, 0);
    }
  });

  it.skipIf(!existsSync(feedManifest))('has the worlds as the Feed’s manifest has them, described by their prompts', () => {
    const manifest = JSON.parse(readFileSync(feedManifest, 'utf8')) as {
      id: string;
      kind: string;
      collection: string;
      width: number;
      height: number;
      thumbhash: string;
      prompt: string;
      durationSec?: number;
    }[];
    for (const world of worlds) {
      const entry = manifest.find((item) => item.id === world.id);
      expect(entry, world.id).toMatchObject({
        kind: world.kind,
        collection: 'worlds',
        width: world.width,
        height: world.height,
        thumbhash: world.thumbhash,
      });
      const clause = entry?.prompt.split(',')[0]?.trim() ?? '';
      expect(world.description, world.id).toBe(clause.charAt(0).toUpperCase() + clause.slice(1));
      if (world.kind === 'video') expect(entry?.durationSec, world.id).toBe(world.duration);
    }
  });

  it('has the camera moves: the red car with all eight, every scene a move at most once', () => {
    const [car] = cameraMoveScenes;
    expect(car?.clips.map((clip) => clip.move)).toEqual(Object.keys(cameraMoves));
    for (const scene of cameraMoveScenes) {
      const moves = scene.clips.map((clip) => clip.move);
      expect(new Set(moves).size, scene.name).toBe(moves.length);
    }
  });

  it.skipIf(!existsSync(feedManifest))('has the camera moves and story clips as the Feed’s manifest has them', () => {
    const manifest = JSON.parse(readFileSync(feedManifest, 'utf8')) as {
      id: string;
      kind: string;
      collection: string;
      width: number;
      height: number;
      durationSec?: number;
      model?: string;
      sourceId?: string;
      cameraMove?: string;
      shot?: string;
    }[];
    for (const scene of cameraMoveScenes) {
      const entries = scene.clips.map((clip) => {
        const entry = manifest.find((item) => item.id === clip.id);
        expect(entry, clip.id).toMatchObject({
          kind: 'video',
          collection: 'camera-moves',
          width: clip.width,
          height: clip.height,
          cameraMove: clip.move,
          model: scene.model,
          durationSec: 5,
        });
        return entry;
      });
      // One still set in motion: the scene's clips all start from it.
      expect(new Set(entries.map((entry) => entry?.sourceId)).size, scene.name).toBe(1);
    }
    expect(manifest.find((item) => item.id === cameraMoveScenes[0]?.clips[0]?.id)?.sourceId).toBe(
      cameraScenes.find((scene) => scene.name === 'car')?.image.id,
    );
    for (const clip of storyClips) {
      expect(manifest.find((item) => item.id === clip.id), clip.id).toMatchObject({
        kind: 'video',
        collection: 'story',
        width: clip.width,
        height: clip.height,
        durationSec: clip.duration,
        shot: clip.shot,
      });
    }
  });

  it('asks for posters no wider than their source, as the Feed makes them', () => {
    const draft = { id: 'onf4l4h3mu', width: 1152, height: 1536, description: '' };
    expect(posterUrl(draft, 400, 'avif')).toBe(`${mediaOrigin}/m/onf4l4h3mu/v1/480.avif`);
    expect(posterUrl(draft, 1600, 'webp')).toBe(`${mediaOrigin}/m/onf4l4h3mu/v1/960.webp`);
    expect(posterSrcSet(draft, 'webp').split(', ').map((entry) => entry.split(' ')[1])).toEqual([
      '320w',
      '480w',
      '640w',
      '960w',
    ]);
    expect(videoUrl(ferryClip)).toBe(`${mediaOrigin}/m/cunh0gpgun/v1/full.mp4`);
    expect(previewUrl(ferryClip)).toBe(`${mediaOrigin}/m/cunh0gpgun/v1/preview.mp4`);
  });
});

// The Studio's results (lib/feed-studio.ts): what its simulated jobs make, in the shape asked for.
describe('the Studio’s Feed media', () => {
  const media: StudioMedia[] = studioResults.flatMap((result) =>
    result.kind === 'image' && result.draft ? [result, result.draft] : [result],
  );

  it('has Feed ids, each used once, made by the demos’ models', () => {
    const models = demoModels().map((model) => model.name);
    for (const item of media) {
      expect(item.id, item.description).toMatch(/^[0-9a-v]{10}$/);
      expect(models, item.id).toContain(item.model);
    }
    expect(new Set(media.map((item) => item.id)).size).toBe(media.length);
  });

  it('has images and clips in each of its shapes, each in the shape it is listed under, within 1%', () => {
    for (const ratio of studioRatios) {
      for (const kind of ['image', 'video'] as const) {
        expect(studioResults.some((result) => result.kind === kind && result.ratio === ratio), `${kind} ${ratio}`).toBe(true);
      }
    }
    for (const result of studioResults) {
      const { width, height } = parseRatio(result.ratio);
      expect(result.width / result.height / (width / height), result.id).toBeCloseTo(1, 1);
      if (result.kind === 'image' && result.draft) {
        expect(result.draft.width / result.draft.height / (width / height), result.draft.id).toBeCloseTo(1, 1);
      }
    }
  });

  it('has drafts in 16:9 and 3:4, where the Feed has its pairs, and camera moves only in 16:9', () => {
    const drafted = studioResults.filter((result) => result.kind === 'image' && result.draft);
    expect(new Set(drafted.map((result) => result.ratio))).toEqual(new Set(['16:9', '3:4']));
    const moved = studioResults.filter((result) => result.kind === 'video' && result.move);
    expect(new Set(moved.map((result) => result.ratio))).toEqual(new Set(['16:9']));
    expect(new Set(moved.map((result) => result.kind === 'video' && result.move))).toEqual(new Set(Object.keys(cameraMoves)));
  });

  it('has a ThumbHash for each, in its shape', () => {
    for (const item of media) {
      const bytes = Uint8Array.from(atob(item.thumbhash), (char) => char.charCodeAt(0));
      expect(thumbHashToApproximateAspectRatio(bytes) / (item.width / item.height), item.id).toBeCloseTo(1, 0);
    }
  });

  it.skipIf(!existsSync(feedManifest))('has them as the Feed’s manifest has them', () => {
    const manifest = JSON.parse(readFileSync(feedManifest, 'utf8')) as {
      id: string;
      kind: string;
      collection: string;
      width: number;
      height: number;
      thumbhash: string;
      model: string;
      durationSec?: number;
      cameraMove?: string;
      pairId?: string;
      variant?: string;
    }[];
    const entry = (id: string) => manifest.find((item) => item.id === id);
    for (const result of studioResults) {
      expect(entry(result.id), result.id).toMatchObject({
        kind: result.kind,
        width: result.width,
        height: result.height,
        thumbhash: result.thumbhash,
        model: result.model,
      });
      if (result.kind === 'video') {
        expect(entry(result.id)?.durationSec, result.id).toBe(result.duration);
        expect(entry(result.id)?.cameraMove, result.id).toBe(result.move);
        expect(['camera-moves', 'story', 'worlds'], result.id).toContain(entry(result.id)?.collection);
      } else if (result.draft) {
        expect(entry(result.id), result.id).toMatchObject({ collection: 'pairs', variant: 'final' });
        expect(entry(result.draft.id), result.draft.id).toMatchObject({
          collection: 'pairs',
          variant: 'draft',
          pairId: entry(result.id)?.pairId,
          width: result.draft.width,
          height: result.draft.height,
          thumbhash: result.draft.thumbhash,
          model: result.draft.model,
        });
      } else {
        expect(entry(result.id)?.collection, result.id).toBe('ratios');
      }
    }
  });
});
