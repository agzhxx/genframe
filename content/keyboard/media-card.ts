import type { KeyboardMap } from '@/lib/keyboard';

// MediaCard's keys: its link or button and its play button are native, so the browser's own. Its
// docs page shows these tables and tests/media-card.test.tsx runs every row.

/** On a card with a link. */
export const mediaCardKeyboard = {
  open: { keys: ['Enter'], action: 'Opens the card: calls onOpen, or follows its link without it' },
  next: { keys: ['Tab'], action: 'Moves to the card’s play button when it has one, then on to what follows' },
} satisfies KeyboardMap;

/** On a card without a link, which is a button. */
export const mediaCardButtonKeyboard = {
  open: { keys: ['Enter', 'Space'], action: 'Calls onOpen' },
} satisfies KeyboardMap;

/** On a video’s play button, when its preview can’t start by itself. */
export const mediaCardPlayKeyboard = {
  play: { keys: ['Enter', 'Space'], action: 'Plays the preview, or pauses it' },
} satisfies KeyboardMap;
