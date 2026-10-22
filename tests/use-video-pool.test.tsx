import { act, cleanup, render, renderHook } from '@testing-library/react';
import { useRef, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePooledVideo, useVideoPool, VideoPoolProvider } from '@/registry/hooks/use-video-pool';
import type { VideoPool } from '@/registry/lib/video-pool';
import { callsOn, installMediaStubs, media, paintFrame, removeMediaStubs } from './helpers/media';

const SRC = 'https://media.example.com/m/aaaaaaaaaa/v1/preview.mp4';

/** Counts the <video> elements made from now on. */
function countVideosMade() {
  const create = vi.spyOn(document, 'createElement');
  return () => create.mock.calls.filter(([tag]) => tag === 'video').length;
}

/** Reports the pool it gets, on every render. */
function Probe({ onPool }: { onPool: (pool: VideoPool | null) => void }) {
  onPool(useVideoPool());
  return null;
}

beforeEach(installMediaStubs);

afterEach(() => {
  // Unmounted first: the cards give their videos back, with the stubs still there.
  cleanup();
  removeMediaStubs();
});

describe('VideoPoolProvider', () => {
  it('makes its pool right after the first render, in a task of its own', async () => {
    const videosMade = countVideosMade();
    render(<VideoPoolProvider size={3}>content</VideoPoolProvider>);
    expect(videosMade()).toBe(0);
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(videosMade()).toBe(3);
  });

  it('makes none on the server, where nothing previews', () => {
    const videosMade = countVideosMade();
    expect(renderToString(<VideoPoolProvider size={3}>content</VideoPoolProvider>)).toBe('content');
    expect(videosMade()).toBe(0);
  });

  it('gives its pool to everything inside, and none outside', () => {
    const wrapper = ({ children }: { children: ReactNode }) => <VideoPoolProvider size={2}>{children}</VideoPoolProvider>;
    expect(renderHook(() => useVideoPool(), { wrapper }).result.current?.size).toBe(2);
    expect(renderHook(() => useVideoPool()).result.current).toBeNull();
  });

  it('makes a new pool when its size changes, and empties the old one', () => {
    const pools: (VideoPool | null)[] = [];
    const tree = (size: number) => (
      <VideoPoolProvider size={size}>
        <Probe onPool={(pool) => pools.push(pool)} />
      </VideoPoolProvider>
    );
    const { rerender } = render(tree(2));
    const first = pools.at(-1);
    const video = first?.acquire('a', SRC, document.body.appendChild(document.createElement('div')));
    rerender(tree(4));
    const second = pools.at(-1);
    expect(second).not.toBe(first);
    expect(second?.size).toBe(4);
    expect(video?.isConnected).toBe(false);
    expect(first?.liveCount()).toBe(0);
  });

  it('empties its videos when it unmounts', () => {
    const { result, unmount } = renderHook(() => useVideoPool(), {
      wrapper: ({ children }: { children: ReactNode }) => <VideoPoolProvider size={2}>{children}</VideoPoolProvider>,
    });
    const slot = document.body.appendChild(document.createElement('div'));
    const video = result.current?.acquire('a', SRC, slot);
    unmount();
    expect(video?.getAttribute('src')).toBeNull();
    expect(video?.isConnected).toBe(false);
  });
});

// A card's preview slot, as MediaCard uses the hook.
function Preview({
  since,
  onBlocked = () => undefined,
  onFirstFrame,
}: {
  since: number | null;
  onBlocked?: () => void;
  onFirstFrame?: (ms: number) => void;
}) {
  const slot = useRef<HTMLDivElement>(null);
  const showing = usePooledVideo(slot, 'aaaaaaaaaa', SRC, since, { onBlocked, onFirstFrame });
  return <div ref={slot} data-showing={showing} />;
}

function renderPreview(since: number | null, options: { onBlocked?: () => void; onFirstFrame?: (ms: number) => void } = {}) {
  const element = (value: number | null) => (
    <VideoPoolProvider size={2}>
      <Preview since={value} {...options} />
    </VideoPoolProvider>
  );
  const view = render(element(since));
  const slot = view.container.firstElementChild as HTMLElement;
  return { slot, rerender: (value: number | null) => { view.rerender(element(value)); } };
}

describe('usePooledVideo', () => {
  it('holds no video while nothing asks it to play', () => {
    const { slot } = renderPreview(null);
    expect(slot.querySelector('video')).toBeNull();
  });

  it('borrows a video from the pool, and shows it only once a frame is painted', () => {
    const onFirstFrame = vi.fn();
    const { slot } = renderPreview(performance.now(), { onFirstFrame });
    const video = slot.querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.getAttribute('src')).toBe(SRC);
    expect(slot.dataset.showing).toBe('false');

    act(() => {
      if (video) paintFrame(video);
    });
    expect(slot.dataset.showing).toBe('true');
    expect(onFirstFrame).toHaveBeenCalledOnce();
    expect(onFirstFrame.mock.calls[0]?.[0]).toBeGreaterThanOrEqual(0);
  });

  it('gives the video back, paused and still warm, when nothing asks any more', () => {
    const { slot, rerender } = renderPreview(performance.now());
    const video = slot.querySelector('video');
    act(() => {
      if (video) paintFrame(video);
    });
    media().pause.mockClear();

    rerender(null);
    expect(callsOn(media().pause, video)).toBeGreaterThan(0);
    expect(slot.dataset.showing).toBe('false');
    expect(video?.getAttribute('src')).toBe(SRC);
  });

  it('hides the video again for a new request until that one paints too', () => {
    const { slot, rerender } = renderPreview(100);
    const video = slot.querySelector('video');
    act(() => {
      if (video) paintFrame(video);
    });
    expect(slot.dataset.showing).toBe('true');
    rerender(200);
    expect(slot.dataset.showing).toBe('false');
    act(() => {
      if (video) paintFrame(video);
    });
    expect(slot.dataset.showing).toBe('true');
  });

  it('says so when the browser refuses to play', async () => {
    media().play.mockImplementationOnce(() =>
      Promise.reject(new DOMException('Low Power Mode', 'NotAllowedError')),
    );
    const onBlocked = vi.fn();
    renderPreview(performance.now(), { onBlocked });
    await vi.waitFor(() => {
      expect(onBlocked).toHaveBeenCalledOnce();
    });
  });

  it('plays nothing without a pool', () => {
    const { container } = render(<Preview since={performance.now()} />);
    expect(container.querySelector('video')).toBeNull();
  });
});
