import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { KeyboardTable } from '@/components/docs/keyboard-table';
import { Playground } from '@/components/docs/playground';
import { useReducedMotion } from '@/registry/hooks/use-reduced-motion';
import { stepperKeyboard } from './fixtures/stepper';
import { mockSystemReducedMotion } from './helpers/reduced-motion';

function MotionProbe() {
  return <output>{useReducedMotion() ? 'reduced' : 'full'}</output>;
}

function renderPlayground() {
  render(
    <Playground title="Probe demo" controls={<p>Controls</p>}>
      <MotionProbe />
    </Playground>,
  );
  const playground = screen.getByRole('region', { name: 'Probe demo' });
  return {
    playground,
    probe: within(playground).getByRole('status'),
    slowMotion: within(playground).getByRole('switch', { name: 'Slow motion (0.25×)' }),
    reducedMotion: within(playground).getByRole('switch', { name: 'Reduced motion' }),
  };
}

describe('Playground', () => {
  it('slows the preview down by setting data-slow-motion on it', async () => {
    mockSystemReducedMotion(false);
    const user = userEvent.setup();
    const { probe, slowMotion } = renderPlayground();
    const preview = probe.parentElement;
    expect(preview?.hasAttribute('data-slow-motion')).toBe(false);

    await user.click(slowMotion);
    expect(slowMotion.getAttribute('aria-checked')).toBe('true');
    expect(preview?.hasAttribute('data-slow-motion')).toBe(true);
  });

  it('starts at the system setting and overrides it both ways', async () => {
    mockSystemReducedMotion(true);
    const user = userEvent.setup();
    const { probe, reducedMotion } = renderPlayground();
    expect(reducedMotion.getAttribute('aria-checked')).toBe('true');
    expect(probe.textContent).toBe('reduced');

    await user.click(reducedMotion);
    expect(reducedMotion.getAttribute('aria-checked')).toBe('false');
    expect(probe.textContent).toBe('full');

    await user.click(reducedMotion);
    expect(probe.textContent).toBe('reduced');
  });

  it('shows the controls next to the preview', () => {
    mockSystemReducedMotion(false);
    const { playground } = renderPlayground();
    expect(within(playground).getByText('Controls')).toBeDefined();
  });
});

describe('KeyboardTable', () => {
  it('lists every row of a keyboard map, with symbols named for screen readers', () => {
    render(<KeyboardTable keyboard={stepperKeyboard} />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      '↑Up arrowAdds 1',
      'Shift + ↑Up arrow or Page UpAdds 10',
      '↓Down arrowTakes 1 away',
      'HomeGoes back to 0',
    ]);
  });
});
