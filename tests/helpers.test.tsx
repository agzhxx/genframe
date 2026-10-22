import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { modifierKeys } from '@/lib/keyboard';
import { Stepper, stepperKeyboard } from './fixtures/stepper';
import { expectAriaState, expectRole, liveRegionText, recordAnnouncements } from './helpers/aria';
import { press, testKeyboardMap, toUserEventKeys } from './helpers/keyboard';
import { mockSystemReducedMotion, renderWithReducedMotion } from './helpers/reduced-motion';

describe('keyboard helpers', () => {
  it('turn a key combination into user-event keys', () => {
    expect(toUserEventKeys('ArrowRight')).toBe('{ArrowRight}');
    expect(toUserEventKeys('Shift+ArrowRight')).toBe('{Shift>}{ArrowRight}{/Shift}');
    expect(toUserEventKeys('Control+Shift+Space')).toBe('{Control>}{Shift>}[Space]{/Shift}{/Control}');
    expect(() => toUserEventKeys('ArrowRight+Shift')).toThrow('modifiers first');
  });

  it('press combinations in order, holding their modifiers', async () => {
    const user = userEvent.setup();
    const pressed: string[] = [];
    render(
      <input
        aria-label="Keys"
        onKeyDown={(event) => {
          if (!modifierKeys.includes(event.key)) pressed.push(`${event.shiftKey ? 'Shift+' : ''}${event.key}`);
        }}
      />,
    );
    await user.click(screen.getByRole('textbox'));
    await press(user, 'Shift+ArrowLeft', 'Home', 'Space');
    expect(pressed).toEqual(['Shift+ArrowLeft', 'Home', ' ']);
  });

  describe('testKeyboardMap runs every row of a map', () => {
    testKeyboardMap(stepperKeyboard, {
      setup: () => {
        renderWithReducedMotion(<Stepper />, 'never');
        return { target: screen.getByRole('spinbutton') };
      },
      expectations: {
        increment: ({ target }) => {
          expectAriaState(target, { valuenow: 6 });
        },
        bigIncrement: ({ target }) => {
          expectAriaState(target, { valuenow: 15 });
        },
        decrement: ({ target }) => {
          expectAriaState(target, { valuenow: 4 });
        },
        reset: ({ target }) => {
          expectAriaState(target, { valuenow: 0 });
        },
      },
    });
  });
});

describe('ARIA helpers', () => {
  it('check a role, implicit or explicit, and the accessible name', () => {
    render(<button type="button">Save</button>);
    const button = screen.getByText('Save');
    expectRole(button, 'button', 'Save');
    expect(() => {
      expectRole(button, 'link');
    }).toThrow();
    expect(() => {
      expectRole(button, 'button', 'Cancel');
    }).toThrow();
  });

  it('check ARIA states, including absent ones', () => {
    render(
      <button type="button" aria-pressed="true">
        Bold
      </button>,
    );
    const button = screen.getByRole('button');
    expectAriaState(button, { pressed: true, expanded: null });
    expect(() => {
      expectAriaState(button, { pressed: false });
    }).toThrow();
  });

  it('record what live regions announce, in order', async () => {
    const user = userEvent.setup();
    renderWithReducedMotion(<Stepper />, 'never');
    const announcements = recordAnnouncements();
    act(() => {
      screen.getByRole('spinbutton').focus();
    });

    await press(user, 'ArrowUp', 'PageUp');
    announcements.stop();
    expect(announcements.messages).toEqual(['Count 6', 'Count 16']);
    expect(liveRegionText()).toEqual(['Count 16']);
  });
});

describe('reduced-motion helpers', () => {
  it('render under a provider, with no matchMedia needed', () => {
    renderWithReducedMotion(<Stepper />, 'always');
    expect(screen.getByRole('spinbutton').parentElement?.dataset.motion).toBe('reduce');
  });

  it('set the system setting for one test, and change it live', () => {
    const system = mockSystemReducedMotion(false);
    render(<Stepper />);
    const root = screen.getByRole('spinbutton').parentElement;
    expect(root?.dataset.motion).toBeUndefined();

    system.set(true);
    expect(root?.dataset.motion).toBe('reduce');
  });

  it('put matchMedia back when that test ends', () => {
    // jsdom has none of its own.
    expect(typeof window.matchMedia).toBe('undefined');
  });
});
