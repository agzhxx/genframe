import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mediaCardButtonKeyboard, mediaCardKeyboard, mediaCardPlayKeyboard } from '@/content/keyboard/media-card';
import type { ReducedMotionSetting } from '@/registry/hooks/use-reduced-motion';
import { VideoPoolProvider } from '@/registry/hooks/use-video-pool';
import { MediaCard, type GetMediaUrl, type MediaCardProps, type MediaItem } from '@/registry/ui/media-card/media-card';
import { expectAriaState, expectRole } from './helpers/aria';
import { testKeyboardMap } from './helpers/keyboard';
import { installMediaStubs, isPlaying, media, paintFrame, removeMediaStubs } from './helpers/media';
import { renderWithReducedMotion } from './helpers/reduced-motion';

// Two of Generation Feed's worlds: a 3:4 image and a 16:9 clip, with their ThumbHashes.
const image: MediaItem = {
  id: '169qh68dam',
  kind: 'image',
  width: 1536,
  height: 2048,
  thumbhash: 'lNcJHQbHaXqGKSjniHB5iAdxdgCH',
  alt: 'A hot air balloon being inflated in a field at blue hour',
};
const video: MediaItem = {
  id: '5blmqndubp',
  kind: 'video',
  width: 1280,
  height: 720,
  thumbhash: 'jwcKFII5Z2iIiXZweHdKgMAUCA==',
  alt: 'A glowing whale swimming across the night sky. Video, 5 seconds.',
};

const origin = 'https://media.example.com';
const getMediaUrl: GetMediaUrl = (item, request) =>
  request.type === 'preview'
    ? item.kind === 'video'
      ? `${origin}/m/${item.id}/preview.mp4`
      : undefined
    : `${origin}/m/${item.id}/${String(request.width)}.${request.format}`;

interface Options {
  reducedMotion?: ReducedMotionSetting;
  /** Under a VideoPoolProvider, as cards need for previews. */
  pool?: boolean;
  /** Something before the card, to Tab from. */
  before?: boolean;
}

function card(props: Partial<MediaCardProps>) {
  return <MediaCard item={image} getMediaUrl={getMediaUrl} href={`/m/${(props.item ?? image).id}`} {...props} />;
}

function renderCard(props: Partial<MediaCardProps> = {}, { reducedMotion = 'never', pool = true, before = false }: Options = {}) {
  const wrap = (ui: ReactElement) => (
    <>
      {before ? <button type="button">Before</button> : null}
      {pool ? <VideoPoolProvider size={2}>{ui}</VideoPoolProvider> : ui}
    </>
  );
  const view = renderWithReducedMotion(wrap(card(props)), reducedMotion);
  const root = view.container.querySelector<HTMLElement>('[data-slot="media-card"]');
  const link = view.container.querySelector<HTMLElement>('[data-slot="media-card-link"]');
  const media = view.container.querySelector<HTMLElement>('[data-slot="media-card-media"]');
  if (!root || !link || !media) throw new Error('No card');
  return {
    ...view,
    root,
    link,
    media,
    poster: () => view.container.querySelector<HTMLImageElement>('[data-slot="media-card-poster"]'),
    preview: () => view.container.querySelector<HTMLElement>('[data-slot="media-card-preview"]'),
    placeholder: () => view.container.querySelector<HTMLImageElement>('[data-slot="media-card-placeholder"]'),
    previewState: () =>
      isPlaying(view.container.querySelector<HTMLVideoElement>('[data-slot="media-card-preview"] video'))
        ? 'playing'
        : 'idle',
    rerenderCard: (next: Partial<MediaCardProps>) => {
      view.rerender(wrap(card(next)));
    },
  };
}

beforeEach(installMediaStubs);

afterEach(() => {
  // Unmounted first: the cards give their videos back, with the stubs still there.
  cleanup();
  removeMediaStubs();
  vi.useRealTimers();
});

