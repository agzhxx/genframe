import type { KeyboardMap } from '@/lib/keyboard';

// GenerationQueue's keys: the cards' buttons are native, so the browser's own. Its docs page shows
// this table and tests/generation-queue-ui.test.tsx runs every row.
export const generationQueueKeyboard = {
  press: {
    keys: ['Enter', 'Space'],
    action: 'Presses the focused button; once a card is removed, focus moves to the next one',
  },
  next: { keys: ['Tab'], action: 'Moves through the cards’ buttons, card by card, in the list’s order' },
} satisfies KeyboardMap;
