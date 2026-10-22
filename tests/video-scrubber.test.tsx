import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { videoScrubberKeyboard } from '@/content/keyboard/video-scrubber';
import { spriteThumbnail, type SpriteSheet } from '@/registry/ui/video-scrubber/sprite-sheet';
import { VideoScrubber, type VideoScrubberProps } from '@/registry/ui/video-scrubber/video-scrubber';
import { expectAriaState, expectRole } from './helpers/aria';
import { testKeyboardMap } from './helpers/keyboard';
import { mockSystemReducedMotion, renderWithReducedMotion } from './helpers/reduced-motion';

// The Feed's story clips: 121 frames at 24 fps.
const CLIP = 121 / 24;

// A sheet of 21 tiles, 160 × 90, one every quarter second: 5 columns, 5 rows.
const sprite: SpriteSheet = { url: '/sprites/clip.webp', columns: 5, rows: 5, interval: 0.25, width: 160, height: 90 };

const mouse = { pointerId: 1, pointerType: 'mouse', button: 0, clientY: 10 } as const;

function renderScrubber(props: Partial<VideoScrubberProps> = {}, reducedMotion: 'always' | 'never' = 'never') {
  const onSeek = vi.fn<(time: number) => void>();
  const view = renderWithReducedMotion(
    <VideoScrubber duration={CLIP} currentTime={0} onSeek={onSeek} {...props} />,
    reducedMotion,
  );
  const slider = screen.getByRole('slider');
  // 400 px wide, 100 px from the left of the page.
  vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
    left: 100,
    top: 0,
    width: 400,
    height: 24,
    right: 500,
    bottom: 24,
    x: 100,
    y: 0,
    toJSON: () => ({}),
  });
  const selector = (slot: string) => `[data-slot="video-scrubber-${slot}"]`;
  return {
    ...view,
    slider,
    onSeek,
    part: (slot: string) => view.container.querySelector<HTMLElement>(selector(slot)),
    parts: (slot: string) => [...view.container.querySelectorAll<HTMLElement>(selector(slot))],
  };
}

describe('spriteThumbnail', () => {
  it('picks the tile showing the time, left to right and top to bottom', () => {
    expect(spriteThumbnail(sprite, 0)).toEqual({ url: '/sprites/clip.webp', x: 0, y: 0, width: 160, height: 90 });
    expect(spriteThumbnail(sprite, 0.24)).toMatchObject({ x: 0, y: 0 });
    expect(spriteThumbnail(sprite, 0.25)).toMatchObject({ x: 160, y: 0 });
    expect(spriteThumbnail(sprite, 1.3)).toMatchObject({ x: 0, y: 90 });
    expect(spriteThumbnail(sprite, 5.04)).toMatchObject({ x: 0, y: 360 });
  });

  it('counts a tile’s start as that tile through float error', () => {
    // 0.3 / 0.1 is 2.9999999999999996.
    expect(spriteThumbnail({ ...sprite, interval: 0.1 }, 0.3)).toMatchObject({ x: 480, y: 0 });
  });

  it('stays within the sheet', () => {
    expect(spriteThumbnail(sprite, -1)).toMatchObject({ x: 0, y: 0 });
    expect(spriteThumbnail(sprite, 99)).toMatchObject({ x: 640, y: 360 });
    expect(spriteThumbnail(sprite, Number.NaN)).toMatchObject({ x: 0, y: 0 });
  });
});

