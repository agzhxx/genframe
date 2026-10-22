import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  promptComposerKeyboard,
  promptComposerMentionKeyboard,
  promptComposerReferenceKeyboard,
} from '@/content/keyboard/prompt-composer';
import type { ReducedMotionSetting } from '@/registry/hooks/use-reduced-motion';
import {
  PromptComposer,
  type PresetGroup,
  type PromptComposerProps,
  type PromptReference,
} from '@/registry/ui/prompt-composer/prompt-composer';
import { expectAriaState, expectRole } from './helpers/aria';
import { press, testKeyboardMap } from './helpers/keyboard';
import { mockSystemReducedMotion, renderWithReducedMotion } from './helpers/reduced-motion';

const car: PromptReference = { id: 'car', name: 'car', src: 'car.webp', alt: 'A small red car' };
const alley: PromptReference = { id: 'alley', name: 'alley', src: 'alley.webp' };
const lighthouse: PromptReference = { id: 'lighthouse', name: 'lighthouse', src: 'lighthouse.webp' };

const presets: PresetGroup[] = [
  {
    label: 'Camera',
    presets: [
      { id: 'dolly-in', label: 'Dolly in' },
      { id: 'orbit', label: 'Orbit' },
    ],
  },
  { label: 'Style', presets: [{ id: 'film', label: 'Film still' }] },
];

function image(name: string) {
  return new File(['pixels'], name, { type: 'image/png' });
}

