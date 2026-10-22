// Keyboard maps: one file per component in content/keyboard/, imported both by its docs page
// (the keyboard table) and by its tests (tests/helpers/keyboard.ts runs every row), so the
// published map is the tested one.

/**
 * One row of a keyboard map: the key combinations that do one thing. Each combination is key
 * names joined by "+", modifiers first: "Shift+ArrowRight". Names are `KeyboardEvent.key` values
 * ("ArrowRight", "PageUp", "Home", "Enter", "Escape", "Tab", ","), plus "Space" for the space
 * bar; a name can't contain "+".
 */
export interface KeyBinding {
  keys: readonly string[];
  /** What the keys do, as the docs say it. */
  action: string;
}

/** A component's keyboard map. The ids are what its tests key their expectations by. */
export type KeyboardMap = Readonly<Record<string, KeyBinding>>;

export const modifierKeys: readonly string[] = ['Control', 'Alt', 'Shift', 'Meta'];

/** "Shift+ArrowRight" → { modifiers: ["Shift"], key: "ArrowRight" } */
export function parseCombo(combo: string) {
  const names = combo.split('+');
  const key = names.pop();
  if (!key || names.some((name) => !modifierKeys.includes(name))) {
    throw new Error(`Key combination "${combo}": write modifiers first, then one key, joined by "+"`);
  }
  return { modifiers: names, key };
}
