import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { followClock, syncVideos, type Playback } from '@/registry/ui/compare-slider/video-sync';

const playing: Playback = { time: 2, duration: 5, paused: false, rate: 1, seeking: false, loop: false };
const at = (time: number, changes: Partial<Playback> = {}): Playback => ({ ...playing, time, ...changes });

describe('followClock', () => {
  it('keeps the clock’s rate while the follower is within a frame', () => {
    expect(followClock(at(2), at(2.02))).toEqual({});
    expect(followClock(at(2), at(1.98, { rate: 1.1 }))).toEqual({ rate: 1 });
  });

  it('speeds the follower up when it falls behind, and slows it down when it gets ahead', () => {
    expect(followClock(at(2), at(1.9)).rate).toBeCloseTo(1.1);
    expect(followClock(at(2), at(2.1)).rate).toBeCloseTo(0.9);
    // Relative to the clock's own rate.
    expect(followClock(at(2, { rate: 2 }), at(1.9, { rate: 2 })).rate).toBeCloseTo(2.2);
  });

  it('jumps to the clock when the follower is a quarter of a second or more off', () => {
    expect(followClock(at(2), at(1.7))).toEqual({ seekTo: 2 });
    expect(followClock(at(2), at(2.5, { rate: 0.9 }))).toEqual({ seekTo: 2, rate: 1 });
  });

  it('measures looping videos around the loop', () => {
    const looping = { loop: true };
    expect(followClock(at(0.02, looping), at(4.99, looping))).toEqual({});
    // Without looping, the end of the clip is far from its start.
    expect(followClock(at(0.02), at(4.99))).toEqual({ seekTo: 0.02 });
  });

  it('shows the clock’s exact frame while paused', () => {
    expect(followClock(at(2, { paused: true }), at(2.01, { paused: true }))).toEqual({ seekTo: 2 });
    expect(followClock(at(2, { paused: true }), at(2.0005, { paused: true }))).toEqual({});
  });

  it('waits while either video is seeking', () => {
    expect(followClock(at(2, { seeking: true }), at(1))).toEqual({});
    expect(followClock(at(2), at(1, { seeking: true }))).toEqual({});
  });
});

// A video as the sync code sees it: setting currentTime starts a seek, play and pause change
// `paused` at once and fire their events a moment later, the way browsers do.
class FakeVideo extends EventTarget {
  duration = 5;
  paused = true;
  playbackRate = 1;
  seeking = false;
  loop = false;
  seeks: number[] = [];
  #time = 0;

  get currentTime() {
    return this.#time;
  }

  set currentTime(time: number) {
    this.#time = time;
    this.seeks.push(time);
    this.seeking = true;
    this.#fire('seeking');
  }

  play() {
    if (this.paused) {
      this.paused = false;
      this.#fire('play');
      this.#fire('playing');
    }
    return Promise.resolve();
  }

  pause() {
    if (!this.paused) {
      this.paused = true;
      this.#fire('pause');
    }
  }

  /** The seek ends and the frame shows. */
  finishSeek() {
    this.seeking = false;
    this.dispatchEvent(new Event('seeked'));
  }

  /** Time passes while it plays. */
  advance(seconds: number) {
    this.#time += seconds * this.playbackRate;
  }

  #fire(type: string) {
    queueMicrotask(() => this.dispatchEvent(new Event(type)));
  }
}

// Events arrive in microtasks; this lets them all run.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('syncVideos', () => {
  let frames: FrameRequestCallback[] = [];
  let clock: FakeVideo;
  let follower: FakeVideo;
  let stop: () => void;

  function nextFrame() {
    const callbacks = frames;
    frames = [];
    for (const callback of callbacks) callback(performance.now());
  }

  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
    vi.stubGlobal('cancelAnimationFrame', () => {
      frames = [];
    });
    clock = new FakeVideo();
    follower = new FakeVideo();
    stop = syncVideos(clock, follower);
  });

  afterEach(() => {
    stop();
    vi.unstubAllGlobals();
  });

  it('plays and pauses both, from either video', async () => {
    await clock.play();
    await settle();
    expect(follower.paused).toBe(false);

    follower.pause();
    await settle();
    expect(clock.paused).toBe(true);
  });

  it('seeks both, from either video, without passing its own seeks back', async () => {
    clock.currentTime = 3;
    await settle();
    expect(follower.seeks).toEqual([3]);

    follower.finishSeek();
    clock.finishSeek();
    follower.currentTime = 1.5;
    await settle();
    expect(clock.seeks).toEqual([3, 1.5]);
    expect(follower.seeks).toEqual([3, 1.5]);
  });

  it('nudges the follower when it drifts while playing, on the next frame', async () => {
    await clock.play();
    await settle();
    clock.advance(0.1);
    nextFrame();
    expect(follower.playbackRate).toBeCloseTo(1.1);
    expect(follower.seeks).toEqual([]);

    follower.advance(0.1);
    nextFrame();
    expect(follower.playbackRate).toBe(1);
  });

  it('moves the follower, never the clock, to fix a large drift', async () => {
    await clock.play();
    await settle();
    clock.advance(0.5);
    nextFrame();
    expect(follower.seeks).toEqual([0.5]);

    // The clock plays on while the follower seeks; the follower's seek isn't passed back.
    clock.advance(0.05);
    await settle();
    expect(clock.seeks).toEqual([]);
  });

  it('lines up the paused frame', async () => {
    await clock.play();
    await settle();
    clock.advance(1.02);
    follower.advance(1);
    clock.pause();
    await settle();
    expect(follower.paused).toBe(true);
    expect(follower.currentTime).toBe(1.02);
  });

  it('lets go when stopped', async () => {
    stop();
    await clock.play();
    await settle();
    expect(follower.paused).toBe(true);
    expect(frames).toEqual([]);
  });
});
