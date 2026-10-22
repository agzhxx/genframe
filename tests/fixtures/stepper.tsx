// A small spin button that tests the shared helpers (tests/helpers.test.tsx) and the docs'
// keyboard table: it has a keyboard map, ARIA states, a live region and a reduced-motion mode,
// like the real components will.
import { useState } from 'react';
import type { KeyboardMap } from '@/lib/keyboard';
import { useReducedMotion } from '@/registry/hooks/use-reduced-motion';

export const stepperKeyboard = {
  increment: { keys: ['ArrowUp'], action: 'Adds 1' },
  bigIncrement: { keys: ['Shift+ArrowUp', 'PageUp'], action: 'Adds 10' },
  decrement: { keys: ['ArrowDown'], action: 'Takes 1 away' },
  reset: { keys: ['Home'], action: 'Goes back to 0' },
} satisfies KeyboardMap;

export function Stepper() {
  const [value, setValue] = useState(5);
  const [announcement, setAnnouncement] = useState('');
  const reduced = useReducedMotion();

  function change(next: number) {
    setValue(next);
    setAnnouncement(`Count ${String(next)}`);
  }

  return (
    <div data-motion={reduced ? 'reduce' : undefined}>
      <div
        role="spinbutton"
        tabIndex={0}
        aria-label="Count"
        aria-valuenow={value}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp') change(value + (event.shiftKey ? 10 : 1));
          else if (event.key === 'PageUp') change(value + 10);
          else if (event.key === 'ArrowDown') change(value - 1);
          else if (event.key === 'Home') change(0);
          else return;
          event.preventDefault();
        }}
      >
        {value}
      </div>
      <p role="status">{announcement}</p>
    </div>
  );
}
