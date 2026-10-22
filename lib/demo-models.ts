// Models for the docs' demos, with Higgsfield's API prices as Generation Feed recorded them in its
// scripts/higgsfield-models.ts (checked on 2026-10-16): names, resolutions, the price per image or
// per second of video, on sale and at list price, and what a reference image adds. The clip length
// is the 5 s the Feed made its videos at; the keywords name each model's maker. Only what the demos
// show is copied, by hand: tests/demo-models.test.ts checks the copy against the Feed's file when
// the Feed is checked out next to this repo.

import type { ModelOption } from '@/registry/ui/model-picker/model-picker';

/** When the Feed checked the prices; the demos say so next to them. */
export const pricesChecked = '2026-10-16';

/** "sale" is what a job cost when the Feed checked; "list" is the price without the discount. */
export type PriceLevel = 'sale' | 'list';

interface DemoModel extends Omit<ModelOption, 'price'> {
  unit: 'image' | 'second';
  sale: number;
  list: number;
  perReference?: number;
}

const models: DemoModel[] = [
  {
    id: 'soul-2',
    name: 'Soul 2',
    kind: 'image',
    resolutions: ['1080p'],
    keywords: ['higgsfield'],
    unit: 'image',
    sale: 0.0057,
    list: 0.0057,
  },
  {
    id: 'grok-imagine-2',
    name: 'Grok Imagine 2.0',
    kind: 'image',
    resolutions: ['2k'],
    keywords: ['xai'],
    unit: 'image',
    sale: 0.08,
    list: 0.08,
    perReference: 0.01,
  },
  {
    id: 'kling-2.5',
    name: 'Kling 2.5',
    kind: 'video',
    resolutions: ['720p'],
    durations: [5],
    keywords: ['kuaishou'],
    unit: 'second',
    sale: 0.021,
    list: 0.042,
  },
  {
    id: 'kling-2.5-pro',
    name: 'Kling 2.5 Pro',
    kind: 'video',
    resolutions: ['1080p'],
    durations: [5],
    keywords: ['kuaishou'],
    unit: 'second',
    sale: 0.035,
    list: 0.07,
  },
  {
    id: 'cinema-studio-4',
    name: 'Cinema Studio 4.0',
    kind: 'video',
    resolutions: ['480p'],
    durations: [5],
    keywords: ['higgsfield'],
    unit: 'second',
    sale: 0.2057,
    list: 0.2057,
  },
];

/** The demo models, priced at sale or at list price. */
export function demoModels(level: PriceLevel = 'sale'): ModelOption[] {
  return models.map(({ unit, sale, list, perReference, ...model }) => ({
    ...model,
    price: { amount: level === 'sale' ? sale : list, unit, ...(perReference ? { perReference } : {}) },
  }));
}

/** ModelPicker's `groupBy` for the demos: images, then videos. */
export function byKind(model: ModelOption) {
  return model.kind === 'image' ? 'Image' : 'Video';
}
