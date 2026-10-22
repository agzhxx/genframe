// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { estimateCost, formatEstimate, formatPrice, type ModelPrice } from '@/registry/lib/estimate-cost';

const kling = { price: { amount: 0.042, unit: 'second' } } satisfies { price: ModelPrice };
const klingSale = { price: { amount: 0.021, unit: 'second' } } satisfies { price: ModelPrice };
const soul = { price: { amount: 0.0057, unit: 'image' } } satisfies { price: ModelPrice };
const grok = { price: { amount: 0.08, unit: 'image', perReference: 0.01 } } satisfies { price: ModelPrice };

function words(model: { price: ModelPrice }, settings: Parameters<typeof estimateCost>[1], locale?: string) {
  const estimate = estimateCost(model, settings);
  if (!estimate) throw new Error('no estimate');
  const { breakdown, total } = formatEstimate(estimate, locale);
  return `${breakdown} ${total}`;
}

describe('estimateCost', () => {
  it('prices seconds of video exactly: the spec’s 5 s × $0.042 is $0.21, not float’s', () => {
    expect(0.042 * 5).not.toBe(0.21);
    expect(estimateCost(kling, { duration: 5 })).toEqual({
      lines: [{ unit: 'second', quantity: 5, unitPrice: 0.042, amount: 0.21 }],
      subtotal: 0.21,
      total: 0.21,
      currency: 'USD',
    });
  });

  it('rounds once, half up, to cents', () => {
    expect(estimateCost(klingSale, { duration: 5 })).toMatchObject({ subtotal: 0.105, total: 0.11 });
    expect(estimateCost({ price: { amount: 0.0208, unit: 'second' } }, { duration: 5 })).toMatchObject({
      subtotal: 0.104,
      total: 0.1,
    });
    // Rounding the float 1.005 the usual way gives 1 (1.005 × 100 is 100.49999999999999).
    expect(Math.round(1.005 * 100) / 100).toBe(1);
    expect(estimateCost({ price: { amount: 1.005, unit: 'image' } })?.total).toBe(1.01);
  });

  it('adds exactly too: $0.20 and a $0.10 reference are $0.30', () => {
    expect(0.2 + 0.1).not.toBe(0.3);
    expect(estimateCost({ price: { amount: 0.2, unit: 'image', perReference: 0.1 } }, { references: 1 })).toMatchObject({
      subtotal: 0.3,
      total: 0.3,
    });
  });

  it('keeps the exact subtotal when the total rounds to nothing', () => {
    expect(estimateCost({ price: { amount: 0.0032, unit: 'image' } })).toMatchObject({ subtotal: 0.0032, total: 0 });
    expect(estimateCost(soul)).toMatchObject({ subtotal: 0.0057, total: 0.01 });
  });

  it('makes one image or video by default, and multiplies by the count', () => {
    expect(estimateCost(soul)?.lines).toEqual([{ unit: 'image', quantity: 1, unitPrice: 0.0057, amount: 0.0057 }]);
    expect(estimateCost(soul, { count: 3 })).toMatchObject({ subtotal: 0.0171, total: 0.02 });
    expect(estimateCost({ price: { amount: 0.5, unit: 'video' } }, { count: 2, duration: 5 })?.lines).toEqual([
      { unit: 'video', quantity: 2, unitPrice: 0.5, amount: 1 },
    ]);
  });

  it('counts every second of every video', () => {
    expect(estimateCost(kling, { duration: 5, count: 2 })).toMatchObject({
      lines: [{ unit: 'second', quantity: 10, unitPrice: 0.042, amount: 0.42 }],
      total: 0.42,
    });
    expect(estimateCost(kling, { duration: 7.5 })).toMatchObject({ subtotal: 0.315, total: 0.32 });
  });

  it('charges each reference image for every image made, on a line of its own', () => {
    expect(estimateCost(grok, { references: 2 })).toEqual({
      lines: [
        { unit: 'image', quantity: 1, unitPrice: 0.08, amount: 0.08 },
        { unit: 'reference', quantity: 2, unitPrice: 0.01, amount: 0.02 },
      ],
      subtotal: 0.1,
      total: 0.1,
      currency: 'USD',
    });
    expect(estimateCost(grok, { references: 2, count: 3 })).toMatchObject({ subtotal: 0.3, total: 0.3 });
  });

  it('leaves out the references line when they cost nothing, or there are none', () => {
    expect(estimateCost(grok)?.lines).toHaveLength(1);
    expect(estimateCost(soul, { references: 4 })?.lines).toHaveLength(1);
  });

  it('can’t estimate a price per second without a duration', () => {
    expect(estimateCost(kling)).toBeNull();
    expect(estimateCost(kling, { count: 2 })).toBeNull();
    expect(estimateCost(kling, { duration: 0 })).toMatchObject({ subtotal: 0, total: 0 });
  });

  it('rounds to the currency’s own smallest unit', () => {
    expect(estimateCost({ price: { amount: 3.5, unit: 'second', currency: 'JPY' } }, { duration: 5 })).toMatchObject({
      subtotal: 17.5,
      total: 18,
      currency: 'JPY',
    });
    expect(estimateCost({ price: { amount: 0.0105, unit: 'image', currency: 'KWD' } })?.total).toBe(0.011);
  });

  it('stays exact with very large and very small numbers', () => {
    expect(estimateCost(soul, { count: 1_000_000 })?.total).toBe(5700);
    expect(estimateCost({ price: { amount: 1e-7, unit: 'image' } }, { count: 3 })?.subtotal).toBe(3e-7);
    expect(estimateCost({ price: { amount: 2e21, unit: 'image' } })?.total).toBe(2e21);
  });

  it('refuses negative or broken numbers, counts that aren’t whole and unknown currencies', () => {
    expect(() => estimateCost({ price: { amount: -0.1, unit: 'image' } })).toThrow(RangeError);
    expect(() => estimateCost({ price: { amount: Number.NaN, unit: 'image' } })).toThrow('amount');
    expect(() => estimateCost(grok, { references: -1 })).toThrow('references');
    expect(() => estimateCost(soul, { count: 1.5 })).toThrow('whole number');
    expect(() => estimateCost(kling, { duration: Number.POSITIVE_INFINITY })).toThrow('duration');
    expect(() => estimateCost({ price: { amount: 1, unit: 'image', perReference: -1 } })).toThrow('perReference');
    expect(() => estimateCost({ price: { amount: 1, unit: 'image', currency: 'dollars' } })).toThrow(RangeError);
  });
});