function find(container: ParentNode, selector: string) {
  const element = container.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Nothing matches ${selector}`);
  return element;
}

function renderComposer(props: Partial<PromptComposerProps> = {}, reducedMotion: ReducedMotionSetting = 'never') {
  const view = renderWithReducedMotion(<PromptComposer {...props} />, reducedMotion);
  return {
    ...view,
    root: find(view.container, '[data-slot="prompt-composer"]'),
    surface: find(view.container, '[data-slot="prompt-composer-box"]'),
    box: screen.getByRole<HTMLTextAreaElement>('textbox'),
    submitButton: screen.getByRole<HTMLButtonElement>('button', { name: props.submitLabel ?? 'Generate' }),
  };
}

function mentionList() {
  return screen.queryByRole('listbox', { name: 'References' });
}

function activeOption(box: HTMLElement) {
  const id = box.getAttribute('aria-activedescendant');
  return id ? document.getElementById(id) : null;
}

function slot(name: string) {
  return screen.getByRole('listitem', {
    name: (_, element) => [`@${name}`, `@${name}, mentioned`].includes(element.textContent),
  });
}

function fileInput(container: HTMLElement) {
  return find(container, 'input[type="file"]') as HTMLInputElement;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('PromptComposer', () => {
  describe('the prompt box', () => {
    it('is a text box named "Prompt", or by aria-label or aria-labelledby', () => {
      const first = renderComposer({ placeholder: 'Describe the shot' });
      expectRole(first.box, 'textbox', 'Prompt');
      expect(first.box.placeholder).toBe('Describe the shot');
      first.unmount();

      const second = renderComposer({ 'aria-label': 'Shot description' });
      expectRole(second.box, 'textbox', 'Shot description');
      second.unmount();

      render(<h2 id="title">Your prompt</h2>);
      expectRole(renderComposer({ 'aria-labelledby': 'title' }).box, 'textbox', 'Your prompt');
    });

    it('keeps its own text, and reports it', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      const { box } = renderComposer({ defaultValue: 'A red car', onValueChange });
      await user.type(box, ' at dusk');
      expect(box.value).toBe('A red car at dusk');
      expect(onValueChange).toHaveBeenLastCalledWith('A red car at dusk');
    });

    it('shows the text it is given when controlled, and reports edits without making them', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      const { box, rerender } = renderComposer({ value: 'A red car', onValueChange });
      await user.type(box, '!');
      expect(onValueChange).toHaveBeenCalledWith('A red car!');
      expect(box.value).toBe('A red car');
      rerender(<PromptComposer value="A blue car" onValueChange={onValueChange} />);
      expect(box.value).toBe('A blue car');
    });

    it('grows with its text: CSS field-sizing, or from JavaScript where that’s missing', async () => {
      const user = userEvent.setup();
      const { box, unmount } = renderComposer();
      expect(box.className).toContain('field-sizing-content');
      expect(box.style.height).toBe('');
      unmount();

      vi.spyOn(CSS, 'supports').mockReturnValue(false);
      vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockImplementation(function (
        this: HTMLTextAreaElement,
      ) {
        return 24 * this.value.split('\n').length;
      });
      const grown = renderComposer({ defaultValue: 'One line' });
      expect(grown.box.style.height).toBe('24px');
      await user.type(grown.box, '{Enter}two{Enter}three');
      expect(grown.box.style.height).toBe('72px');
    });
  });

  describe('keyboard', () => {
    describe('in the prompt box', () => {
      const onSubmit = vi.fn();
      testKeyboardMap(promptComposerKeyboard, {
        setup: () => {
          onSubmit.mockClear();
          const { box } = renderComposer({ defaultValue: 'A red car ', defaultReferences: [car, alley], onSubmit });
          box.setSelectionRange(10, 10);
          return { target: box };
        },
        expectations: {
          submit: ({ target }) => {
            expect(onSubmit).toHaveBeenCalledWith({ text: 'A red car ', references: [car, alley], presets: [] });
            expect(target.value).toBe('A red car ');
          },
          newLine: ({ target }) => {
            expect(onSubmit).not.toHaveBeenCalled();
            expect(target.value).toBe('A red car \n');
          },
          mention: ({ target }) => {
            const list = mentionList();
            expect(list).not.toBeNull();
            if (list) expect(within(list).getAllByRole('option').map((option) => option.textContent)).toEqual(['@car', '@alley']);
            expect(activeOption(target)?.textContent).toBe('@car');
          },
        },
      });
    });

    describe('in the list of references', () => {
      testKeyboardMap(promptComposerMentionKeyboard, {
        setup: async () => {
          const user = userEvent.setup();
          const { box } = renderComposer({ defaultValue: 'Look at ', defaultReferences: [car, alley, lighthouse] });
          await user.type(box, '@');
          return { target: box };
        },
        expectations: {
          next: ({ target }) => {
            expect(activeOption(target)?.textContent).toBe('@alley');
          },
          previous: ({ target }) => {
            expect(activeOption(target)?.textContent).toBe('@lighthouse');
          },
          insert: ({ target }) => {
            expect(target.value).toBe('Look at @car ');
            expect(mentionList()).toBeNull();
            expect(document.activeElement).toBe(target);
          },
          close: ({ target }) => {
            expect(mentionList()).toBeNull();
            expect(target.value).toBe('Look at @');
            expect(target.hasAttribute('aria-activedescendant')).toBe(false);
          },
        },
      });
    });

    describe('on a reference', () => {
      testKeyboardMap(promptComposerReferenceKeyboard, {
        setup: () => {
          renderComposer({ defaultReferences: [car, alley, lighthouse] });
          return { target: screen.getByRole('button', { name: 'Remove @alley' }) };
        },
        expectations: {
          remove: () => {
            expect(screen.queryByRole('button', { name: 'Remove @alley' })).toBeNull();
            expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Remove @lighthouse' }));
          },
        },
      });
    });
  });

  describe('@-mentions', () => {
    it('points the prompt box at the list the way a combobox does, without its role', async () => {
      const user = userEvent.setup();
      const { box } = renderComposer({ defaultReferences: [car, alley] });
      expectAriaState(box, { autocomplete: 'list', haspopup: 'listbox', activedescendant: null });
      const listId = box.getAttribute('aria-controls') ?? '';
      expect(document.getElementById(listId)?.hidden).toBe(true);

      await user.type(box, 'A @');
      const list = mentionList();
      expect(list?.id).toBe(listId);
      const active = activeOption(box);
      if (!active) throw new Error('no active option');
      expectRole(active, 'option', '@car');
      expectAriaState(active, { selected: true });
      expect(screen.getAllByRole('status')[0]?.textContent).toBe(
        '2 references match: up and down arrows to choose, Enter to insert',
      );
    });

    it('has no list, and says nothing about one, without references', async () => {
      const user = userEvent.setup();
      const { box } = renderComposer();
      expectAriaState(box, { autocomplete: null, haspopup: null, controls: null });
      await user.type(box, 'A @');
      expect(mentionList()).toBeNull();
    });

    it('filters the list as the name is typed, and closes it when nothing matches', async () => {
      const user = userEvent.setup();
      const { box } = renderComposer({ defaultReferences: [car, alley, lighthouse] });
      await user.type(box, '@l');
      expect(within(mentionList() ?? document.body).getAllByRole('option').map((option) => option.textContent)).toEqual([
        '@lighthouse',
        '@alley',
      ]);
      await user.type(box, 'zz');
      expect(mentionList()).toBeNull();
      expect(screen.getAllByRole('status')[0]?.textContent).toBe('');
    });

    it('opens again after Esc when typing goes on in the mention', async () => {
      const user = userEvent.setup();
      const { box } = renderComposer({ defaultReferences: [car, alley] });
      await user.type(box, '@{Escape}');
      expect(mentionList()).toBeNull();
      await user.type(box, 'a');
      expect(mentionList()).not.toBeNull();
    });

    it('inserts with a click, keeping focus in the prompt box', async () => {
      const user = userEvent.setup();
      const { box } = renderComposer({ defaultValue: 'Use ', defaultReferences: [car, alley] });
      await user.type(box, '@');
      await user.click(screen.getByRole('option', { name: '@alley' }));
      expect(box.value).toBe('Use @alley ');
      expect(document.activeElement).toBe(box);
      expect(box.selectionStart).toBe(11);
    });

    it('replaces a mention in the middle of the text, and leaves the list closed', async () => {
      const user = userEvent.setup();
      const { box } = renderComposer({ defaultValue: 'A @c, at dusk', defaultReferences: [car, alley] });
      box.focus();
      box.setSelectionRange(4, 4);
      // React reports a moved caret on the next key or pointer event.
      fireEvent.keyUp(box, { key: 'ArrowLeft' });
      expect(mentionList()).not.toBeNull();
      await user.keyboard('{Enter}');
      expect(box.value).toBe('A @car, at dusk');
      expect(box.selectionStart).toBe(6);
      expect(mentionList()).toBeNull();
    });

    it('highlights the mentioned references, and follows edits', async () => {
      const user = userEvent.setup();
      const { box } = renderComposer({ defaultValue: 'The @car', defaultReferences: [car, alley] });
      expect(slot('car').dataset.mentioned).toBe('');
      expect(slot('car').textContent).toBe('@car, mentioned');
      expect(slot('alley').dataset.mentioned).toBeUndefined();

      await user.type(box, 's');
      expect(slot('car').dataset.mentioned).toBeUndefined();
      await user.type(box, '{Backspace} and @ALLEY');
      expect(slot('car').dataset.mentioned).toBe('');
      expect(slot('alley').dataset.mentioned).toBe('');
    });

    it('leaves Enter and arrow keys to an input method while it composes', () => {
      const onSubmit = vi.fn();
      const { box } = renderComposer({ defaultValue: 'A @', defaultReferences: [car, alley], onSubmit });
      box.setSelectionRange(3, 3);
      act(() => {
        box.focus();
      });
      expect(mentionList()).not.toBeNull();

      fireEvent.keyDown(box, { key: 'Enter', isComposing: true });
      fireEvent.keyDown(box, { key: 'ArrowDown', isComposing: true });
      expect(box.value).toBe('A @');
      expect(activeOption(box)?.textContent).toBe('@car');
      fireEvent.keyDown(box, { key: 'Enter', metaKey: true, isComposing: true });
      // Safari: the composition has ended, but the keydown still says keyCode 229.
      fireEvent.keyDown(box, { key: 'Enter', metaKey: true, keyCode: 229 });
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe('submitting', () => {
    it('submits the text, every reference and the presets that are on', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      const { submitButton } = renderComposer({
        defaultValue: '@car on a mountain road',
        defaultReferences: [car, alley],
        presets,
        defaultSelectedPresets: ['film', 'dolly-in'],
        onSubmit,
      });
      await user.click(submitButton);
      expect(onSubmit).toHaveBeenCalledWith({
        text: '@car on a mountain road',
        references: [car, alley],
        presets: ['dolly-in', 'film'],
      });
    });

    it('keeps its text after a submission', async () => {
      const user = userEvent.setup();
      const { box } = renderComposer({ defaultValue: 'A red car', onSubmit: vi.fn() });
      await user.type(box, '{Control>}{Enter}{/Control}');
      expect(box.value).toBe('A red car');
    });

    it('submits on Enter with submitOnEnter, where Shift+Enter adds a line', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      const { box, submitButton } = renderComposer({ defaultValue: 'A red car', submitOnEnter: true, onSubmit });
      expect(submitButton.getAttribute('aria-keyshortcuts')).toBe('Enter');
      await user.type(box, '{Shift>}{Enter}{/Shift}');
      expect(box.value).toBe('A red car\n');
      expect(onSubmit).not.toHaveBeenCalled();
      await press(user, 'Enter');
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(box.value).toBe('A red car\n');
      await press(user, 'Meta+Enter');
      expect(onSubmit).toHaveBeenCalledTimes(2);
    });

    it('says its shortcut on the submit button', () => {
      const { submitButton } = renderComposer();
      expect(submitButton.getAttribute('aria-keyshortcuts')).toBe('Control+Enter Meta+Enter');
    });

    it('can’t submit an empty prompt, spaces included', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      const { box, submitButton } = renderComposer({ onSubmit });
      expect(submitButton.disabled).toBe(true);
      await user.type(box, '   {Meta>}{Enter}{/Meta}');
      expect(onSubmit).not.toHaveBeenCalled();
      expect(submitButton.disabled).toBe(true);
    });

    it('is busy while loading: it can’t submit again, and its button turns a spinner', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      const { root, box, submitButton } = renderComposer({ defaultValue: 'A red car', loading: true, onSubmit });
      expectAriaState(root, { busy: true });
      expect(submitButton.disabled).toBe(true);
      expect(submitButton.querySelector('svg')?.getAttribute('class')).toContain('animate-spin');
      await user.type(box, '{Meta>}{Enter}{/Meta}');
      expect(onSubmit).not.toHaveBeenCalled();
      // The prompt stays editable, for the next one.
      expect(box.disabled).toBe(false);
    });

    it('disables everything inside when disabled, the toolbar included', () => {
      const { root, box, submitButton } = renderComposer({
        defaultValue: 'A red car',
        defaultReferences: [car],
        presets,
        disabled: true,
        toolbar: <button type="button">Model</button>,
      });
      expect(root).toHaveProperty('disabled', true);
      expect(box.matches(':disabled')).toBe(true);
      expect(submitButton.matches(':disabled')).toBe(true);
      expect(screen.getByRole('button', { name: 'Model' }).matches(':disabled')).toBe(true);
      expect(screen.getByRole('checkbox', { name: 'Orbit' }).matches(':disabled')).toBe(true);
      expect(screen.getByRole('button', { name: 'Remove @car' }).matches(':disabled')).toBe(true);
      expect(screen.queryByRole('button', { name: 'Add reference images' })).toBeNull();
    });
  });

  describe('reference images', () => {
    it('lists them with their names, and an add button', () => {
      renderComposer({ defaultReferences: [car, alley] });
      const list = screen.getByRole('list', { name: 'References' });
      expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['@car', '@alley', '']);
      expect(within(list).getByRole('img', { name: 'A small red car' }).getAttribute('src')).toBe('car.webp');
      expect(screen.getByRole('button', { name: 'Add reference images' })).toBeDefined();
    });

    it('adds picked images, named after their files, and shows them through object URLs', async () => {
      const user = userEvent.setup();
      const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockImplementation((file) => `blob:${(file as File).name}`);
      const onReferencesChange = vi.fn();
      const { container } = renderComposer({ defaultReferences: [car], onReferencesChange });
      await user.click(screen.getByRole('button', { name: 'Add reference images' }));
      await user.upload(fileInput(container), [image('Red Car.png'), image('car.webp')]);

      const references = onReferencesChange.mock.lastCall?.[0] as PromptReference[];
      expect(references.map((reference) => reference.name)).toEqual(['car', 'red-car', 'car-2']);
      expect(references[1]?.file?.name).toBe('Red Car.png');
      expect(createObjectURL).toHaveBeenCalledTimes(2);
      expect(slot('red-car').querySelector('img')?.getAttribute('src')).toBe('blob:Red Car.png');
      expect(screen.getAllByRole('status')[1]?.textContent).toBe('Added @red-car, @car-2');
    });

    it('revokes an object URL when its reference is removed', async () => {
      const user = userEvent.setup();
      const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL');
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:one');
      const { container } = renderComposer();
      await user.upload(fileInput(container), image('one.png'));
      expect(revokeObjectURL).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'Remove @one' }));
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:one');
      expect(screen.getAllByRole('status')[1]?.textContent).toBe('Removed @one');
    });

    it('skips files that aren’t images, and those past maxReferences', async () => {
      const user = userEvent.setup({ applyAccept: false });
      const { container } = renderComposer({ defaultReferences: [car], maxReferences: 2 });
      await user.upload(fileInput(container), [
        new File(['%PDF'], 'brief.pdf', { type: 'application/pdf' }),
        image('a.png'),
        image('b.png'),
      ]);
      expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['@car', '@a']);
      expect(screen.getAllByRole('status')[1]?.textContent).toBe(
        'Added @a. No room for 1 more image. Skipped 1 file: not an image',
      );
      // Full: no add button.
      expect(screen.queryByRole('button', { name: 'Add reference images' })).toBeNull();
    });

    it('adds pasted images, and leaves pasted text alone', () => {
      const { box } = renderComposer();
      expect(fireEvent.paste(box, { clipboardData: { files: [image('pasted.png')] } })).toBe(false);
      expect(slot('pasted')).toBeDefined();
      expect(fireEvent.paste(box, { clipboardData: { files: [] } })).toBe(true);
    });

    it('adds dropped images, saying where to drop them while they’re dragged over', () => {
      const { surface, container } = renderComposer({ defaultReferences: [car], maxReferences: 2 });
      fireEvent.dragOver(surface, { dataTransfer: { types: ['Files'], files: [] } });
      expect(find(container, '[data-slot="prompt-composer-drop"]').textContent).toBe(
        'Drop images to add them as references',
      );
      fireEvent.drop(surface, { dataTransfer: { types: ['Files'], files: [image('dropped.png')] } });
      expect(container.querySelector('[data-slot="prompt-composer-drop"]')).toBeNull();
      expect(slot('dropped')).toBeDefined();

      fireEvent.dragOver(surface, { dataTransfer: { types: ['Files'], files: [] } });
      expect(find(container, '[data-slot="prompt-composer-drop"]').textContent).toBe('No room for more references');
      fireEvent.dragLeave(surface, { relatedTarget: document.body });
      expect(container.querySelector('[data-slot="prompt-composer-drop"]')).toBeNull();
    });

    it('lets text be dragged in as usual', () => {
      const { surface, container } = renderComposer();
      expect(fireEvent.dragOver(surface, { dataTransfer: { types: ['text/plain'], files: [] } })).toBe(true);
      expect(container.querySelector('[data-slot="prompt-composer-drop"]')).toBeNull();
    });

    it('moves focus to the previous reference, then the add button, as the last ones go', async () => {
      const user = userEvent.setup();
      renderComposer({ defaultReferences: [car, alley], maxReferences: 2 });
      expect(screen.queryByRole('button', { name: 'Add reference images' })).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Remove @alley' }));
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Remove @car' }));
      await user.keyboard('{Delete}');
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add reference images' }));
    });

    it('reports changes without making them when controlled', async () => {
      const user = userEvent.setup();
      const onReferencesChange = vi.fn();
      const { rerender } = renderComposer({ references: [car, alley], onReferencesChange });
      await user.click(screen.getByRole('button', { name: 'Remove @car' }));
      expect(onReferencesChange).toHaveBeenCalledWith([alley]);
      expect(screen.getByRole('button', { name: 'Remove @car' })).toBeDefined();
      rerender(<PromptComposer references={[alley]} onReferencesChange={onReferencesChange} />);
      expect(screen.queryByRole('button', { name: 'Remove @car' })).toBeNull();
    });

    it('leaves them out with maxReferences={0}', () => {
      const { box } = renderComposer({ maxReferences: 0 });
      expect(screen.queryByRole('list', { name: 'References' })).toBeNull();
      expect(fireEvent.paste(box, { clipboardData: { files: [image('pasted.png')] } })).toBe(true);
    });
  });

  describe('presets', () => {
    it('are checkboxes in groups named by their labels', () => {
      renderComposer({ presets });
      const camera = screen.getByRole('group', { name: 'Camera' });
      expect(within(camera).getAllByRole('checkbox').map((checkbox) => checkbox.closest('label')?.textContent)).toEqual([
        'Dolly in',
        'Orbit',
      ]);
      expectRole(screen.getByRole('checkbox', { name: 'Film still' }), 'checkbox', 'Film still');
    });

    it('turn on and off, reported in the order of the groups', async () => {
      const user = userEvent.setup();
      const onSelectedPresetsChange = vi.fn();
      renderComposer({ presets, onSelectedPresetsChange });
      await user.click(screen.getByRole('checkbox', { name: 'Film still' }));
      await user.click(screen.getByRole('checkbox', { name: 'Orbit' }));
      expect(onSelectedPresetsChange).toHaveBeenLastCalledWith(['orbit', 'film']);
      expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Orbit' }).checked).toBe(true);
      await user.keyboard(' ');
      expect(onSelectedPresetsChange).toHaveBeenLastCalledWith(['film']);
    });

    it('show what they’re given when controlled', async () => {
      const user = userEvent.setup();
      const onSelectedPresetsChange = vi.fn();
      renderComposer({ presets, selectedPresets: ['orbit'], onSelectedPresetsChange });
      await user.click(screen.getByRole('checkbox', { name: 'Dolly in' }));
      expect(onSelectedPresetsChange).toHaveBeenCalledWith(['dolly-in', 'orbit']);
      expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Dolly in' }).checked).toBe(false);
    });
  });

  describe('character count', () => {
    it('counts against maxLength, and describes the prompt box with it', () => {
      const { box, container } = renderComposer({ defaultValue: 'A red car', maxLength: 20 });
      const count = find(container, '[data-slot="prompt-composer-count"]');
      expect(count.textContent).toBe('9/209 of 20 characters');
      expect(box.getAttribute('aria-describedby')).toBe(count.id);
      expect(box.hasAttribute('aria-invalid')).toBe(false);
    });

    it('marks a prompt past the limit, which can’t be submitted', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      const { box, submitButton, container } = renderComposer({ defaultValue: 'A red car', maxLength: 10, onSubmit });
      await user.type(box, ' at dusk');
      expectAriaState(box, { invalid: true });
      expect(find(container, '[data-slot="prompt-composer-count"]').className).toContain('text-destructive');
      expect(submitButton.disabled).toBe(true);
      await user.keyboard('{Meta>}{Enter}{/Meta}');
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('says how many are left near the limit, once typing pauses', async () => {
      // Testing Library waits on a real setTimeout(0) after each event, so the fake clock also
      // runs on its own.
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
      const { box } = renderComposer({ maxLength: 20 });
      const status = () => screen.getAllByRole('status')[1]?.textContent;
      await user.type(box, 'A red car on a');
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(status()).toBe('');

      await user.type(box, ' road');
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(status()).toBe('');
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(status()).toBe('1 character left');

      await user.type(box, ' up!');
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(status()).toBe('3 characters too many');
    });
  });

  describe('slots', () => {
    it('puts the toolbar and the cost hint in the footer; the cost describes the submit button', () => {
      const { container, submitButton } = renderComposer({
        toolbar: <button type="button">Model: Kling 2.5</button>,
        costHint: '5 s × $0.042 ≈ $0.21',
      });
      const footer = find(container, '[data-slot="prompt-composer-footer"]');
      expect(within(footer).getByRole('button', { name: 'Model: Kling 2.5' })).toBeDefined();
      const cost = find(footer, '[data-slot="prompt-composer-cost"]');
      expect(cost.textContent).toBe('5 s × $0.042 ≈ $0.21');
      expect(submitButton.getAttribute('aria-describedby')).toBe(cost.id);
    });
  });

  describe('motion', () => {
    it('opens the list with a drop and a fade, and reduces it to a fade', async () => {
      const user = userEvent.setup();
      const { root, box } = renderComposer({ defaultReferences: [car] }, 'never');
      expect(root.dataset.motion).toBeUndefined();
      await user.type(box, '@');
      const classes = mentionList()?.getAttribute('class') ?? '';
      expect(classes).toContain('starting:-translate-y-1');
      expect(classes).toContain('in-data-[motion=reduce]:transition-opacity');
    });

    it('says reduce on its root with reduced motion', () => {
      const { root } = renderComposer({}, 'always');
      expect(root.dataset.motion).toBe('reduce');
    });

    it('grows new references into place, but not the first ones', async () => {
      const user = userEvent.setup();
      const { container } = renderComposer({ defaultReferences: [car] });
      expect(slot('car').className).not.toContain('starting:scale-90');
      await user.upload(fileInput(container), image('new.png'));
      expect(slot('new').className).toContain('starting:scale-90');
      expect(slot('new').className).toContain('in-data-[motion=reduce]:transition-opacity');
    });

    it('rings a mention with a fade, at once with reduced motion; the spinner stops', () => {
      const { container } = renderComposer({ defaultValue: '@car', defaultReferences: [car], loading: true }, 'always');
      const ring = find(slot('car'), 'span[aria-hidden="true"]');
      expect(ring.className).toContain('group-data-mentioned/slot:opacity-100');
      expect(ring.className).toContain('in-data-[motion=reduce]:transition-none');
      expect(find(container, '[data-slot="prompt-composer-submit"] svg').getAttribute('class')).toContain(
        'in-data-[motion=reduce]:animate-none',
      );
    });

    it("follows the system setting when the app doesn't set one", () => {
      const system = mockSystemReducedMotion(true);
      const { container } = render(<PromptComposer />);
      const root = find(container, '[data-slot="prompt-composer"]');
      expect(root.dataset.motion).toBe('reduce');
      system.set(false);
      expect(root.dataset.motion).toBeUndefined();
    });
  });
});
