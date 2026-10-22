import type { KeyboardMap } from '@/lib/keyboard';

// AspectRatioPicker's keys, which are the browser's own for a group of radio buttons: its docs
// page shows this table and tests/aspect-ratio-picker.test.tsx runs every row.
export const aspectRatioPickerKeyboard = {
  next: {
    keys: ['ArrowRight', 'ArrowDown'],
    action: 'Picks the next ratio, skipping disabled ones; from the last, the first',
  },
  previous: {
    keys: ['ArrowLeft', 'ArrowUp'],
    action: 'Picks the previous ratio, skipping disabled ones; from the first, the last',
  },
  leave: { keys: ['Tab', 'Shift+Tab'], action: 'Leaves the group (Tab into it lands on the picked ratio)' },
} satisfies KeyboardMap;
