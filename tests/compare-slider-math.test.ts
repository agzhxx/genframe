// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  afterClipPath,
  clampPosition,
  dividerTransform,
  positionAt,
  positionForKey,
  positionText,
} from '@/registry/ui/compare-slider/slider-math';

const box = { left: 100, top: 50, width: 400, height: 200 };

describe('compare slider math', () => {
  it('keeps positions between 0 and 100', () => {
    expect(clampPosition(-5)).toBe(0);
    expect(clampPosition(42.5)).toBe(42.5);
    expect(clampPosition(130)).toBe(100);
  });

  it('turns a pointer into a position from the left edge when horizontal', () => {
    expect(positionAt({ clientX: 100, clientY: 0 }, box, 'horizontal')).toBe(0);
    expect(positionAt({ clientX: 340, clientY: 0 }, box, 'horizontal')).toBe(60);
    expect(positionAt({ clientX: 500, clientY: 0 }, box, 'horizontal')).toBe(100);
  });

  it('turns a pointer into a position from the bottom edge when vertical', () => {
    expect(positionAt({ clientX: 0, clientY: 250 }, box, 'vertical')).toBe(0);
    expect(positionAt({ clientX: 0, clientY: 130 }, box, 'vertical')).toBe(60);
    expect(positionAt({ clientX: 0, clientY: 50 }, box, 'vertical')).toBe(100);
  });

  it('measures pointers outside the slider past its ends, and finds nothing in an empty box', () => {
    expect(positionAt({ clientX: 20, clientY: 0 }, box, 'horizontal')).toBe(-20);
    expect(positionAt({ clientX: 900, clientY: 0 }, box, 'horizontal')).toBe(200);
    expect(positionAt({ clientX: 0, clientY: 0 }, { ...box, width: 0 }, 'horizontal')).toBe(0);
  });

  it('steps by 1 with the arrows and by 10 with Shift or Page Up and Down', () => {
    expect(positionForKey('ArrowRight', false, 50)).toBe(51);
    expect(positionForKey('ArrowUp', false, 50)).toBe(51);
    expect(positionForKey('ArrowLeft', false, 50)).toBe(49);
    expect(positionForKey('ArrowDown', false, 50)).toBe(49);
    expect(positionForKey('ArrowRight', true, 50)).toBe(60);
    expect(positionForKey('ArrowDown', true, 50)).toBe(40);
    expect(positionForKey('PageUp', false, 50)).toBe(60);
    expect(positionForKey('PageDown', false, 50)).toBe(40);
  });

  it('goes to the ends with Home and End, and stops there', () => {
    expect(positionForKey('Home', false, 37)).toBe(0);
    expect(positionForKey('End', false, 37)).toBe(100);
    expect(positionForKey('ArrowLeft', false, 0)).toBe(0);
    expect(positionForKey('PageUp', false, 95)).toBe(100);
  });

  it('steps a dragged position onto whole percents', () => {
    expect(positionForKey('ArrowRight', false, 57.4)).toBe(58);
    expect(positionForKey('ArrowLeft', false, 57.4)).toBe(56);
  });

  it("ignores keys that aren't the slider's", () => {
    expect(positionForKey('Enter', false, 50)).toBeNull();
    expect(positionForKey('a', false, 50)).toBeNull();
  });

  it("reads out the position with the after layer's label", () => {
    expect(positionText(60, 'Final')).toBe('60% Final');
    expect(positionText(33.4)).toBe('33%');
  });

  it('clips the after layer to the part before the divider', () => {
    expect(afterClipPath(60, 'horizontal')).toBe('inset(0 40% 0 0)');
    expect(afterClipPath(60, 'vertical')).toBe('inset(40% 0 0 0)');
  });

  it('moves the divider with a transform', () => {
    expect(dividerTransform(60, 'horizontal')).toBe('translateX(60%)');
    expect(dividerTransform(60, 'vertical')).toBe('translateY(40%)');
  });
});