describe('formatEstimate', () => {
  it('words the spec’s example', () => {
    expect(words(kling, { duration: 5 })).toBe('5 s × $0.042 ≈ $0.21');
  });

  it('shows a price’s every decimal, and the total in cents', () => {
    expect(words(klingSale, { duration: 5 })).toBe('5 s × $0.021 ≈ $0.11');
    expect(words(soul, { count: 3 })).toBe('3 images × $0.0057 ≈ $0.02');
    expect(words({ price: { amount: 2, unit: 'video' } }, { count: 1 })).toBe('1 video × $2.00 ≈ $2.00');
  });

  it('adds the references', () => {
    expect(words(grok, { references: 1 })).toBe('1 image × $0.08 + 1 ref × $0.01 ≈ $0.09');
    expect(words(grok, { references: 2, count: 2 })).toBe('2 images × $0.08 + 4 refs × $0.01 ≈ $0.20');
  });

  it('says when the total rounds to nothing, or is nothing', () => {
    expect(words({ price: { amount: 0.0032, unit: 'image' } }, {})).toBe('1 image × $0.0032 < $0.01');
    expect(words(kling, { duration: 0 })).toBe('0 s × $0.042 $0.00');
    expect(words({ price: { amount: 0.3, unit: 'image', currency: 'JPY' } }, {})).toBe('1 image × ¥0.3 < ¥1');
  });

  it('writes numbers the locale’s way', () => {
    // German puts the symbol after the number, past a no-break space.
    expect(words(kling, { duration: 5 }, 'de-DE')).toBe('5 s × 0,042\u00a0$ ≈ 0,21\u00a0$');
  });
});

describe('formatPrice', () => {
  it('words a price per unit, with what a reference adds', () => {
    expect(formatPrice(kling.price)).toBe('$0.042 / s');
    expect(formatPrice(soul.price)).toBe('$0.0057 / image');
    expect(formatPrice(grok.price)).toBe('$0.08 / image + $0.01 / ref');
    expect(formatPrice({ amount: 120, unit: 'video', currency: 'JPY' })).toBe('¥120 / video');
  });
});
