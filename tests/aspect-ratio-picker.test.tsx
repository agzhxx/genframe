import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { aspectRatioPickerKeyboard } from '@/content/keyboard/aspect-ratio-picker';
import { AspectRatioPicker, type AspectRatioPickerProps } from '@/registry/ui/aspect-ratio-picker/aspect-ratio-picker';
import { expectRole } from './helpers/aria';
import { testKeyboardMap } from './helpers/keyboard';
import { mockSystemReducedMotion, renderWithReducedMotion } from './helpers/reduced-motion';

const reason = 'This model only makes 16:9';

function renderPicker(props: AspectRatioPickerProps = {}) {
  const view = renderWithReducedMotion(<AspectRatioPicker {...props} />, 'never');
  const preview = view.container.querySelector('[data-slot="aspect-ratio-picker-preview"] rect');
  return { ...view, group: screen.getByRole('radiogroup'), preview };
}

function radio(name: string) {
  return screen.getByRole<HTMLInputElement>('radio', { name: new RegExp(`^${name},`) });
}

describe('AspectRatioPicker', () => {
  it('is a radio group named "Aspect ratio", with a radio per ratio that says its shape', () => {
    const { group } = renderPicker();
    expectRole(group, 'radiogroup', 'Aspect ratio');
    expect(within(group).getAllByRole('radio').map((input) => input.getAttribute('value'))).toEqual([
      '1:1',
      '3:4',
      '4:3',
      '2:3',
      '3:2',
      '9:16',
      '16:9',
      '21:9',
    ]);
    expectRole(radio('16:9'), 'radio', '16:9, landscape');
    expectRole(radio('9:16'), 'radio', '9:16, portrait');
    expectRole(radio('1:1'), 'radio', '1:1, square');
  });

  it('takes its name from aria-label or aria-labelledby', () => {
    const { unmount } = renderPicker({ 'aria-label': 'Frame' });
    expectRole(screen.getByRole('radiogroup'), 'radiogroup', 'Frame');
    unmount();

    render(<h2 id="ratio-title">Output ratio</h2>);
    renderPicker({ 'aria-labelledby': 'ratio-title' });
    expectRole(screen.getByRole('radiogroup'), 'radiogroup', 'Output ratio');
  });

  it('picks the first ratio that can be picked when it is given none', () => {
    renderPicker({ disabled: { '1:1': reason } });
    expect(radio('3:4').checked).toBe(true);
  });

  it('takes custom ratios', () => {
    const { group } = renderPicker({ ratios: ['1.85:1', '2.39:1'] });
    expect(within(group).getAllByRole('radio')).toHaveLength(2);
    expect(radio('1.85:1').checked).toBe(true);
  });

  describe('keyboard', () => {
    testKeyboardMap(aspectRatioPickerKeyboard, {
      setup: () => {
        render(<button type="button">Before</button>);
        renderPicker({ defaultValue: '3:2', disabled: { '9:16': reason } });
        render(<button type="button">After</button>);
        return { target: radio('3:2') };
      },
      expectations: {
        // From 3:2, past the disabled 9:16.
        next: () => {
          expect(radio('16:9').checked).toBe(true);
          expect(document.activeElement).toBe(radio('16:9'));
        },
        previous: () => {
          expect(radio('2:3').checked).toBe(true);
          expect(document.activeElement).toBe(radio('2:3'));
        },
        leave: () => {
          expect(document.activeElement?.getAttribute('type')).not.toBe('radio');
          expect(radio('3:2').checked).toBe(true);
        },
      },
    });

    it('wraps around at the ends', async () => {
      const user = userEvent.setup();
      renderPicker({ defaultValue: '21:9' });
      await user.click(radio('21:9'));
      await user.keyboard('{ArrowRight}');
      expect(radio('1:1').checked).toBe(true);
      await user.keyboard('{ArrowLeft}');
      expect(radio('21:9').checked).toBe(true);
    });

    it('lands on the picked ratio when tabbing in', async () => {
      const user = userEvent.setup();
      render(<button type="button">Before</button>);
      renderPicker({ defaultValue: '16:9' });
      await user.tab();
      await user.tab();
      expect(document.activeElement).toBe(radio('16:9'));
    });
  });

  it('picks with a click, and reports it', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderPicker({ onValueChange });
    await user.click(screen.getByText('16:9'));
    expect(radio('16:9').checked).toBe(true);
    expect(onValueChange).toHaveBeenCalledWith('16:9');
  });

  it('shows the value it is given when controlled, and reports picks without making them', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { rerender } = renderPicker({ value: '4:3', onValueChange });
    await user.click(radio('16:9'));
    expect(onValueChange).toHaveBeenCalledWith('16:9');
    expect(radio('4:3').checked).toBe(true);

    rerender(<AspectRatioPicker value="16:9" onValueChange={onValueChange} />);
    expect(radio('16:9').checked).toBe(true);
  });

  describe('disabled ratios', () => {
    it("can't be picked, by click or keyboard", async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      const { group } = renderPicker({ defaultValue: '16:9', disabled: { '21:9': reason }, onValueChange });
      expect(radio('21:9').disabled).toBe(true);
      await user.click(within(group).getByText('21:9'));
      expect(radio('16:9').checked).toBe(true);
      expect(onValueChange).not.toHaveBeenCalled();

      // From 16:9, the next ratio that can be picked is the first.
      await user.click(radio('16:9'));
      await user.keyboard('{ArrowRight}');
      expect(radio('1:1').checked).toBe(true);
    });

    it('carry their reason as the radio’s description', () => {
      renderPicker({ disabled: { '21:9': reason } });
      const description = radio('21:9').getAttribute('aria-describedby') ?? '';
      expect(document.getElementById(description)?.textContent).toBe(reason);
      expect(radio('16:9').hasAttribute('aria-describedby')).toBe(false);
    });

    it('are listed with their reasons in the group’s description', () => {
      const { group } = renderPicker({ disabled: { '4:3': 'No 4:3 here', '21:9': reason } });
      const description = document.getElementById(group.getAttribute('aria-describedby') ?? '');
      expect(description?.textContent).toBe(`4:3 can’t be picked: No 4:3 here21:9 can’t be picked: ${reason}`);
    });

    it('leave the group without a description when there are none', () => {
      const { group } = renderPicker();
      expect(group.hasAttribute('aria-describedby')).toBe(false);
    });
  });

  it('shapes the preview frame like the picked ratio, with a transform', async () => {
    const user = userEvent.setup();
    const { preview } = renderPicker({ defaultValue: '1:1' });
    expect(preview?.getAttribute('style')).toBe('transform: scale(1, 1);');
    await user.click(radio('16:9'));
    expect(preview?.getAttribute('style')).toBe('transform: scale(1, 0.5625);');
    expect(preview?.getAttribute('vector-effect')).toBe('non-scaling-stroke');
  });

  it('sends the picked ratio with a form', async () => {
    const user = userEvent.setup();
    const { container } = renderWithReducedMotion(
      <form aria-label="Generate">
        <AspectRatioPicker name="ratio" defaultValue="3:4" />
      </form>,
      'never',
    );
    const form = container.querySelector('form');
    if (!form) throw new Error('no form');
    expect(new FormData(form).get('ratio')).toBe('3:4');
    await user.click(radio('9:16'));
    expect(new FormData(form).get('ratio')).toBe('9:16');
  });

  describe('compact', () => {
    it('leaves out the preview frame and lays every ratio out in one row', () => {
      const { container } = renderWithReducedMotion(<AspectRatioPicker compact defaultValue="16:9" />, 'never');
      expect(container.querySelector('[data-slot="aspect-ratio-picker-preview"]')).toBeNull();
      const group = screen.getByRole('radiogroup', { name: 'Aspect ratio' });
      expect(within(group).getAllByRole('radio')).toHaveLength(8);
      expect(group.className).toBe('flex gap-0.5');
      expect(radio('16:9').checked).toBe(true);
    });

    it('picks by keyboard and by click as before', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      renderPicker({ compact: true, defaultValue: '16:9', onValueChange });
      await user.click(radio('16:9'));
      await user.keyboard('{ArrowLeft}');
      expect(radio('9:16').checked).toBe(true);
      await user.click(screen.getByText('1:1'));
      expect(onValueChange).toHaveBeenLastCalledWith('1:1');
    });
  });

  describe('reduced motion', () => {
    it('animates the preview with full motion', () => {
      const { container } = renderWithReducedMotion(<AspectRatioPicker />, 'never');
      const root = container.querySelector<HTMLElement>('[data-slot="aspect-ratio-picker"]');
      expect(root?.dataset.motion).toBeUndefined();
    });

    it('changes the preview at once with reduced motion', () => {
      const { container } = renderWithReducedMotion(<AspectRatioPicker />, 'always');
      const root = container.querySelector<HTMLElement>('[data-slot="aspect-ratio-picker"]');
      expect(root?.dataset.motion).toBe('reduce');
      expect(container.querySelector('[data-slot="aspect-ratio-picker-preview"] rect')?.getAttribute('class')).toContain(
        'in-data-[motion=reduce]:transition-none',
      );
    });

    it("follows the system setting when the app doesn't set one", () => {
      const system = mockSystemReducedMotion(true);
      const { container } = render(<AspectRatioPicker />);
      const root = container.querySelector<HTMLElement>('[data-slot="aspect-ratio-picker"]');
      expect(root?.dataset.motion).toBe('reduce');
      system.set(false);
      expect(root?.dataset.motion).toBeUndefined();
    });
  });
});