describe('VideoScrubber', () => {
  it('is a slider named "Seek", or what you name it, with the time in words', () => {
    const { slider, unmount } = renderScrubber({ duration: 120, currentTime: 64 });
    expectRole(slider, 'slider', 'Seek');
    expectAriaState(slider, {
      valuemin: 0,
      valuemax: 120,
      valuenow: 64,
      valuetext: '1 minute 4 seconds of 2 minutes',
      orientation: 'horizontal',
    });
    unmount();

    renderScrubber({ 'aria-label': 'Shot 1' });
    expectRole(screen.getByRole('slider'), 'slider', 'Shot 1');
  });

  it('takes its name from aria-labelledby', () => {
    render(<h2 id="shot">Shot 7</h2>);
    renderScrubber({ 'aria-labelledby': 'shot' });
    expectRole(screen.getByRole('slider'), 'slider', 'Shot 7');
  });

  it('draws the time played and the buffered ranges with transforms', () => {
    const { part, parts } = renderScrubber({
      duration: 120,
      currentTime: 30,
      buffered: [
        { start: 0, end: 48 },
        { start: 90, end: 120 },
      ],
    });
    expect(part('progress')?.style.transform).toBe('scaleX(0.25)');
    expect(parts('buffered').map((range) => range.style.transform)).toEqual([
      'translateX(0%) scaleX(0.4)',
      'translateX(75%) scaleX(0.25)',
    ]);
    expect(part('thumb')?.parentElement?.style.transform).toBe('translateX(25%)');
  });

  it('is disabled until the duration is known', () => {
    const { slider, onSeek } = renderScrubber({ duration: Number.NaN });
    expectAriaState(slider, { disabled: true });
    fireEvent.keyDown(slider, { key: 'End' });
    expect(onSeek).not.toHaveBeenCalled();
  });

  describe('keyboard', () => {
    testKeyboardMap(videoScrubberKeyboard, {
      setup: () => {
        const view = renderScrubber({ duration: 120, currentTime: 60, fps: 24 });
        return { ...view, target: view.slider };
      },
      expectations: {
        // With a frame rate, in the middle of the frame 5 seconds on or back.
        forward: ({ onSeek }) => {
          expect(onSeek).toHaveBeenCalledWith(1560.5 / 24);
        },
        back: ({ onSeek }) => {
          expect(onSeek).toHaveBeenCalledWith(1320.5 / 24);
        },
        start: ({ onSeek }) => {
          expect(onSeek).toHaveBeenCalledWith(0);
        },
        end: ({ onSeek }) => {
          expect(onSeek).toHaveBeenCalledWith(120);
        },
        nextFrame: ({ onSeek, slider }) => {
          expect(onSeek).toHaveBeenCalledWith(1441.5 / 24);
          expectAriaState(slider, { valuetext: '1 minute 1 frame of 2 minutes' });
        },
        previousFrame: ({ onSeek, slider }) => {
          expect(onSeek).toHaveBeenCalledWith(1439.5 / 24);
          expectAriaState(slider, { valuetext: '59 seconds 23 frames of 2 minutes' });
        },
      },
    });

    it('leaves "," and "." alone without a frame rate', () => {
      const { slider, onSeek } = renderScrubber({ duration: 120, currentTime: 60 });
      fireEvent.keyDown(slider, { key: '.' });
      fireEvent.keyDown(slider, { key: ',' });
      expect(onSeek).not.toHaveBeenCalled();
    });
  });

  describe('the preview', () => {
    it('stays hidden, with its sprite loading, until the pointer is over the bar', () => {
      const { part } = renderScrubber({ sprite });
      expect(part('preview')?.hidden).toBe(true);
      expect(part('preview')?.getAttribute('aria-hidden')).toBe('true');
      expect(part('thumbnail')?.querySelector('img')?.getAttribute('src')).toBe('/sprites/clip.webp');
    });

    it('shows the tile and the timecode of the frame under the pointer, and hides when it leaves', () => {
      const { slider, part } = renderScrubber({ sprite, fps: 24 });
      // 70% of 121 frames is frame 84: 00:00:03:12, in the tile for 3.5 s (row 2, column 4).
      fireEvent.pointerMove(slider, { ...mouse, clientX: 380 });
      expect(part('preview')?.hidden).toBe(false);
      expect(part('time')?.textContent).toBe('00:00:03:12');
      const image = part('thumbnail')?.querySelector('img');
      expect(image?.style.transform).toBe('scale(1) translate(-640px, -180px)');
      expect(part('thumbnail')?.style.height).toBe('90px');
      fireEvent.pointerLeave(slider, { ...mouse, clientX: 600 });
      expect(part('preview')?.hidden).toBe(true);
    });

    it('follows the pointer, without going past either end of the bar', () => {
      const { slider, part } = renderScrubber({ sprite });
      fireEvent.pointerMove(slider, { ...mouse, clientX: 380 });
      expect(part('preview')?.style.transform).toBe(
        'translateX(clamp(calc((160px) / 2), 70%, calc(100% - (160px) / 2)))',
      );
    });

    it('shows m:ss without a frame rate, and h:mm:ss on a video an hour long', () => {
      const { slider, part, unmount } = renderScrubber({ duration: 120 });
      fireEvent.pointerMove(slider, { ...mouse, clientX: 300 });
      expect(part('time')?.textContent).toBe('1:00');
      expect(part('thumbnail')).toBeNull();
      // As wide as the longest time, "2:00", plus its padding.
      expect(part('preview')?.style.transform).toContain('calc((4ch + 1rem) / 2)');
      unmount();

      const long = renderScrubber({ duration: 7200 });
      fireEvent.pointerMove(long.slider, { ...mouse, clientX: 300 });
      expect(long.part('time')?.textContent).toBe('1:00:00');
    });

    it('scales thumbnails to thumbnailWidth', () => {
      const { slider, part } = renderScrubber({ sprite: { ...sprite, width: 320, height: 180 }, thumbnailWidth: 160 });
      fireEvent.pointerMove(slider, { ...mouse, clientX: 100 });
      expect(part('thumbnail')?.style.height).toBe('90px');
      expect(part('thumbnail')?.querySelector('img')?.style.transform).toBe('scale(0.5) translate(0px, 0px)');
    });

    it('asks getThumbnail for the time under the pointer when there’s no sprite', () => {
      const getThumbnail = vi.fn((time: number) => ({
        url: `/thumbs/${String(Math.floor(time))}.jpg`,
        x: 0,
        y: 0,
        width: 320,
        height: 180,
      }));
      const { slider, part } = renderScrubber({ duration: 120, getThumbnail });
      expect(getThumbnail).not.toHaveBeenCalled();
      fireEvent.pointerMove(slider, { ...mouse, clientX: 200 });
      expect(getThumbnail).toHaveBeenLastCalledWith(30);
      expect(part('thumbnail')?.querySelector('img')?.getAttribute('src')).toBe('/thumbs/30.jpg');
    });

    it('follows a drag', () => {
      const { slider, part, onSeek } = renderScrubber({ duration: 120 });
      fireEvent.pointerDown(slider, { ...mouse, clientX: 200 });
      fireEvent.pointerMove(slider, { ...mouse, clientX: 400 });
      expect(onSeek).toHaveBeenLastCalledWith(90);
      expect(part('time')?.textContent).toBe('1:30');
      expect(slider.dataset.scrubbing).toBe('');
      fireEvent.pointerUp(slider, { ...mouse, clientX: 400 });
      expect(slider.dataset.scrubbing).toBeUndefined();
    });
  });

  it('takes focus when pressed, so the keys work after a click', () => {
    const { slider } = renderScrubber();
    fireEvent.pointerDown(slider, { ...mouse, clientX: 300 });
    expect(document.activeElement).toBe(slider);
  });

  describe('motion', () => {
    it('fades the preview in and grows the thumb with full motion', () => {
      const { slider, part } = renderScrubber({}, 'never');
      expect(slider.dataset.motion).toBeUndefined();
      expect(part('preview')?.className).toContain('starting:opacity-0');
      expect(part('preview')?.className).toContain('duration-(--genframe-duration-fast)');
      expect(part('thumb')?.className).toContain('transition-transform');
    });

    it('shows them at once with reduced motion', () => {
      const { slider, part } = renderScrubber({}, 'always');
      expect(slider.dataset.motion).toBe('reduce');
      expect(part('preview')?.className).toContain('in-data-[motion=reduce]:transition-none');
      expect(part('thumb')?.className).toContain('in-data-[motion=reduce]:transition-none');
    });

    it('never animates the time played: it follows the player', () => {
      const { part } = renderScrubber();
      expect(part('progress')?.className).not.toContain('transition');
    });

    it("follows the system setting when the app doesn't set one", () => {
      mockSystemReducedMotion(true);
      render(<VideoScrubber duration={CLIP} currentTime={0} onSeek={() => undefined} />);
      expect(screen.getByRole('slider').dataset.motion).toBe('reduce');
    });
  });
});
