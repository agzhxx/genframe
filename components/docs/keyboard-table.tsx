import { Fragment } from 'react';
import { parseCombo, type KeyboardMap } from '@/lib/keyboard';

// How keys are shown; `name` is what screen readers get when the text is a symbol. Keys not
// listed show their KeyboardEvent.key name ("Home", "Enter", "Tab", "Shift").
const keyLabels: Partial<Record<string, { text: string; name?: string }>> = {
  ArrowLeft: { text: '←', name: 'Left arrow' },
  ArrowRight: { text: '→', name: 'Right arrow' },
  ArrowUp: { text: '↑', name: 'Up arrow' },
  ArrowDown: { text: '↓', name: 'Down arrow' },
  PageUp: { text: 'Page Up' },
  PageDown: { text: 'Page Down' },
  Escape: { text: 'Esc', name: 'Escape' },
  Control: { text: 'Ctrl', name: 'Control' },
  Meta: { text: '⌘', name: 'Command' },
  ',': { text: ',', name: 'Comma' },
  '.': { text: '.', name: 'Period' },
};

function Key({ name }: { name: string }) {
  const label = keyLabels[name];
  if (!label?.name) return <kbd>{label?.text ?? name}</kbd>;
  return (
    <kbd>
      <span aria-hidden="true">{label.text}</span>
      <span className="sr-only">{label.name}</span>
    </kbd>
  );
}

function Combo({ combo }: { combo: string }) {
  const { modifiers, key } = parseCombo(combo);
  return (
    <span className="whitespace-nowrap">
      {[...modifiers, key].map((name, index) => (
        <Fragment key={name}>
          {index > 0 ? ' + ' : null}
          <Key name={name} />
        </Fragment>
      ))}
    </span>
  );
}

/**
 * A component's keyboard map as a table. The map is the same file its tests run
 * (content/keyboard/<item>.ts), so what's published is what's tested. An empty map says so.
 */
export function KeyboardTable({ keyboard }: { keyboard: KeyboardMap }) {
  if (Object.keys(keyboard).length === 0) return <p>It handles no keys of its own.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th scope="col">Keys</th>
          <th scope="col">What they do</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(keyboard).map(([id, { keys, action }]) => (
          <tr key={id}>
            <td>
              {keys.map((combo, index) => (
                <Fragment key={combo}>
                  {index > 0 ? <span className="text-muted-foreground"> or </span> : null}
                  <Combo combo={combo} />
                </Fragment>
              ))}
            </td>
            <td>{action}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
