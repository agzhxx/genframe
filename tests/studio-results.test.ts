// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { demoModels } from '@/lib/demo-models';
import { cameraMoves, type CameraMove } from '@/lib/feed-camera-moves';
import { studioRatios } from '@/lib/feed-studio';
import { pickResult, settingsKey, studioCandidates, type StudioSettings } from '@/lib/studio-results';

const models = demoModels();
const moves = Object.keys(cameraMoves) as CameraMove[];
const imageModels = models.filter((model) => model.kind === 'image').map((model) => model.name);
const videoModels = models.filter((model) => model.kind === 'video').map((model) => model.name);

const video = (settings: Partial<StudioSettings>): StudioSettings => ({
  kind: 'video',
  ratio: '16:9',
  model: 'Kling 2.5',
  ...settings,
});

// The ids a job with these settings makes on its first `count` turns.
function made(settings: StudioSettings, count: number) {
  return Array.from({ length: count }, (_, turn) => pickResult(settings, turn).id);
}

describe('pickResult', () => {
  it('always makes the kind and the shape asked for, with any model and move', () => {
    for (const ratio of studioRatios) {
      for (const model of imageModels) {
        const result = pickResult({ kind: 'image', ratio, model }, 0);
        expect([result.kind, result.ratio]).toEqual(['image', ratio]);
      }
      for (const model of videoModels) {
        for (const move of [undefined, ...moves]) {
          const result = pickResult({ kind: 'video', ratio, model, move }, 0);
          expect([result.kind, result.ratio], `${ratio} ${model} ${move ?? ''}`).toEqual(['video', ratio]);
        }
      }
    }
  });

  it('makes an image with a draft in 16:9 and 3:4, where the Feed has its pairs, whichever image model', () => {
    for (const model of imageModels) {
      for (const ratio of ['16:9', '3:4'] as const) {
        const result = pickResult({ kind: 'image', ratio, model }, 0);
        expect(result.kind === 'image' && result.draft?.model, `${model} ${ratio}`).toBe('Soul 2');
        expect(result.model).toBe('Grok Imagine 2.0');
      }
      for (const ratio of ['1:1', '9:16'] as const) {
        const result = pickResult({ kind: 'image', ratio, model }, 0);
        expect(result.kind === 'image' && result.draft, `${model} ${ratio}`).toBeUndefined();
      }
    }
  });

  it('makes a clip of the camera move asked for, by the model picked when the Feed has its clip', () => {
    for (const move of moves) {
      const car = pickResult(video({ model: 'Cinema Studio 4.0', move }), 0);
      expect(car.kind === 'video' && [car.move, car.model]).toEqual([move, 'Cinema Studio 4.0']);
    }
    // Kling 2.5 made the alley, the lighthouse and the snow leopard dolly in; Cinema Studio the car.
    expect(made(video({ move: 'dolly-in' }), 4)).toEqual(['k4hu95gmtu', '3qg8g0fs02', '1j5nl53q8r', 'k4hu95gmtu']);
    // Only the car orbits: the move comes before the model.
    expect(made(video({ move: 'orbit' }), 2)).toEqual(['tvl7jqk4h2', 'tvl7jqk4h2']);
    // Kling 2.5 Pro made no camera-move clips: every dolly in, the car's first.
    expect(made(video({ model: 'Kling 2.5 Pro', move: 'dolly-in' }), 4)).toEqual([
      '2ku2vlkbhr',
      'k4hu95gmtu',
      '3qg8g0fs02',
      '1j5nl53q8r',
    ]);
  });

  it('makes the model’s own clips when no move is asked for', () => {
    expect(made(video({ model: 'Kling 2.5 Pro' }), 3)).toEqual(['qjr027827t', 'hoasfc54e8', 'a7391hh3rt']);
    const car = Array.from({ length: 8 }, (_, turn) => pickResult(video({ model: 'Cinema Studio 4.0' }), turn));
    expect(new Set(car.map((result) => result.model))).toEqual(new Set(['Cinema Studio 4.0']));
    expect(new Set(car.map((result) => result.id)).size).toBe(8);
  });

  it('keeps the shape when the Feed has no clip of the move in it', () => {
    const result = pickResult(video({ ratio: '9:16', move: 'orbit' }), 0);
    expect(result.kind === 'video' && [result.ratio, result.move]).toEqual(['9:16', undefined]);
  });

  it('takes the candidates in turn, and starts again after the last', () => {
    const settings: StudioSettings = { kind: 'image', ratio: '16:9', model: 'Grok Imagine 2.0' };
    const candidates = studioCandidates(settings).map((result) => result.id);
    expect(candidates.length).toBeGreaterThan(1);
    expect(made(settings, candidates.length + 1)).toEqual([...candidates, candidates[0]]);
  });
});

describe('settingsKey', () => {
  it('is the same for the same settings, and differs with any of them', () => {
    const base = video({ move: 'dolly-in' });
    expect(settingsKey(base)).toBe(settingsKey({ ...base }));
    for (const change of [{ ratio: '1:1' }, { model: 'Kling 2.5 Pro' }, { move: undefined }, { kind: 'image' }] as const) {
      expect(settingsKey({ ...base, ...change })).not.toBe(settingsKey(base));
    }
  });
});
