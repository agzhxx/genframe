import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CSSProperties } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { modelPickerKeyboard, modelPickerListKeyboard } from '@/content/keyboard/model-picker';
import type { ReducedMotionSetting } from '@/registry/hooks/use-reduced-motion';
import { ModelPicker, type ModelOption, type ModelPickerProps } from '@/registry/ui/model-picker/model-picker';
import { expectAriaState, expectRole } from './helpers/aria';
import { testKeyboardMap } from './helpers/keyboard';
import { renderWithReducedMotion } from './helpers/reduced-motion';

const models: ModelOption[] = [
  { id: 'soul', name: 'Soul 2', kind: 'image', price: { amount: 0.0057, unit: 'image' }, resolutions: ['1080p'] },
  {
    id: 'grok',
    name: 'Grok Imagine 2.0',
    kind: 'image',
    price: { amount: 0.08, unit: 'image', perReference: 0.01 },
    resolutions: ['2k'],
  },
  {
    id: 'kling',
    name: 'Kling 2.5',
    kind: 'video',
    price: { amount: 0.042, unit: 'second' },
    resolutions: ['720p'],
    durations: [5, 10],
    speed: 'Fast',
    keywords: ['kuaishou'],
  },
  {
    id: 'kling-pro',
    name: 'Kling 2.5 Pro',
    kind: 'video',
    price: { amount: 0.07, unit: 'second' },
    resolutions: ['1080p'],
    durations: [5, 10],
  },
  { id: 'cinema', name: 'Cinema Studio 4.0', kind: 'video', price: { amount: 0.2057, unit: 'second' }, resolutions: ['480p'] },
  { id: 'cinema-fast', name: 'Cinema Studio Fast', kind: 'video', price: { amount: 0.1, unit: 'second' } },
];

const byKind = (model: ModelOption) => (model.kind === 'image' ? 'Image' : 'Video');
const families: Record<string, string> = { soul: 'Image', grok: 'Image', kling: 'Kling', 'kling-pro': 'Kling' };
const byFamily = (model: ModelOption) => families[model.id] ?? 'Cinema Studio';

function renderPicker(props: Partial<ModelPickerProps> = {}, reducedMotion: ReducedMotionSetting = 'never') {
  const view = renderWithReducedMotion(<ModelPicker models={models} {...props} />, reducedMotion);
  return { ...view, trigger: screen.getByRole('button', { name: /^Model: / }) };
}

async function openPicker(props: Partial<ModelPickerProps> = {}) {
  const user = userEvent.setup();
  const view = renderPicker(props);
  await user.click(view.trigger);
  const search = screen.getByRole('combobox', { name: 'Search models' });
  return { ...view, user, search, dialog: screen.getByRole('dialog', { name: 'Models' }) };
}

/** The option the search box points to with aria-activedescendant. */
function activeOption() {
  const id = screen.getByRole('combobox').getAttribute('aria-activedescendant');
  return id ? document.getElementById(id) : null;
}

/** The option for a model: its name starts with the model's, followed by its first badge. */
function option(model: string) {
  return screen.getByRole('option', {
    name: (name) => name.startsWith(`${model} Image`) || name.startsWith(`${model} Video`),
  });
}

