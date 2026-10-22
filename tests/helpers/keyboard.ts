import { act } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { parseCombo, type KeyboardMap } from '@/lib/keyboard';

/**
 * user-event's syntax for one key combination: "Shift+ArrowRight" becomes
 * "{Shift>}{ArrowRight}{/Shift}", which holds the modifiers down, presses the key and lets go.
 */
export function toUserEventKeys(combo: string) {
  const { modifiers, key } = parseCombo(combo);
  const down = modifiers.map((modifier) => `{${modifier}>}`).join('');
  const up = modifiers.toReversed().map((modifier) => `{/${modifier}}`).join('');
  return `${down}${key === 'Space' ? '[Space]' : `{${key}}`}${up}`;
}

/** Presses key combinations one after another: press(user, "Shift+Tab", "ArrowDown", "Enter"). */
export async function press(user: UserEvent, ...combos: string[]) {
  for (const combo of combos) await user.keyboard(toUserEventKeys(combo));
}

type Expectation<Context> = (context: Context) => void | Promise<void>;

/**
 * Runs a component's keyboard map as tests. For every combination in every row: a fresh
 * `setup` (which renders and returns the element the keys go to as `target`), focus on the
 * target, the keys, then that row's expectation. Expectations are keyed by the map's ids, so
 * every row the docs publish is tested, and nothing is tested that the docs don't publish.
 * Call it inside a `describe`.
 */
export function testKeyboardMap<Map extends KeyboardMap, Context extends { target: HTMLElement }>(
  map: Map,
  options: {
    setup: () => Context | Promise<Context>;
    expectations: { [Id in keyof Map]: Expectation<Context> };
  },
) {
  const expectations: Partial<Record<string, Expectation<Context>>> = options.expectations;

  it('has an expectation for each row of the keyboard map, and no others', () => {
    expect(Object.keys(expectations).sort()).toEqual(Object.keys(map).sort());
  });

  for (const [id, { keys, action }] of Object.entries(map)) {
    for (const combo of keys) {
      it(`${combo}: ${action}`, async () => {
        const user = userEvent.setup();
        const context = await options.setup();
        act(() => {
          context.target.focus();
        });
        await press(user, combo);
        await expectations[id]?.(context);
      });
    }
  }
}
