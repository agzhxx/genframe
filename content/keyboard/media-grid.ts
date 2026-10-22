import type { KeyboardMap } from '@/lib/keyboard';

// MediaGrid's keys: its cards are links, in the order they were placed, so Tab moves through them.
// Its docs page shows this table and tests/media-grid.test.tsx runs every row.
export const mediaGridKeyboard = {
  next: {
    keys: ['Tab'],
    action: 'Moves to the next card, or to a card’s play button; the browser scrolls it into view, and the grid renders the cards around it',
  },
  previous: { keys: ['Shift+Tab'], action: 'Moves to the card before' },
  open: { keys: ['Enter'], action: 'Opens the focused card' },
} satisfies KeyboardMap;
