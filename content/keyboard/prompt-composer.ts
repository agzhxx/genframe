import type { KeyboardMap } from '@/lib/keyboard';

// PromptComposer's keys: its docs page shows these tables and tests/prompt-composer.test.tsx runs
// every row.

/** In the prompt box. */
export const promptComposerKeyboard = {
  submit: { keys: ['Meta+Enter', 'Control+Enter'], action: 'Submits the prompt' },
  newLine: { keys: ['Enter'], action: 'Adds a line' },
  mention: { keys: ['@'], action: 'Opens the list of references to mention, when there are any' },
} satisfies KeyboardMap;

/** While the list of references is open; focus stays in the prompt box. */
export const promptComposerMentionKeyboard = {
  next: { keys: ['ArrowDown'], action: 'Moves to the next reference; from the last, to the first' },
  previous: { keys: ['ArrowUp'], action: 'Moves to the previous reference; from the first, to the last' },
  insert: { keys: ['Enter', 'Tab'], action: 'Puts the reference in place of the typed @name' },
  close: { keys: ['Escape'], action: 'Closes the list; typing on in the mention opens it again' },
} satisfies KeyboardMap;

/** On a reference's remove button. */
export const promptComposerReferenceKeyboard = {
  remove: {
    keys: ['Enter', 'Space', 'Delete', 'Backspace'],
    action: 'Removes the reference; focus moves to the next one, the previous one or the add button',
  },
} satisfies KeyboardMap;