/** An option's accessible name: the model, badges and price, and "(current)" when chosen. */
function nameOf(element: HTMLElement | null) {
  return (element?.getAttribute('aria-labelledby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent.trim())
    .join(' ');
}

describe('ModelPicker', () => {
  it('is a button named "Model" and the chosen model, which opens a dialog', () => {
    const { trigger } = renderPicker({ defaultValue: 'kling' });
    expectRole(trigger, 'button', 'Model: Kling 2.5');
    expectAriaState(trigger, { haspopup: 'dialog', expanded: false });
  });

  it('chooses the first model when it is given none', () => {
    expectRole(renderPicker().trigger, 'button', 'Model: Soul 2');
  });

  it('takes its name from aria-labelledby, with the chosen model', () => {
    render(<span id="label">Generator</span>);
    renderWithReducedMotion(<ModelPicker models={models} aria-labelledby="label" />, 'never');
    expect(screen.getByRole('button', { name: 'Generator Soul 2' })).toBeDefined();
  });

  describe('the combobox pattern (WAI-ARIA APG), as cmdk renders it', () => {
    it('focuses a combobox named "Search models" that controls the listbox', async () => {
      const { search, trigger } = await openPicker({ defaultValue: 'kling' });
      expect(document.activeElement).toBe(search);
      expectAriaState(trigger, { expanded: true });
      expectAriaState(search, { autocomplete: 'list', expanded: true });
      const listbox = document.getElementById(search.getAttribute('aria-controls') ?? '');
      expect(listbox).not.toBeNull();
      if (listbox) expectRole(listbox, 'listbox', 'Models');
    });

    it('points aria-activedescendant at the selected option, starting on the current model', async () => {
      await openPicker({ defaultValue: 'kling' });
      const active = option('Kling 2.5');
      expect(activeOption()).toBe(active);
      expectAriaState(active, { selected: true });
      expect(screen.getAllByRole('option').filter((item) => item.getAttribute('aria-selected') === 'true')).toEqual([
        active,
      ]);
    });

    it('names every option by what it shows: the model, its badges and price, and whether it is current', async () => {
      await openPicker({ defaultValue: 'grok', settings: { duration: 5 } });
      expect(screen.getAllByRole('option')).toHaveLength(models.length);
      expectRole(option('Kling 2.5'), 'option', 'Kling 2.5 Video 720p 5 s 10 s Fast ≈ $0.21 5 s × $0.042');
      expectRole(option('Grok Imagine 2.0'), 'option', 'Grok Imagine 2.0 Image 2k ≈ $0.08 1 image × $0.08 (current)');
      expect(nameOf(option('Grok Imagine 2.0'))).toBe('Grok Imagine 2.0 Image 2k ≈ $0.08 1 image × $0.08 (current)');
    });

    it('names the groups after their headings', async () => {
      await openPicker({ groupBy: byKind });
      const image = screen.getByRole('group', { name: 'Image' });
      const video = screen.getByRole('group', { name: 'Video' });
      expect(within(image).getAllByRole('option')).toHaveLength(2);
      expect(within(video).getAllByRole('option')).toHaveLength(4);
    });
  });

  describe('search', () => {
    it('filters by name, badges and keywords, and moves to the first match', async () => {
      const { user, search } = await openPicker({ defaultValue: 'cinema' });
      await user.type(search, 'kling');
      expect(screen.getAllByRole('option')).toEqual([option('Kling 2.5'), option('Kling 2.5 Pro')]);
      expect(activeOption()).toBe(option('Kling 2.5'));

      await user.clear(search);
      await user.type(search, '1080p');
      expect(screen.getAllByRole('option')).toEqual([option('Soul 2'), option('Kling 2.5 Pro')]);

      await user.clear(search);
      await user.type(search, 'video 1080');
      expect(screen.getAllByRole('option')).toEqual([option('Kling 2.5 Pro')]);

      await user.clear(search);
      await user.type(search, 'KUAISHOU');
      expect(screen.getAllByRole('option')).toEqual([option('Kling 2.5')]);
    });

    it('says when nothing matches, and the list is then collapsed', async () => {
      const { user, search } = await openPicker();
      await user.type(search, 'sora');
      expect(screen.queryAllByRole('option')).toEqual([]);
      // A listbox without options is invalid ARIA: the empty list is hidden, the message beside it.
      expect(screen.queryByRole('listbox')).toBeNull();
      expect(screen.getByText('No models match “sora”')).toBeDefined();
      expect(screen.getByRole('status').textContent).toBe('No models match sora');
      expectAriaState(search, { expanded: false, activedescendant: null });

      await user.clear(search);
      expect(screen.getByRole('listbox', { name: 'Models' })).toBeDefined();
      expectAriaState(search, { expanded: true });
      expect(screen.getByRole('status').textContent).toBe('');
    });

    it('starts again from an empty search when it opens again', async () => {
      const { user, search, trigger } = await openPicker();
      await user.type(search, 'kling');
      await user.keyboard('{Escape}');
      await user.click(trigger);
      expect(screen.getByRole<HTMLInputElement>('combobox').value).toBe('');
      expect(screen.getAllByRole('option')).toHaveLength(models.length);
    });
  });

  describe('keyboard', () => {
    describe('on the button', () => {
      testKeyboardMap(modelPickerKeyboard, {
        setup: () => ({ target: renderPicker({ defaultValue: 'kling' }).trigger }),
        expectations: {
          open: () => {
            const search = screen.getByRole('combobox', { name: 'Search models' });
            expect(document.activeElement).toBe(search);
            expect(activeOption()).toBe(option('Kling 2.5'));
          },
        },
      });
    });

    describe('in the list', () => {
      const onValueChange = vi.fn();
      testKeyboardMap(modelPickerListKeyboard, {
        // Three groups: Image (Soul 2, Grok), Kling (Kling 2.5, Kling 2.5 Pro) and Cinema Studio
        // (4.0, Fast), from Kling 2.5 Pro.
        setup: async () => {
          onValueChange.mockClear();
          const { search, trigger } = await openPicker({ defaultValue: 'kling-pro', groupBy: byFamily, onValueChange });
          return { target: search, trigger };
        },
        expectations: {
          next: () => {
            expect(activeOption()).toBe(option('Cinema Studio 4.0'));
          },
          previous: () => {
            expect(activeOption()).toBe(option('Kling 2.5'));
          },
          first: () => {
            expect(activeOption()).toBe(option('Soul 2'));
          },
          last: () => {
            expect(activeOption()).toBe(option('Cinema Studio Fast'));
          },
          nextGroup: () => {
            expect(activeOption()).toBe(option('Cinema Studio 4.0'));
          },
          previousGroup: () => {
            expect(activeOption()).toBe(option('Soul 2'));
          },
          choose: ({ trigger }) => {
            expect(onValueChange).toHaveBeenCalledWith('kling-pro');
            expect(screen.queryByRole('dialog')).toBeNull();
            expect(document.activeElement).toBe(trigger);
          },
          close: ({ trigger }) => {
            expect(onValueChange).not.toHaveBeenCalled();
            expect(screen.queryByRole('dialog')).toBeNull();
            expect(document.activeElement).toBe(trigger);
            expectAriaState(trigger, { expanded: false });
          },
        },
      });
    });

    it('wraps around at the ends', async () => {
      const { user } = await openPicker({ defaultValue: 'cinema-fast' });
      await user.keyboard('{ArrowDown}');
      expect(activeOption()).toBe(option('Soul 2'));
      await user.keyboard('{ArrowUp}');
      expect(activeOption()).toBe(option('Cinema Studio Fast'));
    });

    it('chooses a match with Enter after typing', async () => {
      const onValueChange = vi.fn();
      const { user, search, trigger } = await openPicker({ onValueChange });
      await user.type(search, 'pro{Enter}');
      expect(onValueChange).toHaveBeenCalledWith('kling-pro');
      expectRole(trigger, 'button', 'Model: Kling 2.5 Pro');
    });
  });

  it('chooses with a click', async () => {
    const onValueChange = vi.fn();
    const { user, trigger } = await openPicker({ onValueChange });
    await user.click(option('Grok Imagine 2.0'));
    expect(onValueChange).toHaveBeenCalledWith('grok');
    expect(screen.queryByRole('dialog')).toBeNull();
    expectRole(trigger, 'button', 'Model: Grok Imagine 2.0');
  });

  it('shows the value it is given when controlled, and reports choices without making them', async () => {
    const onValueChange = vi.fn();
    const { user, trigger, rerender } = await openPicker({ value: 'soul', onValueChange });
    await user.click(option('Kling 2.5'));
    expect(onValueChange).toHaveBeenCalledWith('kling');
    expectRole(trigger, 'button', 'Model: Soul 2');

    rerender(<ModelPicker models={models} value="kling" onValueChange={onValueChange} />);
    expectRole(screen.getByRole('button', { name: /^Model: / }), 'button', 'Model: Kling 2.5');
  });

  it('says "Choose a model" when the value is no model', () => {
    renderPicker({ value: 'gone' });
    expect(screen.getByRole('button', { name: 'Model: Choose a model' })).toBeDefined();
  });

  describe('prices', () => {
    function priceOf(name: string) {
      const id = option(name).getAttribute('aria-labelledby')?.split(' ')[2] ?? '';
      return document.getElementById(id)?.textContent;
    }

    it('estimates every model for the settings, written like the spec', async () => {
      await openPicker({ settings: { duration: 5, count: 3, references: 2 } });
      expect(priceOf('Kling 2.5')).toBe('≈ $0.63 15 s × $0.042');
      expect(priceOf('Soul 2')).toBe('≈ $0.02 3 images × $0.0057');
      expect(priceOf('Grok Imagine 2.0')).toBe('≈ $0.30 3 images × $0.08 + 6 refs × $0.01');
    });

    it("takes a video model's first clip length when the settings have no duration", async () => {
      await openPicker();
      expect(priceOf('Kling 2.5')).toBe('≈ $0.21 5 s × $0.042');
      // No clip lengths and no duration: the price per second.
      expect(priceOf('Cinema Studio 4.0')).toBe('$0.2057 / s');
    });

    it('updates the estimates when the settings change', async () => {
      const { rerender } = await openPicker({ settings: { duration: 5 } });
      expect(priceOf('Kling 2.5 Pro')).toBe('≈ $0.35 5 s × $0.07');
      rerender(<ModelPicker models={models} settings={{ duration: 10 }} />);
      expect(priceOf('Kling 2.5 Pro')).toBe('≈ $0.70 10 s × $0.07');
    });

    it('writes prices in the locale it is given', async () => {
      await openPicker({ locale: 'de-DE', settings: { duration: 5 } });
      expect(priceOf('Kling 2.5')).toBe('≈ 0,21 $ 5 s × 0,042 $');
    });
  });

  it('can be disabled', () => {
    const { trigger } = renderPicker({ disabled: true });
    expect(trigger).toHaveProperty('disabled', true);
  });

  describe('motion', () => {
    it("opens with shadcn's fade and zoom, timed by the motion tokens", async () => {
      await openPicker();
      const content = screen.getByRole('dialog');
      expect(content.dataset.motion).toBeUndefined();
      expect(content.className).toContain('duration-(--genframe-duration-fast)');
      expect(content.className).not.toContain('duration-100');
    });

    it('opens at once with reduced motion', async () => {
      const user = userEvent.setup();
      const { trigger } = renderPicker({}, 'always');
      await user.click(trigger);
      const content = screen.getByRole('dialog');
      expect(content.dataset.motion).toBe('reduce');
      expect(content.className).toContain('data-[motion=reduce]:animate-none!');
    });

    it("takes the button's motion tokens into the popover, which renders elsewhere", async () => {
      const user = userEvent.setup();
      renderWithReducedMotion(
        <div style={{ '--genframe-duration-fast': '480ms' } as CSSProperties}>
          <ModelPicker models={models} />
        </div>,
        'never',
      );
      await user.click(screen.getByRole('button', { name: /^Model: / }));
      expect(screen.getByRole('dialog').style.getPropertyValue('--genframe-duration-fast')).toBe('480ms');
    });
  });
});
