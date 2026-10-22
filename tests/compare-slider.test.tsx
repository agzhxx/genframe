import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { compareSliderKeyboard } from '@/content/keyboard/compare-slider';
import type { ReducedMotionSetting } from '@/registry/hooks/use-reduced-motion';
import { CompareSlider, type CompareSliderProps } from '@/registry/ui/compare-slider/compare-slider';
import { expectAriaState, expectRole } from './helpers/aria';
import { press, testKeyboardMap } from './helpers/keyboard';
import { mockSystemReducedMotion, renderWithReducedMotion } from './helpers/reduced-motion';

const labels = { before: 'Draft', after: 'Final' };

function find(container: ParentNode, selector: string) {
  const element = container.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Nothing matches ${selector}`);
  return element;
}

// The slider as the tests see it: 400 × 300 px, 100 px from the left of the page, so a pointer
// at clientX 100 is at 0%, 300 at 50% and 500 at 100%.
function renderSlider(props: Partial<CompareSliderProps> = {}, reducedMotion: ReducedMotionSetting = 'never') {
  const view = renderWithReducedMotion(
    <CompareSlider before={<img alt="" src="draft.webp" />} after={<img alt="" src="final.webp" />} {...props} />,
    reducedMotion,
  );
  const root = find(view.container, '[data-slot="compare-slider"]');
  vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({
    x: 100,
    y: 0,
    left: 100,
    top: 0,
    right: 500,
    bottom: 300,
    width: 400,
    height: 300,
    toJSON: () => ({}),
  });
  return {
    ...view,
    root,
    slider: screen.getByRole('slider'),
    after: find(root, '[data-slot="compare-slider-after"]'),
    divider: find(root, '[data-slot="compare-slider-divider"]'),
  };
}

const mouse = { pointerId: 1, pointerType: 'mouse', button: 0 } as const;
const touch = { pointerId: 2, pointerType: 'touch', button: 0 } as const;

describe('CompareSlider', () => {
  it('is a slider named after its labels, from 0 to 100, at 50 to start', () => {
    const { slider } = renderSlider({ labels });
    expectRole(slider, 'slider', 'Draft and Final');
    expectAriaState(slider, {
      valuemin: 0,
      valuemax: 100,
      valuenow: 50,
      valuetext: '50% Final',
      orientation: 'horizontal',
    });
  });

  it('without labels, is named "Before and after" and reads the bare percentage', () => {
    const { slider } = renderSlider();
    expectRole(slider, 'slider', 'Before and after');
    expectAriaState(slider, { valuetext: '50%' });
  });

  it('takes its name from aria-label or aria-labelledby', () => {
    const { slider, unmount } = renderSlider({ labels, 'aria-label': 'Upscale result' });
    expectRole(slider, 'slider', 'Upscale result');
    unmount();

    render(<h2 id="title">The red car</h2>);
    expectRole(renderSlider({ 'aria-labelledby': 'title' }).slider, 'slider', 'The red car');
  });

  it('is reached with Tab', async () => {
    const user = userEvent.setup();
    const { slider } = renderSlider();
    await user.tab();
    expect(document.activeElement).toBe(slider);
  });

  describe('keyboard', () => {
    testKeyboardMap(compareSliderKeyboard, {
      setup: () => {
        const { slider } = renderSlider({ labels });
        return { target: slider };
      },
      expectations: {
        more: ({ target }) => {
          expectAriaState(target, { valuenow: 51, valuetext: '51% Final' });
        },
        muchMore: ({ target }) => {
          expectAriaState(target, { valuenow: 60 });
        },
        less: ({ target }) => {
          expectAriaState(target, { valuenow: 49 });
        },
        muchLess: ({ target }) => {
          expectAriaState(target, { valuenow: 40 });
        },
        start: ({ target }) => {
          expectAriaState(target, { valuenow: 0, valuetext: '0% Final' });
        },
        end: ({ target }) => {
          expectAriaState(target, { valuenow: 100 });
        },
      },
    });

    it("leaves Ctrl, Alt and Cmd shortcuts to the browser", async () => {
      const user = userEvent.setup();
      const { slider } = renderSlider();
      act(() => {
        slider.focus();
      });
      await press(user, 'Control+ArrowRight', 'Alt+ArrowLeft', 'Meta+ArrowRight');
      expectAriaState(slider, { valuenow: 50 });
    });
  });

  it('clips the after layer at the divider, and moves the divider with a transform', async () => {
    const user = userEvent.setup();
    const { slider, after, divider } = renderSlider();
    expect(after.style.clipPath).toBe('inset(0 50% 0 0)');
    expect(divider.style.transform).toBe('translateX(50%)');

    act(() => {
      slider.focus();
    });
    await press(user, 'PageUp');
    expect(after.style.clipPath).toBe('inset(0 40% 0 0)');
    expect(divider.style.transform).toBe('translateX(60%)');
  });

  it('grows the after layer from the bottom when vertical', async () => {
    const user = userEvent.setup();
    const { slider, after, divider } = renderSlider({ orientation: 'vertical' });
    expectAriaState(slider, { orientation: 'vertical' });

    act(() => {
      slider.focus();
    });
    await press(user, 'ArrowUp');
    expectAriaState(slider, { valuenow: 51 });
    expect(after.style.clipPath).toBe('inset(49% 0 0 0)');
    expect(divider.style.transform).toBe('translateY(49%)');
  });

  it('starts at defaultPosition when it keeps its own position, and reports changes', async () => {
    const user = userEvent.setup();
    const onPositionChange = vi.fn();
    const { slider } = renderSlider({ defaultPosition: 25, onPositionChange });
    expectAriaState(slider, { valuenow: 25 });

    act(() => {
      slider.focus();
    });
    await press(user, 'ArrowRight');
    expectAriaState(slider, { valuenow: 26 });
    expect(onPositionChange).toHaveBeenCalledWith(26);
  });

  it('shows the position it is given when controlled, and reports moves without making them', async () => {
    const user = userEvent.setup();
    const onPositionChange = vi.fn();
    const { slider, rerender } = renderSlider({ position: 30, onPositionChange });

    act(() => {
      slider.focus();
    });
    await press(user, 'ArrowRight');
    expect(onPositionChange).toHaveBeenLastCalledWith(31);
    expectAriaState(slider, { valuenow: 30 });

    rerender(
      <CompareSlider
        before={<img alt="" src="draft.webp" />}
        after={<img alt="" src="final.webp" />}
        position={31}
        onPositionChange={onPositionChange}
      />,
    );
    expectAriaState(slider, { valuenow: 31 });
  });

  it("doesn't report a move to where it already is", async () => {
    const user = userEvent.setup();
    const onPositionChange = vi.fn();
    const { slider } = renderSlider({ defaultPosition: 100, onPositionChange });
    act(() => {
      slider.focus();
    });
    await press(user, 'End', 'ArrowRight');
    expect(onPositionChange).not.toHaveBeenCalled();
  });

  describe('pointer', () => {
    it('springs to where the track is clicked, and focuses the handle', () => {
      const { root, slider } = renderSlider();
      fireEvent.pointerDown(root, { ...mouse, clientX: 340, clientY: 150 });
      expectAriaState(slider, { valuenow: 60 });
      expect(document.activeElement).toBe(slider);
      // Not a drag: the transition (the spring) stays on.
      expect(root.hasAttribute('data-dragging')).toBe(false);
      fireEvent.pointerUp(root, { ...mouse, clientX: 340, clientY: 150 });
      expectAriaState(slider, { valuenow: 60 });
    });

    it('follows a drag without the spring, keeping hold where the handle was grabbed', () => {
      const { root, slider } = renderSlider();
      // The handle is at 50% (clientX 300); grabbed 10 px to its right, 2.5% further on.
      fireEvent.pointerDown(slider, { ...mouse, clientX: 310, clientY: 150 });
      expectAriaState(slider, { valuenow: 50 });

      fireEvent.pointerMove(root, { ...mouse, clientX: 410, clientY: 150 });
      expectAriaState(slider, { valuenow: 75 });
      expect(root.hasAttribute('data-dragging')).toBe(true);

      fireEvent.pointerMove(root, { ...mouse, clientX: 900, clientY: 150 });
      expectAriaState(slider, { valuenow: 100 });

      fireEvent.pointerUp(root, { ...mouse, clientX: 900, clientY: 150 });
      expect(root.hasAttribute('data-dragging')).toBe(false);
    });

    it('moves on a touch only once it is a tap or a drag, and leaves scrolls alone', () => {
      const { root, slider } = renderSlider();
      // A tap: nothing on touch-down (it could be a scroll), a jump on release.
      fireEvent.pointerDown(root, { ...touch, clientX: 180, clientY: 150 });
      expectAriaState(slider, { valuenow: 50 });
      fireEvent.pointerUp(root, { ...touch, clientX: 180, clientY: 150 });
      expectAriaState(slider, { valuenow: 20 });

      // A drag: small wobbles don't count, then the divider follows.
      fireEvent.pointerDown(root, { ...touch, clientX: 180, clientY: 150 });
      fireEvent.pointerMove(root, { ...touch, clientX: 183, clientY: 151 });
      expectAriaState(slider, { valuenow: 20 });
      fireEvent.pointerMove(root, { ...touch, clientX: 260, clientY: 150 });
      expectAriaState(slider, { valuenow: 40 });
      fireEvent.pointerUp(root, { ...touch, clientX: 260, clientY: 150 });

      // A scroll: the browser takes the touch over and cancels it.
      fireEvent.pointerDown(root, { ...touch, clientX: 460, clientY: 150 });
      fireEvent.pointerCancel(root, { ...touch, clientX: 460, clientY: 150 });
      expectAriaState(slider, { valuenow: 40 });
    });

    it('ignores buttons other than the main one', () => {
      const { root, slider } = renderSlider();
      fireEvent.pointerDown(root, { ...mouse, button: 2, clientX: 140, clientY: 150 });
      expectAriaState(slider, { valuenow: 50 });
    });

    it('goes back to 50% on a double-click', async () => {
      const user = userEvent.setup();
      const { root, slider } = renderSlider();
      act(() => {
        slider.focus();
      });
      await press(user, 'End');
      fireEvent.doubleClick(root);
      expectAriaState(slider, { valuenow: 50 });
    });
  });

  describe('reduced motion', () => {
    it('springs with full motion', () => {
      const { root, after, divider } = renderSlider({}, 'never');
      expect(root.dataset.motion).toBeUndefined();
      for (const part of [after, divider]) expect(part.className).toContain('ease-(--genframe-ease-spring)');
    });

    it('goes straight to the new position with reduced motion', () => {
      const { root, after, divider } = renderSlider({}, 'always');
      expect(root.dataset.motion).toBe('reduce');
      for (const part of [after, divider]) expect(part.className).toContain('in-data-[motion=reduce]:transition-none');
    });

    it("follows the system setting when the app doesn't set one", () => {
      const system = mockSystemReducedMotion(false);
      render(<CompareSlider before={null} after={null} />);
      const root = find(document.body, '[data-slot="compare-slider"]');
      expect(root.dataset.motion).toBeUndefined();
      system.set(true);
      expect(root.dataset.motion).toBe('reduce');
    });
  });

  it('shows the labels on their own layers, hidden from screen readers', () => {
    const { root } = renderSlider({ labels });
    const final = screen.getByText('Final');
    expect(final.closest('[data-slot="compare-slider-after"]')).not.toBeNull();
    expect(final.getAttribute('aria-hidden')).toBe('true');
    expect(find(root, '[data-slot="compare-slider-before"]').textContent).toBe('Draft');
  });

  describe('videos', () => {
    function stubPlayback() {
      const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
      vi.spyOn(HTMLMediaElement.prototype, 'pause').mockReturnValue(undefined);
      return play;
    }

    function slider(after: ReactNode) {
      return <CompareSlider before={<video data-testid="clock" />} after={after} />;
    }

    it('keeps a video in each layer in step: playing one plays the other', () => {
      const play = stubPlayback();
      renderWithReducedMotion(slider(<video data-testid="follower" />), 'never');
      fireEvent.play(screen.getByTestId('clock'));
      expect(play.mock.contexts).toEqual([screen.getByTestId('follower')]);
    });

    it('picks up a video that arrives later', async () => {
      const play = stubPlayback();
      const { rerender } = renderWithReducedMotion(slider(<img alt="" src="final.webp" />), 'never');
      fireEvent.play(screen.getByTestId('clock'));
      expect(play).not.toHaveBeenCalled();

      rerender(slider(<video data-testid="follower" />));
      await waitFor(() => {
        fireEvent.play(screen.getByTestId('clock'));
        expect(play.mock.contexts).toContain(screen.getByTestId('follower'));
      });
    });
  });
});
