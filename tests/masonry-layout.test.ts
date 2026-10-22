// @vitest-environment node
// Masonry lanes (spec section 5): the lanes at each width, placement by aspect ratio, the boxes
// in pixels. Ported from Generation Feed's tests of its lib/layout.ts, where this math began.
import { describe, expect, it } from 'vitest';
import {
  cardAspect,
  cardBox,
  gridHeight,
  gridLayout,
  LANE_STEPS,
  laneSizes,
  laneStep,
  laneTotals,
  placeCards,
  type LaneStep,
} from '@/registry/lib/masonry-layout';

describe('gridLayout', () => {
  it.each([
    [390, 2, 4],
    [639, 2, 4],
    [640, 3, 6],
    [1023, 3, 6],
    [1024, 4, 8],
    [1439, 4, 8],
    [1440, 5, 8],
    [2560, 5, 8],
  ])('a %i px grid has %i lanes and a %i px gap', (width, lanes, gap) => {
    expect(gridLayout(width)).toMatchObject({ lanes, gap });
  });

  it('fills the width exactly with lanes, gaps and padding', () => {
    for (const width of [390, 768, 1280, 1440]) {
      const { lanes, gap, laneWidth } = gridLayout(width);
      expect(lanes * laneWidth + (lanes + 1) * gap).toBeCloseTo(width);
    }
  });

  it('gives the Feed’s lane widths', () => {
    expect(gridLayout(1440).laneWidth).toBeCloseTo(278.4);
    expect(gridLayout(390).laneWidth).toBeCloseTo(189);
  });

  it('never goes negative', () => {
    expect(gridLayout(0).laneWidth).toBe(0);
  });

  it('takes lane steps of your own', () => {
    const steps: LaneStep[] = [
      { minWidth: 0, lanes: 1, gap: 0 },
      { minWidth: 500, lanes: 2, gap: 10 },
    ];
    expect(gridLayout(499, steps)).toEqual({ lanes: 1, gap: 0, laneWidth: 499 });
    expect(gridLayout(530, steps)).toEqual({ lanes: 2, gap: 10, laneWidth: 250 });
  });
});

describe('laneStep', () => {
  it('is the last step whose width the grid reaches, and the first below them all', () => {
    const steps: LaneStep[] = [
      { minWidth: 300, lanes: 2, gap: 4 },
      { minWidth: 800, lanes: 4, gap: 8 },
    ];
    expect(laneStep(100, steps).lanes).toBe(2);
    expect(laneStep(800, steps).lanes).toBe(4);
  });

  it('needs at least one step', () => {
    expect(() => laneStep(100, [])).toThrow('at least one lane step');
  });
});

describe('cardAspect', () => {
  it('follows the media’s aspect ratio', () => {
    expect(cardAspect(1000, 1250)).toBe(1.25);
    expect(cardAspect(1920, 1080)).toBe(0.5625);
  });

  it('clamps very tall media to 2:1 and very wide media to 1:2', () => {
    expect(cardAspect(100, 1000)).toBe(2);
    expect(cardAspect(2100, 900)).toBe(0.5);
  });
});

describe('placeCards', () => {
  it('fills lanes left to right, then always picks the lane with the smallest total aspect', () => {
    const placements = placeCards([1, 2, 0.5, 1, 1], 3);
    expect(placements.map((placement) => placement.lane)).toEqual([0, 1, 2, 2, 0]);
    expect(placements[3]).toEqual({ lane: 2, above: 0.5, count: 1 });
    expect(placements[4]).toEqual({ lane: 0, above: 1, count: 1 });
  });

  it('never moves earlier cards when more come', () => {
    const aspects = [1.25, 0.5625, 2, 1, 0.75, 1.333, 0.5, 1.777, 1, 1.25];
    const all = placeCards(aspects, 4);
    expect(placeCards(aspects.slice(0, 6), 4)).toEqual(all.slice(0, 6));
  });

  it('places the same way at any width: only the lane count matters', () => {
    const aspects = [1.25, 0.5625, 2, 1, 0.75, 1.333, 0.5, 1.777];
    const lanesAt = (width: number) => gridLayout(width).lanes;
    expect(placeCards(aspects, lanesAt(1100))).toEqual(placeCards(aspects, lanesAt(1400)));
  });
});

describe('cardBox and gridHeight', () => {
  const aspects = [1, 2, 0.5, 1];
  const layout = gridLayout(400); // 2 lanes, 4 px gap, lane width 194
  const placements = placeCards(aspects, layout.lanes);
  const box = (index: number) => {
    const placement = placements[index];
    if (!placement) throw new Error(`No card ${String(index)}`);
    return cardBox(placement, aspects[index] ?? 1, layout);
  };

  it('puts a card below the cards above it in its lane, a gap between each', () => {
    // Lane 0: aspects 1, then 0.5 (index 2), then 1 (index 3).
    expect(box(0)).toEqual({ left: 4, top: 4, width: 194, height: 194 });
    expect(box(1)).toEqual({ left: 202, top: 4, width: 194, height: 388 });
    expect(box(2)).toEqual({ left: 4, top: 202, width: 194, height: 97 });
    expect(box(3)).toEqual({ left: 4, top: 303, width: 194, height: 194 });
  });

  it('makes the grid as tall as its tallest lane plus the padding', () => {
    // Lane 0 ends at 303 + 194 = 497; lane 1 at 4 + 388 = 392.
    expect(laneTotals(placements, aspects, layout.lanes)).toEqual([
      { aspect: 2.5, count: 3 },
      { aspect: 2, count: 1 },
    ]);
    expect(gridHeight(laneTotals(placements, aspects, layout.lanes), layout)).toBe(497 + 4);
  });

  it('is just the padding when it’s empty', () => {
    expect(gridHeight(laneTotals([], [], 2), layout)).toBe(4);
  });
});

describe('laneSizes', () => {
  it('gives the share of the window a lane takes at each step: the Feed’s sizes for its lanes', () => {
    expect(laneSizes()).toBe('(max-width: 639px) 50vw, (max-width: 1023px) 33vw, (max-width: 1439px) 25vw, 20vw');
    expect(laneSizes(LANE_STEPS.slice(0, 1))).toBe('50vw');
  });
});
