// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { badgesOf, filterModels, groupModels } from '@/registry/ui/model-picker/model-filter';
import type { ModelOption } from '@/registry/ui/model-picker/model-picker';

const soul: ModelOption = {
  id: 'soul',
  name: 'Soul 2',
  kind: 'image',
  price: { amount: 0.0057, unit: 'image' },
  resolutions: ['1080p'],
};
const kling: ModelOption = {
  id: 'kling',
  name: 'Kling 2.5',
  kind: 'video',
  price: { amount: 0.042, unit: 'second' },
  resolutions: ['720p', '1080p'],
  durations: [5, 10],
  speed: 'Fast',
  keywords: ['Kuaishou'],
};
const cinema: ModelOption = { id: 'cinema', name: 'Cinema Studio 4.0', kind: 'video', price: { amount: 0.2, unit: 'second' } };
const models = [soul, kling, cinema];

describe('model badges', () => {
  it('lists the kind, then resolutions, clip lengths and speed', () => {
    expect(badgesOf(kling)).toEqual(['Video', '720p', '1080p', '5 s', '10 s', 'Fast']);
    expect(badgesOf(soul)).toEqual(['Image', '1080p']);
    expect(badgesOf(cinema)).toEqual(['Video']);
  });
});

describe('model search', () => {
  it('keeps every model, in order, for an empty query', () => {
    expect(filterModels(models, '')).toEqual(models);
    expect(filterModels(models, '   ')).toEqual(models);
  });

  it('finds by name, ignoring case', () => {
    expect(filterModels(models, 'KLING')).toEqual([kling]);
    expect(filterModels(models, 'studio')).toEqual([cinema]);
  });

  it('finds by badge: kind, resolution, clip length (5 s or 5s) and speed', () => {
    expect(filterModels(models, 'video')).toEqual([kling, cinema]);
    expect(filterModels(models, '1080p')).toEqual([soul, kling]);
    expect(filterModels(models, '10s')).toEqual([kling]);
    expect(filterModels(models, '10 s')).toEqual([kling]);
    expect(filterModels(models, 'fast')).toEqual([kling]);
  });

  it('finds by keyword', () => {
    expect(filterModels(models, 'kuaishou')).toEqual([kling]);
  });

  it('needs every word somewhere', () => {
    expect(filterModels(models, 'video 1080p')).toEqual([kling]);
    expect(filterModels(models, 'image 720p')).toEqual([]);
  });
});

describe('model groups', () => {
  it('groups in the order each group first appears', () => {
    const groups = groupModels(models, (model) => (model.kind === 'image' ? 'Image' : 'Video'));
    expect(groups).toEqual([
      { name: 'Image', models: [soul] },
      { name: 'Video', models: [kling, cinema] },
    ]);
    expect(groupModels([kling, soul, cinema], (model) => model.kind).map((group) => group.name)).toEqual([
      'video',
      'image',
    ]);
  });

  it('is one group without a name when not grouped', () => {
    expect(groupModels(models)).toEqual([{ name: '', models }]);
  });
});
