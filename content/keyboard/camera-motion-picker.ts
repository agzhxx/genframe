import type { KeyboardMap } from '@/lib/keyboard';

// CameraMotionPicker's keys: its tiles are native radio buttons and its play buttons native
// buttons, so the browser's own. Its docs page shows these tables and
// tests/camera-motion-picker.test.tsx runs every row.

/** On the tiles. */
export const cameraMotionPickerKeyboard = {
  next: { keys: ['ArrowRight', 'ArrowDown'], action: 'Picks the next move; from the last, the first' },
  previous: { keys: ['ArrowLeft', 'ArrowUp'], action: 'Picks the previous move; from the first, the last' },
  forward: {
    keys: ['Tab'],
    action: 'Goes to the picked move’s play button when the tiles have them (with reduced motion), or out of the group',
  },
  back: { keys: ['Shift+Tab'], action: 'Leaves the group (Tab into it lands on the picked move)' },
} satisfies KeyboardMap;

/** On a tile’s play button. */
export const cameraMotionPickerPlayKeyboard = {
  play: { keys: ['Enter', 'Space'], action: 'Plays the move’s clip, or pauses it' },
} satisfies KeyboardMap;
