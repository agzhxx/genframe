import type { KeyboardMap } from '@/lib/keyboard';

// CompareSlider's keys, in both orientations: its docs page shows this table and
// tests/compare-slider.test.tsx runs every row. The position is how much of the after layer shows.
export const compareSliderKeyboard = {
  more: { keys: ['ArrowRight', 'ArrowUp'], action: 'Shows 1% more of the after layer' },
  muchMore: {
    keys: ['Shift+ArrowRight', 'Shift+ArrowUp', 'PageUp'],
    action: 'Shows 10% more of the after layer',
  },
  less: { keys: ['ArrowLeft', 'ArrowDown'], action: 'Shows 1% less of the after layer' },
  muchLess: {
    keys: ['Shift+ArrowLeft', 'Shift+ArrowDown', 'PageDown'],
    action: 'Shows 10% less of the after layer',
  },
  start: { keys: ['Home'], action: 'Shows only the before layer (0%)' },
  end: { keys: ['End'], action: 'Shows only the after layer (100%)' },
} satisfies KeyboardMap;