describe('MediaCard', () => {
  it('is a link named by its alt text', () => {
    const { link } = renderCard();
    expectRole(link, 'link', image.alt);
    expect(link.getAttribute('href')).toBe('/m/169qh68dam');
  });

  it('offers every format at every width that exists, from your URL builder', () => {
    const { container, poster } = renderCard({ sizes: '25vw' });
    const sources = [...container.querySelectorAll('source')];
    expect(sources.map((source) => source.getAttribute('type'))).toEqual(['image/avif']);
    expect(sources[0]?.getAttribute('srcset')).toBe(
      [320, 480, 640, 960, 1280].map((width) => `${origin}/m/169qh68dam/${String(width)}.avif ${String(width)}w`).join(', '),
    );
    expect(sources[0]?.getAttribute('sizes')).toBe('25vw');
    // The last format is the <img>'s, for browsers that take no <source>.
    expect(poster()?.getAttribute('srcset')).toContain(`${origin}/m/169qh68dam/960.webp 960w`);
    expect(poster()?.getAttribute('src')).toBe(`${origin}/m/169qh68dam/640.webp`);
    expect(poster()?.getAttribute('sizes')).toBe('25vw');
  });

  it('never asks for a poster wider than its source, but always for the smallest', () => {
    const { poster } = renderCard({ item: { ...image, width: 300 }, formats: ['webp'], widths: [640, 320] });
    expect(poster()?.getAttribute('srcset')).toBe(`${origin}/m/169qh68dam/320.webp 320w`);
  });

  it('skips what your URL builder doesn’t have', () => {
    const { container, poster } = renderCard({
      getMediaUrl: (item, request) =>
        request.type === 'poster' && request.format === 'webp' && request.width <= 480
          ? `${origin}/${item.id}-${String(request.width)}.webp`
          : undefined,
    });
    expect(container.querySelectorAll('source')).toHaveLength(0);
    expect(poster()?.getAttribute('srcset')).toBe(
      `${origin}/169qh68dam-320.webp 320w, ${origin}/169qh68dam-480.webp 480w`,
    );
  });

  it('shows the ThumbHash first, then fades the poster in once it loads', () => {
    const { placeholder, poster } = renderCard();
    expect(placeholder()?.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    expect(placeholder()?.getAttribute('alt')).toBe('');
    expect(poster()?.className).toContain('opacity-0');
    expect(poster()?.getAttribute('loading')).toBe('lazy');
    fireEvent.load(poster() ?? document.body);
    expect(poster()?.className).not.toContain('opacity-0');
  });

  it('with the color placeholder, as in server HTML, shows the average color and a poster that needs no JavaScript', () => {
    const { media, placeholder, poster } = renderCard({ placeholder: 'color' });
    expect(placeholder()).toBeNull();
    expect(media.style.backgroundColor).toMatch(/^rgb\(/);
    // Even a lazy poster must not wait for a load event that never fires without JavaScript.
    expect(poster()?.className).not.toContain('opacity-0');
  });

  it('shows shadcn’s muted color with no placeholder, or no ThumbHash', () => {
    for (const props of [{ placeholder: 'none' as const }, { item: { ...image, thumbhash: undefined } }]) {
      const { media, placeholder, unmount } = renderCard(props);
      expect(placeholder()).toBeNull();
      expect(media.className).toContain('bg-muted');
      unmount();
    }
  });

  it('loads the page’s largest poster eagerly with high priority, without a fade', () => {
    const { poster } = renderCard({ priority: 'high' });
    expect(poster()?.getAttribute('loading')).toBe('eager');
    expect(poster()?.getAttribute('fetchpriority')).toBe('high');
    expect(poster()?.className).not.toContain('opacity-0');
  });

  it('leaves the poster out with showPoster={false}, the placeholder showing', () => {
    const { poster, placeholder } = renderCard({ showPoster: false });
    expect(poster()).toBeNull();
    expect(placeholder()).not.toBeNull();
  });

  it('keeps a poster that fails to load out, and offers to retry', () => {
    const { poster, placeholder } = renderCard();
    fireEvent.error(poster() ?? document.body);
    expect(poster()).toBeNull();
    expect(placeholder()).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry loading image' }));
    expect(poster()).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry loading image' })).toBeNull();
  });

  it('takes the media’s shape, or the ratio you give it, or fills its container', () => {
    expect(renderCard().media.style.aspectRatio).toBe(`${String(1536 / 2048)} / 1`);
    cleanup();
    expect(renderCard({ ratio: 16 / 9 }).media.style.aspectRatio).toBe(`${String(16 / 9)} / 1`);
    cleanup();
    const filled = renderCard({ fill: true });
    expect(filled.media.style.aspectRatio).toBe('');
    expect(filled.root.className).toContain('size-full');
  });

  it('calls onOpen for a plain click instead of following the link', () => {
    const onOpen = vi.fn();
    const { link } = renderCard({ onOpen });
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(onOpen).toHaveBeenCalledWith(image, link);
  });

  it('keeps the link’s own behavior for Ctrl, Cmd and Shift clicks (a new tab or window)', () => {
    const onOpen = vi.fn();
    const { link } = renderCard({ onOpen });
    for (const modifier of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }]) {
      const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...modifier });
      link.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(false);
    }
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('is a button without a link, named by its caption and described, busy while you say so', async () => {
    const onOpen = vi.fn();
    const { link, rerenderCard } = renderCard({
      href: undefined,
      item: { ...video, alt: '' },
      onOpen,
      caption: <span>07-medium Kling 2.5</span>,
      description: 'AI-generated, 5 seconds. Enter adds it at the playhead.',
    });
    expectRole(link, 'button', '07-medium Kling 2.5');
    expect(link.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(link.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'AI-generated, 5 seconds. Enter adds it at the playhead.',
    );
    await userEvent.setup().click(link);
    expect(onOpen).toHaveBeenCalledWith({ ...video, alt: '' }, link);
    expectAriaState(link, { busy: null });
    rerenderCard({ href: undefined, item: { ...video, alt: '' }, onOpen, busy: true });
    expectAriaState(link, { busy: true });
  });

  it('passes its other attributes to its link or button, and its class to its box', () => {
    const onPointerDown = vi.fn();
    const { link, root } = renderCard({ className: 'w-60' }, {});
    expect(root.className).toContain('w-60');
    cleanup();
    const view = renderWithReducedMotion(
      <MediaCard item={image} getMediaUrl={getMediaUrl} onPointerDown={onPointerDown} data-testid="card" />,
      'never',
    );
    fireEvent.pointerDown(screen.getByTestId('card'));
    expect(onPointerDown).toHaveBeenCalledOnce();
    expect(view.container.querySelector('[data-testid="card"]')?.tagName).toBe('BUTTON');
    expect(link.tagName).toBe('A');
  });

  describe('a video', () => {
    it('plays its preview from the pool once the pointer rests on it, and stops when it leaves', () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const { link, previewState } = renderCard({ item: video });
      expect(previewState()).toBe('idle');

      fireEvent.pointerEnter(link, { pointerType: 'mouse' });
      act(() => {
        vi.advanceTimersByTime(99);
      });
      expect(previewState()).toBe('idle');
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(previewState()).toBe('playing');

      fireEvent.pointerLeave(link);
      expect(previewState()).toBe('idle');
    });

    it('shows the preview only once its first frame is painted, and says how long that took', () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const onPreviewStart = vi.fn();
      const { link, preview } = renderCard({ item: video, onPreviewStart });
      fireEvent.pointerEnter(link, { pointerType: 'mouse' });
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(preview()?.className).toContain('opacity-0');
      const element = preview()?.querySelector('video');
      expect(element?.getAttribute('src')).toBe(`${origin}/m/5blmqndubp/preview.mp4`);
      act(() => {
        if (element) paintFrame(element);
      });
      expect(preview()?.className).not.toContain('opacity-0');
      expect(onPreviewStart).toHaveBeenCalledOnce();
      expect(onPreviewStart.mock.calls[0]?.[0]).toBe(video);
      expect(onPreviewStart.mock.calls[0]?.[1]).toBeGreaterThanOrEqual(0);
    });

    it('plays while it has keyboard focus, and not after a click', async () => {
      const user = userEvent.setup();
      const { link, previewState } = renderCard({ item: video }, { before: true });
      await user.tab();
      await user.tab();
      expect(document.activeElement).toBe(link);
      await waitFor(() => {
        expect(previewState()).toBe('playing');
      });
      await user.tab({ shift: true });
      expect(previewState()).toBe('idle');

      // A click focuses the card too, but only the pointer resting on it plays it.
      await user.click(link);
      fireEvent.pointerLeave(link);
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(document.activeElement).toBe(link);
      expect(previewState()).toBe('idle');
    });

    it('doesn’t start by itself on a touch, but does from previewSince', () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const { link, previewState, rerenderCard } = renderCard({ item: video });
      fireEvent.pointerEnter(link, { pointerType: 'touch' });
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(previewState()).toBe('idle');

      rerenderCard({ item: video, previewSince: 123 });
      expect(previewState()).toBe('playing');
    });

    it('offers a play button instead with autoplay off, as with Save-Data', () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const { link, previewState } = renderCard({ item: video, autoplay: false });
      fireEvent.pointerEnter(link, { pointerType: 'mouse' });
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(previewState()).toBe('idle');

      const play = screen.getByRole('button', { name: 'Play preview' });
      expectAriaState(play, { pressed: false });
      fireEvent.click(play);
      expect(previewState()).toBe('playing');
      expectAriaState(screen.getByRole('button', { name: 'Pause preview' }), { pressed: true });
      fireEvent.click(screen.getByRole('button', { name: 'Pause preview' }));
      expect(previewState()).toBe('idle');
    });

    it('falls back to its play button when the browser refuses to play', async () => {
      media().play.mockImplementationOnce(() =>
        Promise.reject(new DOMException('Low Power Mode', 'NotAllowedError')),
      );
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const { link } = renderCard({ item: video });
      expect(screen.queryByRole('button', { name: 'Play preview' })).toBeNull();
      fireEvent.pointerEnter(link, { pointerType: 'mouse' });
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(await screen.findByRole('button', { name: 'Play preview' })).toBeTruthy();
    });

    it('doesn’t play while paused, even hovered, and plays again after', () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const { link, previewState, rerenderCard } = renderCard({ item: video });
      fireEvent.pointerEnter(link, { pointerType: 'mouse' });
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(previewState()).toBe('playing');
      rerenderCard({ item: video, paused: true });
      expect(previewState()).toBe('idle');
      rerenderCard({ item: video });
      expect(previewState()).toBe('playing');
    });

    it('has no preview and no play button without a pool', () => {
      const { preview } = renderCard({ item: video, autoplay: false }, { pool: false });
      expect(preview()).toBeNull();
      expect(screen.queryByRole('button')).toBeNull();
    });
  });

  it('never gives an image a preview or a play button', () => {
    const { preview } = renderCard({ autoplay: false });
    expect(preview()).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  describe('with reduced motion', () => {
    it('plays nothing by itself: a play button instead, and the preview appears without a fade', () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const { root, link, preview, previewState } = renderCard({ item: video }, { reducedMotion: 'always' });
      expect(root.dataset.motion).toBe('reduce');
      fireEvent.pointerEnter(link, { pointerType: 'mouse' });
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(previewState()).toBe('idle');
      fireEvent.click(screen.getByRole('button', { name: 'Play preview' }));
      expect(previewState()).toBe('playing');
      expect(preview()?.className).toContain('in-data-[motion=reduce]:transition-none');
    });

    it('fades a lazy poster in over the fast duration instead of the base one', () => {
      const full = renderCard({}, { reducedMotion: 'never' });
      expect(full.root.dataset.motion).toBeUndefined();
      expect(full.poster()?.className).toContain('duration-(--genframe-duration-base)');
      expect(full.poster()?.className).toContain('in-data-[motion=reduce]:duration-(--genframe-duration-fast)');
      cleanup();
      const reduced = renderCard({}, { reducedMotion: 'always' });
      expect(reduced.root.dataset.motion).toBe('reduce');
    });
  });

  describe('keyboard', () => {
    describe('on a card with a link', () => {
      testKeyboardMap(mediaCardKeyboard, {
        setup: () => {
          const onOpen = vi.fn();
          const view = renderCard({ item: video, onOpen, autoplay: false });
          return { ...view, onOpen, target: view.link };
        },
        expectations: {
          open: ({ onOpen, link }) => {
            expect(onOpen).toHaveBeenCalledWith(video, link);
          },
          next: () => {
            expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Play preview' }));
          },
        },
      });
    });

    describe('on a card without a link', () => {
      testKeyboardMap(mediaCardButtonKeyboard, {
        setup: () => {
          const onOpen = vi.fn();
          const view = renderCard({ href: undefined, onOpen });
          return { ...view, onOpen, target: view.link };
        },
        expectations: {
          open: ({ onOpen, link }) => {
            expect(onOpen).toHaveBeenCalledWith(image, link);
          },
        },
      });
    });

    describe('on the play button', () => {
      testKeyboardMap(mediaCardPlayKeyboard, {
        setup: () => {
          const view = renderCard({ item: video, autoplay: false });
          return { ...view, target: screen.getByRole('button', { name: 'Play preview' }) };
        },
        expectations: {
          play: ({ previewState }) => {
            expect(previewState()).toBe('playing');
            expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Pause preview' }));
          },
        },
      });
    });
  });
});
