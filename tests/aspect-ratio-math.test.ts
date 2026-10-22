// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEFAULT_RATIOS, fitRatio, parseRatio, ratioShape } from '@/registry/ui/aspect-ratio-picker/ratio-math';

describe('aspect ratio math', () => {
  it('offers the spec’s eight ratios by default, in pairs', () => {
    expect(DEFAULT_RATIOS).toEqual(['1:1', '3:4', '4:3', '2:3', '3:2', '9:16', '16:9', '21:9']);
  });

  it('reads width:height, decimals included', () => {
    expect(parseRatio('16:9')).toEqual({ width: 16, height: 9 });
    expect(parseRatio('1.85:1')).toEqual({ width: 1.85, height: 1 });
  });

  it('refuses anything that isn’t two positive numbers', () => {
    for (const ratio of ['16x9', '16:', ':9', '0:1', '-4:3', '1:2:3', 'wide']) {
      expect(() => parseRatio(ratio), ratio).toThrow('width:height');
    }
  });

  it('fits a ratio in a square, its longest side 1', () => {
    expect(fitRatio('16:9')).toEqual({ width: 1, height: 0.5625 });
    expect(fitRatio('9:16')).toEqual({ width: 0.5625, height: 1 });
    expect(fitRatio('1:1')).toEqual({ width: 1, height: 1 });
    expect(fitRatio('21:9').height).toBeCloseTo(9 / 21);
  });

  it('names the shape', () => {
    expect(ratioShape('16:9')).toBe('landscape');
    expect(ratioShape('3:4')).toBe('portrait');
    expect(ratioShape('1:1')).toBe('square');
  });
});
