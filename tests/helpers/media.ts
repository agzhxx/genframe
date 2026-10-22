import { vi, type MockInstance } from 'vitest';

// jsdom can't play media. installMediaStubs() stubs play, pause and load, keeps track of which
// videos are playing (isPlaying), and records requestVideoFrameCallback, so a test can "paint a
// frame" with paintFrame(video). From Generation Feed's tests of the video pool.

type FrameCallback = VideoFrameRequestCallback;
const frameCallbacks = new Map<HTMLVideoElement, Map<number, FrameCallback>>();
let nextFrameId = 1;
let playing = new WeakSet<HTMLMediaElement>();

/** The stubs on every media element: their calls, and `mock.contexts` says which element. */
export interface MediaSpies {
  play: MockInstance<HTMLMediaElement['play']>;
  pause: MockInstance<HTMLMediaElement['pause']>;
  load: MockInstance<HTMLMediaElement['load']>;
}

let spies: MediaSpies | null = null;

export function installMediaStubs(): void {
  playing = new WeakSet();
  spies = {
    play: vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
      playing.add(this);
      return Promise.resolve();
    }),
    pause: vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
      playing.delete(this);
    }),
    load: vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(function (this: HTMLMediaElement) {
      playing.delete(this);
    }),
  };
  frameCallbacks.clear();
  Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', {
    configurable: true,
    value(this: HTMLVideoElement, callback: FrameCallback) {
      const id = nextFrameId++;
      const callbacks = frameCallbacks.get(this) ?? new Map<number, FrameCallback>();
      callbacks.set(id, callback);
      frameCallbacks.set(this, callbacks);
      return id;
    },
  });
  Object.defineProperty(HTMLVideoElement.prototype, 'cancelVideoFrameCallback', {
    configurable: true,
    value(this: HTMLVideoElement, id: number) {
      frameCallbacks.get(this)?.delete(id);
    },
  });
}

/** The stubs installMediaStubs put in place. */
export function media(): MediaSpies {
  if (!spies) throw new Error('Call installMediaStubs first');
  return spies;
}

/** How many times `spy` was called on `element`. */
export function callsOn(spy: MockInstance, element: HTMLMediaElement | null | undefined) {
  return spy.mock.contexts.filter((context) => context === element).length;
}

export function removeMediaStubs(): void {
  spies = null;
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback');
  Reflect.deleteProperty(HTMLVideoElement.prototype, 'cancelVideoFrameCallback');
}

/**
 * Fires every pending frame callback of this video, as if a frame reached the screen: the frame at
 * `mediaTime`, the video's time unless told.
 */
export function paintFrame(video: HTMLVideoElement, mediaTime = video.currentTime): void {
  const callbacks = frameCallbacks.get(video) ?? new Map<number, FrameCallback>();
  frameCallbacks.set(video, new Map());
  const metadata = { mediaTime } as VideoFrameCallbackMetadata;
  for (const callback of callbacks.values()) callback(performance.now(), metadata);
}

/** Whether play() was the last of play, pause and load called on this video. */
export function isPlaying(video: HTMLMediaElement | null | undefined): boolean {
  return video ? playing.has(video) : false;
}
