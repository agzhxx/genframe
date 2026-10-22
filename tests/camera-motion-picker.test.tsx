import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cameraMotionPickerKeyboard, cameraMotionPickerPlayKeyboard } from '@/content/keyboard/camera-motion-picker';
import type { ReducedMotionSetting } from '@/registry/hooks/use-reduced-motion';
import { VideoPoolProvider } from '@/registry/hooks/use-video-pool';
import {
  CameraMotionPicker,
  type CameraMotionOption,
  type CameraMotionPickerProps,
} from '@/registry/ui/camera-motion-picker/camera-motion-picker';
import { expectAriaState, expectRole } from './helpers/aria';
import { testKeyboardMap } from './helpers/keyboard';
import { installMediaStubs, isPlaying, media, paintFrame, removeMediaStubs } from './helpers/media';
import { mockSystemReducedMotion, renderWithReducedMotion } from './helpers/reduced-motion';

const moves = [
  ['dolly-in', 'Dolly in', 'The camera moves toward the subject.'],
  ['dolly-out', 'Dolly out', 'The camera moves away from the subject.'],
  ['orbit', 'Orbit', 'The camera circles the subject.'],
  ['crane-up', 'Crane up', 'The camera rises over the scene.'],
  ['crash-zoom', 'Crash zoom', 'A sudden, fast zoom in.'],
  ['whip-pan', 'Whip pan', 'The camera swings sideways in a blur.'],
  ['dolly-zoom', 'Dolly zoom', 'The camera moves one way while the lens zooms the other.'],
  ['bullet-time', 'Bullet time', 'Time almost stops while the camera sweeps around.'],
] as const;

const options: CameraMotionOption[] = moves.map(([id, label, description]) => ({
  id,
  label,
  description,
  previewSrc: `https://media.example.com/${id}.mp4`,
  poster: `https://media.example.com/${id}.webp`,
}));

interface Options {
  reducedMotion?: ReducedMotionSetting;
  /** The size of the VideoPoolProvider around the picker, or none. */
  pool?: number | null;
  /** Buttons before and after the picker, to Tab from and to. */
  around?: boolean;
}

function renderPicker(
  props: Partial<CameraMotionPickerProps> = {},
  { reducedMotion = 'never', pool = 2, around = false }: Options = {},
) {
  const wrap = (ui: ReactElement) => (
    <>
      {around ? <button type="button">Before</button> : null}
      {pool === null ? ui : <VideoPoolProvider size={pool}>{ui}</VideoPoolProvider>}
      {around ? <button type="button">After</button> : null}
    </>
  );
  const picker = (next: Partial<CameraMotionPickerProps>) => <CameraMotionPicker options={options} {...next} />;
  const view = renderWithReducedMotion(wrap(picker(props)), reducedMotion);
  return {
    ...view,
    group: screen.getByRole('radiogroup'),
    rerenderPicker: (next: Partial<CameraMotionPickerProps>) => {
      view.rerender(wrap(picker(next)));
    },
  };
}

function radio(label: string) {
  return screen.getByRole<HTMLInputElement>('radio', { name: label });
}

function tile(label: string) {
  const element = radio(label).closest<HTMLElement>('[data-slot="camera-motion-picker-option"]');
  if (!element) throw new Error(`No tile for ${label}`);
  return element;
}

function video(label: string) {
  return tile(label).querySelector('video');
}

/** Rests the mouse on a tile past the 100 ms intent (fake timers). */
function hover(label: string) {
  fireEvent.pointerEnter(tile(label), { pointerType: 'mouse' });
  act(() => {
    vi.advanceTimersByTime(100);
  });
}

function leave(label: string) {
  fireEvent.pointerLeave(tile(label), { pointerType: 'mouse' });
}

beforeEach(installMediaStubs);

afterEach(() => {
  // Unmounted first: the tiles give their videos back, with the stubs still there.
  cleanup();
  removeMediaStubs();
  vi.useRealTimers();
});

