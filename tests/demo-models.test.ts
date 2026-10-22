// @vitest-environment node
// The demos' models and prices, copied by hand from the Feed's price file (lib/demo-models.ts).
// With the Feed checked out next to this repo, as on Agzhan's machine, the copy is compared with
// its file; CI has only this repo and checks what it can without it.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { demoModels, pricesChecked } from '@/lib/demo-models';
import { estimateCost, formatEstimate } from '@/registry/lib/estimate-cost';

const feedPrices = fileURLToPath(new URL('../../generation-feed/scripts/higgsfield-models.ts', import.meta.url));

interface FeedModel {
  name: string;
  resolution: string;
  sale: number;
  list: number;
  perReference?: number;
}

// Each demo model's entry in the Feed's IMAGE_MODELS or VIDEO_MODELS.
const feedKeys: Record<string, string> = {
  'soul-2': 'soul-2-1080p',
  'grok-imagine-2': 'grok-imagine-2-2k',
  'kling-2.5': 'kling-2.5-standard',
  'kling-2.5-pro': 'kling-2.5-pro',
  'cinema-studio-4': 'cinema-studio-4-480p',
};

describe('the demo models', () => {
  it('have unique ids, each with its entry in the Feed', () => {
    const ids = demoModels().map((model) => model.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(Object.keys(feedKeys).sort());
  });

  it('cost no more on sale than at list price', () => {
    const list = demoModels('list');
    for (const [index, model] of demoModels('sale').entries()) {
      expect(model.price.amount, model.name).toBeLessThanOrEqual(list[index]?.price.amount ?? 0);
    }
  });

  it('give the spec’s example at Kling’s list price: 5 s × $0.042 ≈ $0.21', () => {
    const kling = demoModels('list').find((model) => model.id === 'kling-2.5');
    const estimate = kling ? estimateCost(kling, { duration: kling.durations?.[0] }) : null;
    expect(estimate && formatEstimate(estimate)).toEqual({ breakdown: '5 s × $0.042', total: '≈ $0.21' });
  });

  it.skipIf(!existsSync(feedPrices))('match the Feed’s price file', async () => {
    const feed = (await import(feedPrices)) as {
      PRICES_CHECKED: string;
      IMAGE_MODELS: Record<string, FeedModel>;
      VIDEO_MODELS: Record<string, FeedModel>;
    };
    expect(feed.PRICES_CHECKED).toBe(pricesChecked);
    const list = demoModels('list');
    for (const [index, model] of demoModels('sale').entries()) {
      const key = feedKeys[model.id] ?? '';
      const entry = model.kind === 'image' ? feed.IMAGE_MODELS[key] : feed.VIDEO_MODELS[key];
      expect(entry, key).toBeDefined();
      expect(model.name).toBe(entry?.name);
      expect(model.resolutions).toEqual([entry?.resolution]);
      expect(model.price.amount, `${model.name} on sale`).toBe(entry?.sale);
      expect(list[index]?.price.amount, `${model.name} at list price`).toBe(entry?.list);
      expect(model.price.perReference ?? 0, `${model.name} per reference`).toBe(entry?.perReference ?? 0);
      expect(model.price.unit).toBe(model.kind === 'image' ? 'image' : 'second');
    }
  });
});
