import type { KeyboardMap } from '@/lib/keyboard';

// ModelPicker's keys: its docs page shows these tables and tests/model-picker.test.tsx runs every
// row. The list's keys are cmdk's, in a search box that keeps focus while the active model moves.

/** On the button. */
export const modelPickerKeyboard = {
  open: {
    keys: ['Enter', 'Space', 'ArrowDown', 'ArrowUp'],
    action: 'Opens the list on the current model, with the search box focused',
  },
} satisfies KeyboardMap;

/** In the open list, where typing filters the models. */
export const modelPickerListKeyboard = {
  next: { keys: ['ArrowDown'], action: 'Moves to the next model; from the last, to the first' },
  previous: { keys: ['ArrowUp'], action: 'Moves to the previous model; from the first, to the last' },
  first: { keys: ['Home'], action: 'Moves to the first model' },
  last: { keys: ['End'], action: 'Moves to the last model' },
  nextGroup: { keys: ['Alt+ArrowDown'], action: 'Moves to the first model of the next group' },
  previousGroup: { keys: ['Alt+ArrowUp'], action: 'Moves to the first model of the previous group' },
  choose: { keys: ['Enter'], action: 'Chooses the active model and closes the list' },
  close: { keys: ['Escape'], action: 'Closes the list without choosing; focus goes back to the button' },
} satisfies KeyboardMap;