describe('CameraMotionPicker', () => {
  it('is a radio group named "Camera motion", a radio per move, named by its label and described', () => {
    const { group } = renderPicker();
    expectRole(group, 'radiogroup', 'Camera motion');
    expect(within(group).getAllByRole('radio').map((input) => input.getAttribute('value'))).toEqual(
      moves.map(([id]) => id),
    );
    const dollyIn = radio('Dolly in');
    expectRole(dollyIn, 'radio', 'Dolly in');
    expect(document.getElementById(dollyIn.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'The camera moves toward the subject.',
    );
  });

  it('takes its name from aria-label or aria-labelledby', () => {
    const { unmount } = renderPicker({ 'aria-label': 'Move' });
    expectRole(screen.getByRole('radiogroup'), 'radiogroup', 'Move');
    unmount();

    render(<h2 id="move-title">Camera</h2>);
    renderPicker({ 'aria-labelledby': 'move-title' });
    expectRole(screen.getByRole('radiogroup'), 'radiogroup', 'Camera');
  });

  it('shows each move’s poster, name and description', () => {
    renderPicker();
    const orbit = tile('Orbit');
    expect(orbit.querySelector('img')?.getAttribute('src')).toBe('https://media.example.com/orbit.webp');
    expect(orbit.querySelector('img')?.getAttribute('alt')).toBe('');
    expect(orbit.textContent).toContain('Orbit');
    expect(orbit.textContent).toContain('The camera circles the subject.');
  });

  it('has no move picked until one is, or the one it starts with', () => {
    const { unmount } = renderPicker();
    expect(screen.getAllByRole<HTMLInputElement>('radio').some((input) => input.checked)).toBe(false);
    unmount();
    renderPicker({ defaultValue: 'whip-pan' });
    expect(radio('Whip pan').checked).toBe(true);
  });

  it('picks with a click, and reports it', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderPicker({ onValueChange });
    await user.click(screen.getByText('Crane up'));
    expect(radio('Crane up').checked).toBe(true);
    expect(onValueChange).toHaveBeenCalledWith('crane-up');
  });

  it('shows the value it is given when controlled, and reports picks without making them', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { rerenderPicker } = renderPicker({ value: 'orbit', onValueChange });
    await user.click(radio('Dolly zoom'));
    expect(onValueChange).toHaveBeenCalledWith('dolly-zoom');
    expect(radio('Orbit').checked).toBe(true);
    rerenderPicker({ value: 'dolly-zoom', onValueChange });
    expect(radio('Dolly zoom').checked).toBe(true);
  });

  it('sends the picked move with a form', async () => {
    const user = userEvent.setup();
    const { container } = renderWithReducedMotion(
      <form aria-label="Generate">
        <CameraMotionPicker options={options} name="camera" defaultValue="orbit" />
      </form>,
      'never',
    );
    const form = container.querySelector('form');
    if (!form) throw new Error('No form');
    expect(new FormData(form).get('camera')).toBe('orbit');
    await user.click(radio('Bullet time'));
    expect(new FormData(form).get('camera')).toBe('bullet-time');
  });

  it('marks the picked tile with a check mark, not with color alone', () => {
    renderPicker({ defaultValue: 'orbit' });
    const check = tile('Orbit').querySelector('svg path[d^="M3 8.5"]')?.closest('span');
    expect(check?.getAttribute('aria-hidden')).toBe('true');
    expect(check?.className).toContain('group-has-checked/option:flex');
  });

  describe('previews', () => {
    it('play a tile’s clip from the pool once the pointer rests on it, and stop when it leaves', () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      renderPicker();
      fireEvent.pointerEnter(tile('Orbit'), { pointerType: 'mouse' });
      act(() => {
        vi.advanceTimersByTime(99);
      });
      expect(isPlaying(video('Orbit'))).toBe(false);
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(video('Orbit')?.getAttribute('src')).toBe('https://media.example.com/orbit.mp4');
      expect(isPlaying(video('Orbit'))).toBe(true);
      expect(video('Orbit')?.muted).toBe(true);
      expect(video('Orbit')?.loop).toBe(true);
      leave('Orbit');
      expect(isPlaying(video('Orbit'))).toBe(false);
    });

    it('show the clip over the poster only once its first frame is painted', () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      renderPicker();
      hover('Orbit');
      const preview = tile('Orbit').querySelector('[data-slot="camera-motion-picker-preview"]');
      expect(preview?.className).toContain('opacity-0');
      const element = video('Orbit');
      act(() => {
        if (element) paintFrame(element);
      });
      expect(preview?.className).not.toContain('opacity-0');
    });

    it('play while a tile has keyboard focus, and not after a click', async () => {
      const user = userEvent.setup();
      renderPicker({ defaultValue: 'orbit' }, { around: true });
      await user.tab();
      await user.tab();
      expect(document.activeElement).toBe(radio('Orbit'));
      await waitFor(() => {
        expect(isPlaying(video('Orbit'))).toBe(true);
      });
      // The arrows move focus, and the preview with it.
      await user.keyboard('{ArrowRight}');
      expect(isPlaying(video('Orbit'))).toBe(false);
      await waitFor(() => {
        expect(isPlaying(video('Crane up'))).toBe(true);
      });
      await user.tab({ shift: true });
      expect(isPlaying(video('Crane up'))).toBe(false);

      // A click focuses a tile too, but only a resting pointer plays it.
      await user.click(radio('Whip pan'));
      fireEvent.pointerLeave(tile('Whip pan'), { pointerType: 'mouse' });
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(document.activeElement).toBe(radio('Whip pan'));
      expect(isPlaying(video('Whip pan'))).toBe(false);
    });

    it('play the tile a touch taps, until another is tapped', () => {
      renderPicker();
      fireEvent.pointerEnter(tile('Orbit'), { pointerType: 'touch' });
      fireEvent.pointerUp(tile('Orbit'), { pointerType: 'touch' });
      expect(isPlaying(video('Orbit'))).toBe(true);
      fireEvent.pointerUp(tile('Crash zoom'), { pointerType: 'touch' });
      expect(isPlaying(video('Orbit'))).toBe(false);
      expect(isPlaying(video('Crash zoom'))).toBe(true);
    });

    it('never use more videos than the pool holds, however many tiles the pointer crosses', () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const create = vi.spyOn(document, 'createElement');
      renderPicker({}, { pool: 2 });
      for (const [, label] of [...moves, ...moves]) {
        hover(label);
        expect(document.querySelectorAll('video').length).toBeLessThanOrEqual(2);
        leave(label);
      }
      expect(create.mock.calls.filter(([tag]) => tag === 'video')).toHaveLength(2);
    });

    it('take a pool of their own without a VideoPoolProvider', () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      renderPicker({}, { pool: null });
      hover('Dolly out');
      expect(isPlaying(video('Dolly out'))).toBe(true);
    });

    it('fall back to a play button when the browser refuses to play', async () => {
      media().play.mockImplementationOnce(() => Promise.reject(new DOMException('Low Power Mode', 'NotAllowedError')));
      vi.useFakeTimers({ shouldAdvanceTime: true });
      renderPicker();
      expect(screen.queryByRole('button', { name: 'Play preview of Orbit' })).toBeNull();
      hover('Orbit');
      expect(await screen.findByRole('button', { name: 'Play preview of Orbit' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Play preview of Dolly in' })).toBeNull();
    });
  });

  describe('with reduced motion', () => {
    it('plays nothing by itself: each tile has a play button', () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const { group } = renderPicker({ defaultValue: 'orbit' }, { reducedMotion: 'always' });
      expect(group.dataset.motion).toBe('reduce');
      hover('Orbit');
      expect(video('Orbit')).toBeNull();
      expect(screen.getAllByRole('button', { name: /^Play preview of / })).toHaveLength(8);

      const play = screen.getByRole('button', { name: 'Play preview of Orbit' });
      expectAriaState(play, { pressed: false });
      fireEvent.click(play);
      expect(isPlaying(video('Orbit'))).toBe(true);
      expectAriaState(screen.getByRole('button', { name: 'Pause preview of Orbit' }), { pressed: true });
      expect(tile('Orbit').querySelector('[data-slot="camera-motion-picker-preview"]')?.className).toContain(
        'in-data-[motion=reduce]:transition-none',
      );
      fireEvent.click(screen.getByRole('button', { name: 'Pause preview of Orbit' }));
      expect(isPlaying(video('Orbit'))).toBe(false);
    });

    it('puts one play button in the tab order: the picked tile’s, or the first’s', () => {
      const { rerenderPicker } = renderPicker({}, { reducedMotion: 'always' });
      const tabbable = () =>
        screen.getAllByRole('button', { name: /^Play preview of / }).filter((button) => button.tabIndex === 0);
      expect(tabbable().map((button) => button.getAttribute('aria-label'))).toEqual(['Play preview of Dolly in']);
      rerenderPicker({ value: 'whip-pan' });
      expect(tabbable().map((button) => button.getAttribute('aria-label'))).toEqual(['Play preview of Whip pan']);
    });

    it('keeps tiles still on focus too', async () => {
      const user = userEvent.setup();
      renderPicker({ defaultValue: 'orbit' }, { reducedMotion: 'always', around: true });
      await user.tab();
      await user.tab();
      expect(document.activeElement).toBe(radio('Orbit'));
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(video('Orbit')).toBeNull();
    });

    it("follows the system setting when the app doesn't set one", () => {
      mockSystemReducedMotion(true);
      render(
        <VideoPoolProvider size={2}>
          <CameraMotionPicker options={options} />
        </VideoPoolProvider>,
      );
      expect(screen.getByRole('radiogroup').dataset.motion).toBe('reduce');
      expect(screen.getAllByRole('button', { name: /^Play preview of / })).toHaveLength(8);
    });
  });

  describe('keyboard', () => {
    describe('on the tiles', () => {
      testKeyboardMap(cameraMotionPickerKeyboard, {
        setup: () => {
          const onValueChange = vi.fn();
          renderPicker({ defaultValue: 'orbit', onValueChange }, { reducedMotion: 'always', around: true });
          return { onValueChange, target: radio('Orbit') };
        },
        expectations: {
          next: ({ onValueChange }) => {
            expect(radio('Crane up').checked).toBe(true);
            expect(document.activeElement).toBe(radio('Crane up'));
            expect(onValueChange).toHaveBeenCalledWith('crane-up');
          },
          previous: ({ onValueChange }) => {
            expect(radio('Dolly out').checked).toBe(true);
            expect(document.activeElement).toBe(radio('Dolly out'));
            expect(onValueChange).toHaveBeenCalledWith('dolly-out');
          },
          forward: () => {
            expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Play preview of Orbit' }));
          },
          back: () => {
            expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Before' }));
            expect(radio('Orbit').checked).toBe(true);
          },
        },
      });

      it('wrap around at the ends', async () => {
        const user = userEvent.setup();
        renderPicker({ defaultValue: 'bullet-time' });
        await user.click(radio('Bullet time'));
        await user.keyboard('{ArrowRight}');
        expect(radio('Dolly in').checked).toBe(true);
        await user.keyboard('{ArrowLeft}');
        expect(radio('Bullet time').checked).toBe(true);
      });

      it('leave the group with Tab when there are no play buttons', async () => {
        const user = userEvent.setup();
        renderPicker({ defaultValue: 'orbit' }, { around: true });
        await user.tab();
        await user.tab();
        expect(document.activeElement).toBe(radio('Orbit'));
        await user.tab();
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'After' }));
      });
    });

    describe('on a play button', () => {
      testKeyboardMap(cameraMotionPickerPlayKeyboard, {
        setup: () => {
          renderPicker({ defaultValue: 'orbit' }, { reducedMotion: 'always' });
          return { target: screen.getByRole('button', { name: 'Play preview of Orbit' }) };
        },
        expectations: {
          play: () => {
            expect(isPlaying(video('Orbit'))).toBe(true);
            expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Pause preview of Orbit' }));
          },
        },
      });
    });
  });
});
