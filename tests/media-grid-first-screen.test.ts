// @vitest-environment node
// MediaGrid's first screen in CSS (registry/ui/media-grid/first-screen.ts): the custom properties
// each card carries and the style sheet that turns them into boxes. The end-to-end test checks a
// browser draws them where the pixel layout puts the cards; these check what they say.
import { describe, expect, it } from 'vitest';
import { LANE_STEPS, placeCards, type LaneStep } from '@/registry/lib/masonry-layout';
import { firstScreenCss, firstScreenVariables } from '@/registry/ui/media-grid/first-screen';

const aspects = [1.25, 0.5625, 2, 1, 0.75, 1.333, 0.5];

describe('firstScreenVariables', () => {
  it('gives every card its place at every lane step, as placeCards does', () => {
    const { cards } = firstScreenVariables(aspects, LANE_STEPS);
    LANE_STEPS.forEach(({ lanes }, step) => {
      placeCards(aspects, lanes).forEach((placement, index) => {
        expect(cards[index]).toMatchObject({
          [`--l${String(step)}`]: placement.lane,
          [`--a${String(step)}`]: placement.above,
          [`--n${String(step)}`]: placement.count,
        });
      });
    });
    expect(cards.map((card) => card['--aspect'])).toEqual(aspects);
  });

  it('gives the spacer the tallest lane at each step, in cqw', () => {
    const { spacer } = firstScreenVariables([1, 2, 0.5, 1], LANE_STEPS.slice(0, 1));
    // Two lanes of (100cqw - 12px) / 2: lane 0 holds 1 + 0.5 + 1 in 3 cards, lane 1 holds 2 in one.
    expect(spacer).toEqual({
      '--h0': 'calc(max(2.5 * ((100cqw - 12px) / 2) + 12px, 2 * ((100cqw - 12px) / 2) + 4px) + 4px)',
    });
  });
});

describe('firstScreenCss', () => {
  const css = firstScreenCss('«r1»', LANE_STEPS);

  it('is scoped to its grid', () => {
    for (const rule of css.split('}').filter(Boolean)) {
      if (rule.startsWith('@container')) continue;
      expect(rule.trim()).toMatch(/^\[data-media-grid="«r1»"\]/);
    }
  });

  it('places cards with the first step, then a container query for each of the others', () => {
    expect(css).toContain('[data-media-grid="«r1»"]{container-type:inline-size}');
    expect(css).toContain('--lanes:2;--gap:4px;--lane:var(--l0);--above:var(--a0);--count:var(--n0)');
    expect(css.match(/@container \(width >= (\d+)px\)/g)).toEqual([
      '@container (width >= 640px)',
      '@container (width >= 1024px)',
      '@container (width >= 1440px)',
    ]);
    expect(css).toContain('@container (width >= 1440px){[data-media-grid="«r1»"]>[data-slot=media-grid-item]{--lanes:5;--gap:8px;--lane:var(--l3)');
    expect(css).toContain('[data-media-grid="«r1»"]>[data-slot=media-grid-spacer]{height:var(--h3)}');
  });

  it('follows lane steps of your own', () => {
    const steps: LaneStep[] = [
      { minWidth: 0, lanes: 1, gap: 0 },
      { minWidth: 500, lanes: 3, gap: 12 },
    ];
    const own = firstScreenCss('grid', steps);
    expect(own).toContain('--lanes:1;--gap:0px;--lane:var(--l0)');
    expect(own).toContain(
      '@container (width >= 500px){[data-media-grid="grid"]>[data-slot=media-grid-item]{--lanes:3;--gap:12px;--lane:var(--l1)',
    );
    expect(own.match(/@container/g)).toHaveLength(1);
  });
});
