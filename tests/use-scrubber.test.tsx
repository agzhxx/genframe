import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bufferedFractions,
  frameAt,
  pointerTime,
  seekTime,
  timeForKey,
  useMediaElement,
  useScrubber,
  type MediaElementState,
  type Scrubber,
  type ScrubberOptions,
} from '@/registry/hooks/use-scrubber';
import { expectAriaState, expectRole } from './helpers/aria';
import { installMediaStubs, isPlaying, media, paintFrame, removeMediaStubs } from './helpers/media';

// The Feed's story clips: 121 frames at 24 fps.
const CLIP = 121 / 24;

describe('the scrubber’s arithmetic', () => {
  describe('seekTime', () => {
    it('keeps a seek within the video', () => {
      expect(seekTime(-3, 120)).toBe(0);
      expect(seekTime(Number.NaN, 120)).toBe(0);
      expect(seekTime(64.2, 120)).toBe(64.2);
      expect(seekTime(130, 120)).toBe(120);
    });

    it('sends it to the middle of its frame with a frame rate, but leaves the start and the end alone', () => {
      expect(seekTime(4.5, CLIP, 24)).toBe(108.5 / 24);
      expect(seekTime(4.53, CLIP, 24)).toBe(108.5 / 24);
      expect(seekTime(0, CLIP, 24)).toBe(0);
      expect(seekTime(CLIP, CLIP, 24)).toBe(CLIP);
      // The middle of a last frame shorter than half a frame is past the end: the end it is.
      expect(seekTime(5.0, 5.01, 24)).toBe(5.01);
    });
  });

  describe('frameAt', () => {
    it('gives the frame showing, never past the last', () => {
      expect(frameAt(4.52, CLIP, 24)).toBe(108);
      expect(frameAt(CLIP, CLIP, 24)).toBe(120);
      expect(frameAt(99, CLIP, 24)).toBe(120);
      expect(frameAt(0, CLIP, 24)).toBe(0);
      expect(frameAt(3, 0, 24)).toBe(0);
    });
  });

  describe('timeForKey', () => {
    it('moves 5 seconds with the arrows, up and down too, within the video', () => {
      expect(timeForKey('ArrowRight', 64, 120)).toBe(69);
      expect(timeForKey('ArrowUp', 64, 120)).toBe(69);
      expect(timeForKey('ArrowLeft', 64, 120)).toBe(59);
      expect(timeForKey('ArrowDown', 64, 120)).toBe(59);
      expect(timeForKey('ArrowRight', 117, 120)).toBe(120);
      expect(timeForKey('ArrowLeft', 3, 120)).toBe(0);
    });

    it('lands the arrows in the middle of a frame with a frame rate', () => {
      expect(timeForKey('ArrowLeft', 4.5, CLIP, 24)).toBe(0);
      expect(timeForKey('ArrowRight', 0, CLIP, 24)).toBe(120.5 / 24);
      expect(timeForKey('ArrowRight', 0.2, 30, 24)).toBe(124.5 / 24);
    });

    it('goes to the start with Home and the end with End', () => {
      expect(timeForKey('Home', 64, 120)).toBe(0);
      expect(timeForKey('End', 64, 120)).toBe(120);
      expect(timeForKey('End', 1, CLIP, 24)).toBe(CLIP);
    });

    it('steps a frame with "," and "." when it knows the frame rate', () => {
      expect(timeForKey('.', 108.5 / 24, CLIP, 24)).toBe(109.5 / 24);
      expect(timeForKey(',', 108.5 / 24, CLIP, 24)).toBe(107.5 / 24);
      // From a frame's start, read in float or whole microseconds: that frame, then the next.
      expect(timeForKey('.', 108 / 24, CLIP, 24)).toBe(109.5 / 24);
      expect(timeForKey('.', 4.499_999_5, CLIP, 24)).toBe(109.5 / 24);
      // Frame 1 back is frame 0, which starts at 0; on from 0 is frame 1.
      expect(timeForKey(',', 1.5 / 24, CLIP, 24)).toBe(0);
      expect(timeForKey('.', 0, CLIP, 24)).toBe(1.5 / 24);
    });

    it('stays put at the first and the last frame, and steps back from the end to the frame before the last', () => {
      expect(timeForKey(',', 0, CLIP, 24)).toBe(0);
      expect(timeForKey(',', 0.5 / 24, CLIP, 24)).toBe(0.5 / 24);
      expect(timeForKey('.', 120.5 / 24, CLIP, 24)).toBe(120.5 / 24);
      // At the end the last frame (120) shows: "." keeps it, "," goes to 119.
      expect(timeForKey('.', CLIP, CLIP, 24)).toBe(CLIP);
      expect(timeForKey(',', CLIP, CLIP, 24)).toBe(119.5 / 24);
    });

    it('steps frames at fractional rates', () => {
      const frame = (index: number) => ((index + 0.5) * 1001) / 30000;
      expect(timeForKey('.', frame(1799), 120, 29.97)).toBeCloseTo(frame(1800), 12);
      expect(timeForKey(',', frame(1800), 120, 29.97)).toBeCloseTo(frame(1799), 12);
    });

    it('leaves "," and "." alone without a frame rate, and other keys always', () => {
      expect(timeForKey('.', 4, CLIP)).toBeNull();
      expect(timeForKey(',', 4, CLIP)).toBeNull();
      for (const key of ['PageUp', 'Enter', ' ', 'k', 'Tab']) expect(timeForKey(key, 4, CLIP, 24), key).toBeNull();
    });
  });

  describe('pointerTime', () => {
    const bar = { left: 100, width: 400 };

    it('reads the time and the place along the bar under the pointer', () => {
      expect(pointerTime(300, bar, 120)).toEqual({ time: 60, fraction: 0.5 });
      expect(pointerTime(100, bar, 120)).toEqual({ time: 0, fraction: 0 });
      expect(pointerTime(500, bar, 120)).toEqual({ time: 120, fraction: 1 });
    });

    it('stays within the bar when the pointer leaves it', () => {
      expect(pointerTime(40, bar, 120)).toEqual({ time: 0, fraction: 0 });
      expect(pointerTime(900, bar, 120)).toEqual({ time: 120, fraction: 1 });
    });

    it('lands on the middle of a frame with a frame rate, while the place follows the pointer', () => {
      const point = pointerTime(310, bar, CLIP, 24);
      expect(point.fraction).toBe(0.525);
      expect(point.time).toBe((Math.floor(0.525 * 121) + 0.5) / 24);
    });

    it('has nothing under it while the bar has no width', () => {
      expect(pointerTime(300, { left: 0, width: 0 }, 120)).toEqual({ time: 0, fraction: 0 });
    });
  });

  describe('bufferedFractions', () => {
    it('gives ranges as fractions of the duration, in order, overlapping ones merged', () => {
      expect(
        bufferedFractions(
          [
            { start: 60, end: 90 },
            { start: 0, end: 30 },
            { start: 20, end: 45 },
            { start: 90, end: 96 },
          ],
          120,
        ),
      ).toEqual([
        { start: 0, end: 0.375 },
        { start: 0.5, end: 0.8 },
      ]);
    });

    it('keeps ranges within the video and drops empty ones', () => {
      expect(
        bufferedFractions(
          [
            { start: -5, end: 30 },
            { start: 50, end: 50 },
            { start: 100, end: 140 },
          ],
          120,
        ),
      ).toEqual([
        { start: 0, end: 0.25 },
        { start: 100 / 120, end: 1 },
      ]);
    });

    it('has none while the duration isn’t known', () => {
      for (const duration of [0, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(bufferedFractions([{ start: 0, end: 10 }], duration)).toEqual([]);
      }
    });
  });
});

// The bar as the tests see it: 400 px wide, 100 px from the left of the page, so a pointer at
// clientX 100 is at the start, 300 halfway and 500 at the end.
const mouse = { pointerId: 1, pointerType: 'mouse', button: 0, clientY: 10 } as const;
const touch = { pointerId: 2, pointerType: 'touch', button: 0, clientY: 10 } as const;

function renderBar(options: Partial<ScrubberOptions> = {}) {
  const onSeek = vi.fn<(time: number) => void>();
  const state: { current: Scrubber | null } = { current: null };
  function Bar(props: Partial<ScrubberOptions>) {
    const scrubber = useScrubber({ duration: 120, currentTime: 0, onSeek, ...props });
    state.current = scrubber;
    return <div aria-label="Seek" {...scrubber.sliderProps} />;
  }
  const view = render(<Bar {...options} />);
  const bar = screen.getByRole('slider');
  vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({
    left: 100,
    top: 0,
    width: 400,
    height: 20,
    right: 500,
    bottom: 20,
    x: 100,
    y: 0,
    toJSON: () => ({}),
  });
  return {
    ...view,
    bar,
    onSeek,
    scrubber: () => {
      if (!state.current) throw new Error('No scrubber');
      return state.current;
    },
    rerenderBar: (props: Partial<ScrubberOptions>) => {
      view.rerender(<Bar {...options} {...props} />);
    },
  };
}

describe('useScrubber', () => {
  it('makes a slider from 0 to the duration, its time in words', () => {
    const { bar } = renderBar({ duration: 120, currentTime: 64 });
    expectRole(bar, 'slider', 'Seek');
    expectAriaState(bar, {
      valuemin: 0,
      valuemax: 120,
      valuenow: 64,
      valuetext: '1 minute 4 seconds of 2 minutes',
      orientation: 'horizontal',
      disabled: null,
    });
    expect(bar.tabIndex).toBe(0);
  });

  it('reads out the frame with a frame rate, and the last frame at the end', () => {
    const { bar, rerenderBar } = renderBar({ duration: CLIP, currentTime: 108.5 / 24, fps: 24 });
    expectAriaState(bar, { valuenow: 4.521, valuemax: 5.042, valuetext: '4 seconds 12 frames of 5 seconds' });
    rerenderBar({ duration: CLIP, currentTime: CLIP, fps: 24 });
    expectAriaState(bar, { valuetext: '5 seconds of 5 seconds' });
  });

  it('is disabled until the duration is known, and takes no keys or pointers', () => {
    for (const duration of [Number.NaN, 0, Number.POSITIVE_INFINITY]) {
      const { bar, onSeek, unmount } = renderBar({ duration });
      expectAriaState(bar, { disabled: true, valuemax: 0, valuenow: 0, valuetext: '0 seconds' });
      fireEvent.keyDown(bar, { key: 'End' });
      fireEvent.pointerDown(bar, { ...mouse, clientX: 300 });
      expect(onSeek).not.toHaveBeenCalled();
      unmount();
    }
  });

  it('shows the player’s time, within the video, and its share of the duration', () => {
    const { scrubber, rerenderBar } = renderBar({ currentTime: 30 });
    expect(scrubber().time).toBe(30);
    expect(scrubber().progress).toBe(0.25);
    rerenderBar({ currentTime: 150 });
    expect(scrubber().time).toBe(120);
    rerenderBar({ currentTime: Number.NaN });
    expect(scrubber().time).toBe(0);
  });

  it('gives the buffered ranges as fractions', () => {
    const { scrubber } = renderBar({ buffered: [{ start: 0, end: 30 }] });
    expect(scrubber().buffered).toEqual([{ start: 0, end: 0.25 }]);
  });

  describe('keys', () => {
    it('seek, and the bar shows the time asked for until the player reports one', () => {
      const { bar, onSeek, scrubber, rerenderBar } = renderBar({ currentTime: 64 });
      fireEvent.keyDown(bar, { key: 'ArrowRight' });
      expect(onSeek).toHaveBeenLastCalledWith(69);
      expect(scrubber().time).toBe(69);
      // A second press before the player catches up goes on from there.
      fireEvent.keyDown(bar, { key: 'ArrowRight' });
      expect(onSeek).toHaveBeenLastCalledWith(74);
      rerenderBar({ currentTime: 73.9 });
      expect(scrubber().time).toBe(73.9);
    });

    it('take the frame keys with a frame rate', () => {
      const { bar, onSeek } = renderBar({ duration: CLIP, currentTime: 108.5 / 24, fps: 24 });
      fireEvent.keyDown(bar, { key: '.' });
      expect(onSeek).toHaveBeenLastCalledWith(109.5 / 24);
      fireEvent.keyDown(bar, { key: ',' });
      expect(onSeek).toHaveBeenLastCalledWith(108.5 / 24);
    });

    it('stop the page from scrolling, and seek nowhere when the time wouldn’t change', () => {
      const { bar, onSeek } = renderBar({ currentTime: 120 });
      const end = new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true });
      bar.dispatchEvent(end);
      expect(end.defaultPrevented).toBe(true);
      expect(onSeek).not.toHaveBeenCalled();
    });

    it('leave other keys and the browser’s shortcuts alone', () => {
      const { bar, onSeek } = renderBar({ currentTime: 64 });
      const keys = [
        { key: 'ArrowRight', ctrlKey: true },
        { key: 'ArrowLeft', altKey: true },
        { key: 'End', metaKey: true },
        { key: 'a' },
      ];
      for (const init of keys) {
        const event = new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true });
        bar.dispatchEvent(event);
        expect(event.defaultPrevented, init.key).toBe(false);
      }
      expect(onSeek).not.toHaveBeenCalled();
    });
  });

  describe('a mouse', () => {
    it('seeks where it presses, and takes focus for the keys', () => {
      const { bar, onSeek } = renderBar();
      fireEvent.pointerDown(bar, { ...mouse, clientX: 300 });
      expect(onSeek).toHaveBeenLastCalledWith(60);
      expect(document.activeElement).toBe(bar);
      fireEvent.pointerUp(bar, { ...mouse, clientX: 300 });
    });

    it('drags, and the bar shows the drag while the player reports other times', () => {
      const onScrubStart = vi.fn();
      const onScrubEnd = vi.fn();
      const { bar, onSeek, scrubber, rerenderBar } = renderBar({ onScrubStart, onScrubEnd });
      fireEvent.pointerDown(bar, { ...mouse, clientX: 200 });
      expect(onScrubStart).toHaveBeenCalledOnce();
      expect(scrubber().scrubbing).toBe(true);
      fireEvent.pointerMove(bar, { ...mouse, clientX: 400 });
      expect(onSeek).toHaveBeenLastCalledWith(90);
      rerenderBar({ onScrubStart, onScrubEnd, currentTime: 31 });
      expect(scrubber().time).toBe(90);
      // Past the end of the bar is the end.
      fireEvent.pointerMove(bar, { ...mouse, clientX: 900 });
      expect(onSeek).toHaveBeenLastCalledWith(120);
      fireEvent.pointerUp(bar, { ...mouse, clientX: 900 });
      expect(onScrubEnd).toHaveBeenCalledOnce();
      expect(scrubber().scrubbing).toBe(false);
      // Held at the drag's end until the player reports a new time.
      expect(scrubber().time).toBe(120);
      rerenderBar({ onScrubStart, onScrubEnd, currentTime: 119.98 });
      expect(scrubber().time).toBe(119.98);
    });

    it('shows the time under it as it hovers, and nothing once it leaves', () => {
      const { bar, scrubber } = renderBar();
      fireEvent.pointerMove(bar, { ...mouse, clientX: 200 });
      expect(scrubber().hover).toEqual({ time: 30, fraction: 0.25 });
      fireEvent.pointerLeave(bar, { ...mouse, clientX: 600 });
      expect(scrubber().hover).toBeNull();
    });

    it('keeps showing the time under it after a drag, and none after it leaves', () => {
      const { bar, scrubber } = renderBar();
      fireEvent.pointerDown(bar, { ...mouse, clientX: 200 });
      expect(scrubber().hover).toEqual({ time: 30, fraction: 0.25 });
      fireEvent.pointerUp(bar, { ...mouse, clientX: 300 });
      fireEvent.lostPointerCapture(bar, { ...mouse });
      expect(scrubber().hover).toEqual({ time: 60, fraction: 0.5 });
    });

    it('ignores the other buttons', () => {
      const { bar, onSeek } = renderBar();
      fireEvent.pointerDown(bar, { ...mouse, button: 2, clientX: 300 });
      expect(onSeek).not.toHaveBeenCalled();
    });
  });

  describe('a touch', () => {
    it('seeks on a tap, without a drag', () => {
      const onScrubStart = vi.fn();
      const { bar, onSeek, scrubber } = renderBar({ onScrubStart });
      fireEvent.pointerDown(bar, { ...touch, clientX: 200 });
      expect(onSeek).not.toHaveBeenCalled();
      // Moved less than 6 px: still a tap.
      fireEvent.pointerMove(bar, { ...touch, clientX: 203, clientY: 14 });
      fireEvent.pointerUp(bar, { ...touch, clientX: 200 });
      expect(onSeek).toHaveBeenCalledOnce();
      expect(onSeek).toHaveBeenLastCalledWith(30);
      expect(onScrubStart).not.toHaveBeenCalled();
      expect(scrubber().hover).toBeNull();
    });

    it('drags once it has moved, showing the time under it while it does', () => {
      const onScrubStart = vi.fn();
      const onScrubEnd = vi.fn();
      const { bar, onSeek, scrubber } = renderBar({ onScrubStart, onScrubEnd });
      fireEvent.pointerDown(bar, { ...touch, clientX: 200 });
      fireEvent.pointerMove(bar, { ...touch, clientX: 300 });
      expect(onScrubStart).toHaveBeenCalledOnce();
      expect(onSeek).toHaveBeenLastCalledWith(60);
      expect(scrubber().hover).toEqual({ time: 60, fraction: 0.5 });
      fireEvent.pointerUp(bar, { ...touch, clientX: 300 });
      expect(onScrubEnd).toHaveBeenCalledOnce();
      expect(scrubber().hover).toBeNull();
    });

    it('does nothing when the browser takes it over for a scroll', () => {
      const { bar, onSeek } = renderBar();
      fireEvent.pointerDown(bar, { ...touch, clientX: 200 });
      fireEvent.pointerCancel(bar, { ...touch, clientX: 200 });
      fireEvent.pointerUp(bar, { ...touch, clientX: 200 });
      expect(onSeek).not.toHaveBeenCalled();
    });

    it('never hovers', () => {
      const { bar, scrubber } = renderBar();
      fireEvent.pointerMove(bar, { ...touch, clientX: 200 });
      expect(scrubber().hover).toBeNull();
    });
  });

  it('ends a drag when the bar loses its pointer, and when it goes away mid-drag', () => {
    const onScrubEnd = vi.fn();
    const { bar, unmount } = renderBar({ onScrubEnd });
    fireEvent.pointerDown(bar, { ...mouse, clientX: 200 });
    fireEvent.lostPointerCapture(bar, { ...mouse });
    expect(onScrubEnd).toHaveBeenCalledOnce();

    fireEvent.pointerDown(bar, { ...mouse, clientX: 200 });
    unmount();
    expect(onScrubEnd).toHaveBeenCalledTimes(2);
  });
});

