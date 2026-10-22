// The video pool (spec section 5: never above its size, steals the least recently used one). The
// first tests are Generation Feed's, written before its pool from the rules in its spec; the
// sequence at the end checks the two rules against a model of the pool over many random steps.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVideoPool, defaultPoolSize, type VideoPool } from '@/registry/lib/video-pool';
import { callsOn, installMediaStubs, media, paintFrame, removeMediaStubs } from './helpers/media';

let pool: VideoPool | undefined;

function slot(): HTMLDivElement {
  return document.body.appendChild(document.createElement('div'));
}

const src = (card: string) => `https://media.example.com/m/${card}/preview.mp4`;

function use(size: number) {
  pool = createVideoPool(size);
  return pool;
}

beforeEach(installMediaStubs);

afterEach(() => {
  pool?.dispose();
  pool = undefined;
  removeMediaStubs();
  document.body.innerHTML = '';
});

describe('createVideoPool', () => {
  it('makes videos that are muted, inline, looping, hidden and never picture-in-picture', () => {
    const video = use(2).acquire('a', src('a'), slot());
    expect(video.muted).toBe(true);
    expect(video.playsInline).toBe(true);
    expect(video.loop).toBe(true);
    expect(video.hasAttribute('disablepictureinpicture')).toBe(true);
    expect(video.getAttribute('aria-hidden')).toBe('true');
    expect(video.tabIndex).toBe(-1);
  });

  it('moves a video into the card’s slot on acquire, loads the card’s source and plays it', () => {
    const target = slot();
    const pool = use(2);
    const video = pool.acquire('a', src('a'), target);
    expect(video.parentElement).toBe(target);
    expect(video.getAttribute('src')).toBe(src('a'));
    expect(video.preload).toBe('auto');
    expect(callsOn(media().play, video)).toBe(1);
    expect(pool.liveCount()).toBe(1);
  });

  it('lends a free video before taking one from another card', () => {
    const pool = use(2);
    const a = pool.acquire('a', src('a'), slot());
    const b = pool.acquire('b', src('b'), slot());
    expect(a).not.toBe(b);
    expect(pool.steals()).toBe(0);
  });

  it('never makes more than `size` videos, however many cards ask', () => {
    const create = vi.spyOn(document, 'createElement');
    const pool = use(3);
    const videos = new Set<HTMLVideoElement>();
    for (let card = 0; card < 20; card++) {
      videos.add(pool.acquire(`card${String(card)}`, src(`card${String(card)}`), slot()));
      pool.release(`card${String(card)}`);
      expect(pool.liveCount()).toBeLessThanOrEqual(3);
    }
    expect(videos.size).toBe(3);
    expect(create.mock.calls.filter(([tag]) => tag === 'video')).toHaveLength(3);
  });

  it('pauses the video on release but keeps its source: the card stays warm', () => {
    const pool = use(2);
    const video = pool.acquire('a', src('a'), slot());
    pool.release('a');
    expect(callsOn(media().pause, video)).toBeGreaterThan(0);
    expect(video.getAttribute('src')).toBe(src('a'));
    expect(pool.liveCount()).toBe(1);
  });

  it('gives a warm card its own video back without loading it again', () => {
    const pool = use(3);
    const first = pool.acquire('a', src('a'), slot());
    pool.release('a');
    pool.acquire('b', src('b'), slot());
    pool.release('b');
    const loads = callsOn(media().load, first);

    const again = pool.acquire('a', src('a'), slot());
    expect(again).toBe(first);
    expect(again.getAttribute('src')).toBe(src('a'));
    expect(callsOn(media().load, first)).toBe(loads);
    expect(pool.steals()).toBe(0);
  });

  it('steals the least recently used video when every one is taken', () => {
    const pool = use(2);
    const a = pool.acquire('a', src('a'), slot());
    pool.release('a');
    const b = pool.acquire('b', src('b'), slot());
    pool.release('b');

    const c = pool.acquire('c', src('c'), slot());
    expect(c).toBe(a); // "a" was used longest ago
    expect(c).not.toBe(b);
    expect(c.getAttribute('src')).toBe(src('c'));
    expect(pool.steals()).toBe(1);
  });

  it('counts a warm card’s return as a use: the other one is stolen next', () => {
    const pool = use(2);
    const a = pool.acquire('a', src('a'), slot());
    pool.release('a');
    const b = pool.acquire('b', src('b'), slot());
    pool.release('b');
    pool.acquire('a', src('a'), slot());
    pool.release('a');
    expect(pool.acquire('c', src('c'), slot())).toBe(b);
    expect(pool.acquire('a', src('a'), slot())).toBe(a);
  });

  it('frees the decoder before a steal: pause, remove the source, load()', () => {
    const pool = use(1);
    const video = pool.acquire('a', src('a'), slot());
    pool.release('a');
    const calls: string[] = [];
    media().pause.mockImplementation(() => void calls.push('pause'));
    media().load.mockImplementation(() => void calls.push(`load (src: ${String(video.getAttribute('src'))})`));

    pool.acquire('b', src('b'), slot());
    expect(calls.slice(0, 2)).toEqual(['pause', 'load (src: null)']);
  });

  it('prefers stealing an idle video over a playing one', () => {
    const pool = use(2);
    const playing = pool.acquire('a', src('a'), slot()); // used first, still playing
    const idle = pool.acquire('b', src('b'), slot());
    pool.release('b');
    expect(pool.acquire('c', src('c'), slot())).toBe(idle);
    expect(pool.acquire('a', src('a'), slot())).toBe(playing);
  });

  it('takes the least recently used one when every video is playing, and tells that card', () => {
    const pool = use(2);
    const onLost = vi.fn();
    const a = pool.acquire('a', src('a'), slot(), { onLost });
    pool.acquire('b', src('b'), slot());
    expect(pool.acquire('c', src('c'), slot())).toBe(a);
    expect(onLost).toHaveBeenCalledOnce();
  });

  it('calls onFirstFrame only when a frame is actually painted', () => {
    const onFirstFrame = vi.fn();
    const video = use(2).acquire('a', src('a'), slot(), { onFirstFrame });
    expect(onFirstFrame).not.toHaveBeenCalled();
    paintFrame(video);
    expect(onFirstFrame).toHaveBeenCalledOnce();
  });

  it('cancels onFirstFrame on a release before the first frame', () => {
    const pool = use(2);
    const onFirstFrame = vi.fn();
    const video = pool.acquire('a', src('a'), slot(), { onFirstFrame });
    pool.release('a');
    paintFrame(video);
    expect(onFirstFrame).not.toHaveBeenCalled();
  });

  it('falls back to loadeddata without requestVideoFrameCallback', () => {
    Reflect.deleteProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback');
    const onFirstFrame = vi.fn();
    const video = use(2).acquire('a', src('a'), slot(), { onFirstFrame });
    video.dispatchEvent(new Event('loadeddata'));
    expect(onFirstFrame).toHaveBeenCalledOnce();
  });

  it('reports a refused play(), and not an interrupted one', async () => {
    const pool = use(2);
    const onPlayRejected = vi.fn();
    media().play.mockImplementationOnce(() =>
      Promise.reject(new DOMException('Low Power Mode', 'NotAllowedError')),
    );
    pool.acquire('a', src('a'), slot(), { onPlayRejected });
    media().play.mockImplementationOnce(() =>
      Promise.reject(new DOMException('pause() interrupted play()', 'AbortError')),
    );
    const interrupted = vi.fn();
    pool.acquire('b', src('b'), slot(), { onPlayRejected: interrupted });

    await vi.waitFor(() => {
      expect(onPlayRejected).toHaveBeenCalledOnce();
    });
    expect(interrupted).not.toHaveBeenCalled();
  });

  it('pauses every video while the tab is hidden, and resumes the ones in use when it’s back', () => {
    const pool = use(2);
    const playing = pool.acquire('a', src('a'), slot());
    pool.acquire('b', src('b'), slot());
    pool.release('b');
    const setHidden = (hidden: boolean) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
      document.dispatchEvent(new Event('visibilitychange'));
    };

    media().pause.mockClear();
    setHidden(true);
    expect(media().pause).toHaveBeenCalledTimes(2);

    media().play.mockClear();
    setHidden(false);
    expect(media().play).toHaveBeenCalledOnce();
    expect(media().play.mock.contexts[0]).toBe(playing);
    Reflect.deleteProperty(document, 'hidden');
  });

  it('starts and pauses every video not in use on the first click, once', () => {
    const pool = use(3);
    const playing = pool.acquire('a', src('a'), slot());
    const play = media().play;
    const pause = media().pause;
    play.mockClear();
    pause.mockClear();

    document.body.click();
    expect(play).toHaveBeenCalledTimes(2);
    expect(play.mock.contexts).not.toContain(playing);
    expect(pause.mock.contexts).toEqual(play.mock.contexts);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('waits for the next touch after one the browser doesn’t count as a click (a scroll)', () => {
    use(2);
    const activation = { isActive: false };
    Object.defineProperty(navigator, 'userActivation', { configurable: true, get: () => activation });
    const play = media().play;

    document.dispatchEvent(new Event('touchend'));
    expect(play).not.toHaveBeenCalled();

    activation.isActive = true;
    document.dispatchEvent(new Event('touchend'));
    expect(play).toHaveBeenCalledTimes(2);
    Reflect.deleteProperty(navigator, 'userActivation');
  });

  it('empties every video and stops listening on dispose', () => {
    const pool = use(2);
    const video = pool.acquire('a', src('a'), slot());
    pool.dispose();
    expect(video.getAttribute('src')).toBeNull();
    expect(video.isConnected).toBe(false);
    expect(pool.liveCount()).toBe(0);
    media().play.mockClear();
    document.body.click();
    expect(media().play).not.toHaveBeenCalled();
  });

  it('keeps both rules over a long random run: never above its size, and steals the least recently used', () => {
    const size = 3;
    const pool = use(size);
    // A model of the pool: which card each video holds and when it was last used.
    const model = new Map<HTMLVideoElement, { card: string; inUse: boolean; used: number }>();
    let clock = 0;
    let seed = 7;
    const random = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };

    for (let step = 0; step < 2000; step++) {
      const card = `card${String(random(40))}`;
      if (random(3) === 0) {
        pool.release(card);
        for (const entry of model.values()) {
          if (entry.card === card && entry.inUse) Object.assign(entry, { inUse: false, used: ++clock });
        }
        continue;
      }
      const own = [...model.entries()].find(([, entry]) => entry.card === card)?.[0];
      const idle = [...model.entries()].filter(([, entry]) => !entry.inUse);
      const oldest = (entries: typeof idle) => entries.reduce((a, b) => (b[1].used < a[1].used ? b : a))[0];
      const expected =
        own ?? (model.size < size ? undefined : oldest(idle.length > 0 ? idle : [...model.entries()]));

      const video = pool.acquire(card, src(card), slot());
      if (expected !== undefined) expect(video, `step ${String(step)}`).toBe(expected);
      model.set(video, { card, inUse: true, used: ++clock });
      expect(model.size).toBeLessThanOrEqual(size);
      expect(pool.liveCount()).toBeLessThanOrEqual(size);
    }
    expect(pool.steals()).toBeGreaterThan(100);
  });
});

describe('defaultPoolSize', () => {
  it('is 6 on a mouse-driven device with enough memory, or memory unknown', () => {
    expect(defaultPoolSize({ touch: false, deviceMemory: 8 })).toBe(6);
    expect(defaultPoolSize({ touch: false })).toBe(6);
  });

  it('is 2 on a touch screen, or with 4 GB of memory or less', () => {
    expect(defaultPoolSize({ touch: true, deviceMemory: 8 })).toBe(2);
    expect(defaultPoolSize({ touch: false, deviceMemory: 4 })).toBe(2);
  });
});
