import type { KeyboardMap } from '@/lib/keyboard';

// GenerationCard's keys: its actions are native buttons, so the browser's own. Its docs page shows
// this table and tests/generation-card.test.tsx runs every row.
export const generationCardKeyboard = {
  press: { keys: ['Enter', 'Space'], action: 'Presses the focused button: Cancel, Open, Retry or Remove' },
  next: { keys: ['Tab'], action: 'Moves to the card’s next button, then on to what follows the card' },
} satisfies KeyboardMap;