describe('useMediaElement', () => {
  beforeEach(installMediaStubs);

  afterEach(() => {
    cleanup();
    removeMediaStubs();
  });

  /** A <video> wired by the hook, with what jsdom can't do (duration, buffering) set by the test. */
  function renderVideo() {
    const state: { current: MediaElementState | null } = { current: null };
    function Player() {
      const ref = useRef<HTMLVideoElement>(null);
      state.current = useMediaElement(ref);
      return <video ref={ref} data-testid="video" />;
    }
    render(<Player />);
    const video = screen.getByTestId<HTMLVideoElement>('video');
    let ranges: [number, number][] = [];
    Object.defineProperty(video, 'buffered', {
      configurable: true,
      get: () => ({
        length: ranges.length,
        start: (index: number) => ranges[index]?.[0] ?? 0,
        end: (index: number) => ranges[index]?.[1] ?? 0,
      }),
    });
    Object.defineProperty(video, 'paused', { configurable: true, get: () => !isPlaying(video) });
    let seeking = false;
    Object.defineProperty(video, 'seeking', { configurable: true, get: () => seeking });
    const fire = (type: string) => {
      act(() => {
        video.dispatchEvent(new Event(type));
      });
    };
    return {
      video,
      fire,
      media: () => {
        if (!state.current) throw new Error('No media');
        return state.current;
      },
      setDuration: (duration: number) => {
        Object.defineProperty(video, 'duration', { configurable: true, value: duration });
        fire('durationchange');
      },
      setBuffered: (next: [number, number][]) => {
        ranges = next;
        fire('progress');
      },
      setSeeking: (next: boolean) => {
        seeking = next;
      },
    };
  }

  it('reads the duration, the time and what’s buffered as the video says them', () => {
    const { video, fire, media, setDuration, setBuffered } = renderVideo();
    expect(media().duration).toBeNaN();
    setDuration(CLIP);
    expect(media().duration).toBe(CLIP);
    video.currentTime = 2;
    fire('timeupdate');
    expect(media().currentTime).toBe(2);
    setBuffered([
      [0, 1.5],
      [2.5, 3],
    ]);
    expect(media().buffered).toEqual([
      { start: 0, end: 1.5 },
      { start: 2.5, end: 3 },
    ]);
  });

  it('seeks, reporting the time asked for at once', () => {
    const { video, media } = renderVideo();
    act(() => {
      media().onSeek(3.1);
    });
    expect(video.currentTime).toBe(3.1);
    expect(media().currentTime).toBe(3.1);
  });

  it('holds a seek asked for while another is under way until that one lands', () => {
    const { video, fire, media, setSeeking } = renderVideo();
    act(() => {
      media().onSeek(1);
    });
    setSeeking(true);
    act(() => {
      media().onSeek(2);
      media().onSeek(3);
    });
    expect(video.currentTime).toBe(1);
    expect(media().currentTime).toBe(3);
    // The first seek lands: the latest one asked for goes next, and nothing in between.
    setSeeking(false);
    fire('seeked');
    expect(video.currentTime).toBe(3);
    fire('seeking');
    expect(media().currentTime).toBe(3);
  });

  it('pauses a playing video for a drag, and plays it again after', () => {
    const { video, media } = renderVideo();
    void video.play();
    act(() => {
      media().onScrubStart();
    });
    expect(isPlaying(video)).toBe(false);
    act(() => {
      media().onScrubEnd();
    });
    expect(isPlaying(video)).toBe(true);
  });

  it('leaves a paused video paused after a drag', () => {
    const { video, media } = renderVideo();
    act(() => {
      media().onScrubStart();
      media().onScrubEnd();
    });
    expect(isPlaying(video)).toBe(false);
    expect(media().currentTime).toBe(0);
  });

  it('reports the frame on screen while it plays, and ignores timeupdate meanwhile', () => {
    const { video, fire, media } = renderVideo();
    void video.play();
    fire('play');
    act(() => {
      paintFrame(video, 1.25);
    });
    expect(media().currentTime).toBe(1.25);
    // currentTime runs ahead of the frame on screen: timeupdate doesn't move the bar back and forth.
    video.currentTime = 1.27;
    fire('timeupdate');
    expect(media().currentTime).toBe(1.25);
    act(() => {
      paintFrame(video, 1.2917);
    });
    expect(media().currentTime).toBe(1.2917);

    video.pause();
    fire('pause');
    expect(media().currentTime).toBe(1.27);
    video.currentTime = 2;
    fire('timeupdate');
    expect(media().currentTime).toBe(2);
  });

  it('reports each animation frame while it plays where there’s no requestVideoFrameCallback', () => {
    Reflect.deleteProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback');
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => frames.push(callback));
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const { video, fire, media } = renderVideo();
    void video.play();
    fire('play');
    video.currentTime = 0.5;
    act(() => {
      frames.shift()?.(0);
    });
    expect(media().currentTime).toBe(0.5);
    expect(frames).toHaveLength(1);
    video.pause();
    fire('pause');
    expect(cancel).toHaveBeenCalled();
  });

  it('starts over when the video’s source changes', () => {
    const { video, fire, media, setDuration } = renderVideo();
    setDuration(CLIP);
    video.currentTime = 2;
    fire('timeupdate');
    Object.defineProperty(video, 'duration', { configurable: true, value: Number.NaN });
    video.currentTime = 0;
    fire('emptied');
    expect(media().duration).toBeNaN();
    expect(media().currentTime).toBe(0);
  });

  it('feeds useScrubber: a key seeks the video', () => {
    function Player() {
      const ref = useRef<HTMLVideoElement>(null);
      const scrubber = useScrubber({ ...useMediaElement(ref), fps: 24 });
      return (
        <>
          <video ref={ref} data-testid="video" />
          <div aria-label="Seek" {...scrubber.sliderProps} />
        </>
      );
    }
    render(<Player />);
    const video = screen.getByTestId<HTMLVideoElement>('video');
    Object.defineProperty(video, 'duration', { configurable: true, value: CLIP });
    act(() => {
      video.dispatchEvent(new Event('loadedmetadata'));
    });
    const bar = screen.getByRole('slider');
    fireEvent.keyDown(bar, { key: '.' });
    expect(video.currentTime).toBe(1.5 / 24);
    expectAriaState(bar, { valuetext: '1 frame of 5 seconds' });
    expect(media().pause).not.toHaveBeenCalled();
  });
});
