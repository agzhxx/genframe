import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef, useRef } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { mediaGridKeyboard } from '@/content/keyboard/media-grid';
import { ReducedMotionProvider, type ReducedMotionSetting } from '@/registry/hooks/use-reduced-motion';
import { VideoPoolProvider } from '@/registry/hooks/use-video-pool';
import { cardAspect, cardBox, gridLayout, placeCards } from '@/registry/lib/masonry-layout';
import type { GetMediaUrl, MediaItem } from '@/registry/ui/media-card/media-card';
import { MediaGrid, type MediaGridHandle, type MediaGridProps } from '@/registry/ui/media-grid/media-grid';
import { fakeMatchMedia } from './helpers/match-media';
import { testKeyboardMap } from './helpers/keyboard';
import { installMediaStubs, isPlaying, removeMediaStubs } from './helpers/media';

const origin = 'https://media.example.com';
const getMediaUrl: GetMediaUrl = (item, request) =>
  request.type === 'preview'
    ? item.kind === 'video'
      ? `${origin}/m/${item.id}/preview.mp4`
      : undefined
    : `${origin}/m/${item.id}/${String(request.width)}.${request.format}`;

/** Items in a few shapes, every fourth a video; ids are their numbers: "000", "001"… */
function makeItems(count: number, { videos = true } = {}): MediaItem[] {
  const shapes = [
    [1536, 2048],
    [2048, 1152],
    [2048, 2048],
    [1152, 2048],
  ] as const;
  return Array.from({ length: count }, (_, index) => {
    const [width, height] = shapes[index % shapes.length] ?? [1, 1];
    return {
      id: String(index).padStart(3, '0'),
      kind: videos && index % 4 === 3 ? 'video' : 'image',
      width,
      height,
      thumbhash: 'lNcJHQbHaXqGKSjniHB5iAdxdgCH',
      alt: `Item ${String(index + 1)}`,
    };
  });
}

// jsdom lays nothing out and has no ResizeObserver: the grid gets a width, and these observers
// report it when a test says so, as a browser's would once the grid is on the page.
const observers = new Set<{ callback: ResizeObserverCallback }>();
class FakeResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe() {
    observers.add(this);
  }
  unobserve() {}
  disconnect() {
    observers.delete(this);
  }
}

function measure() {
  act(() => {
    for (const observer of observers) observer.callback([], observer as unknown as ResizeObserver);
  });
}

/** Where card `index` of `items` starts in a grid 1,024 px wide, in pixels from the grid's top. */
function topOf(items: readonly MediaItem[], index: number) {
  const layout = gridLayout(1024);
  const aspects = items.map((item) => cardAspect(item.width, item.height));
  const placement = placeCards(aspects, layout.lanes)[index];
  if (!placement) throw new Error(`No card ${String(index)}`);
  return cardBox(placement, aspects[index] ?? 1, layout).top;
}

let windowScrollTo: MockInstance<typeof window.scrollTo>;

function scrollWindow(top: number) {
  act(() => {
    window.scrollY = top;
    window.dispatchEvent(new Event('scroll'));
  });
  // The grid reads the scroll position in the next animation frame.
  act(() => {
    vi.advanceTimersByTime(20);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  installMediaStubs();
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1024);
  Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 0 });
  windowScrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(((options: ScrollToOptions) => {
    window.scrollY = options.top ?? 0;
  }) as typeof window.scrollTo);
});

afterEach(() => {
  cleanup();
  observers.clear();
  removeMediaStubs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.scrollY = 0;
  document.documentElement.style.scrollPaddingTop = '';
});

function grid(props: Partial<MediaGridProps>, reducedMotion: ReducedMotionSetting = 'never') {
  return (
    <ReducedMotionProvider reducedMotion={reducedMotion}>
      <VideoPoolProvider size={2}>
        <MediaGrid
          items={makeItems(40)}
          getMediaUrl={getMediaUrl}
          getHref={(item) => `/m/${item.id}`}
          aria-label="Worlds"
          {...props}
        />
      </VideoPoolProvider>
    </ReducedMotionProvider>
  );
}

function renderGrid(props: Partial<MediaGridProps> = {}, reducedMotion: ReducedMotionSetting = 'never') {
  const view = render(grid(props, reducedMotion));
  const list = () => screen.getByRole('list', { name: 'Worlds' });
  return {
    ...view,
    list,
    items: () => screen.getAllByRole('listitem'),
    card: (position: number) => view.container.querySelector<HTMLElement>(`[aria-posinset="${String(position)}"]`),
    rerenderGrid: (next: Partial<MediaGridProps>) => {
      view.rerender(grid(next, reducedMotion));
    },
  };
}

describe('MediaGrid', () => {
  describe('before it knows its width', () => {
    it('places its first cards with CSS of its own, scoped to it, as a list', () => {
      const { list, items, container } = renderGrid({ items: makeItems(60), total: 340 });
      expect(list().dataset.layout).toBe('css');
      // The first 40 cards, each knowing where it goes at every lane count.
      expect(items()).toHaveLength(40);
      expect(items()[0]?.getAttribute('aria-posinset')).toBe('1');
      expect(items()[0]?.getAttribute('aria-setsize')).toBe('340');
      expect(items()[1]?.style.getPropertyValue('--l0')).toBe('1');
      const style = container.querySelector('style')?.textContent ?? '';
      expect(style).toContain(`[data-media-grid="${String(list().dataset.mediaGrid)}"]{container-type:inline-size}`);
      expect(style).toContain('@container (width >= 1440px)');
      expect(container.querySelector<HTMLElement>('[data-slot="media-grid-spacer"]')?.style.getPropertyValue('--h0')).toMatch(
        /^calc\(max\(/,
      );
    });

    it('gives only the first screen its posters, and every card its average color', () => {
      const { container } = renderGrid();
      expect(container.querySelectorAll('img')).toHaveLength(12);
      const media = container.querySelectorAll<HTMLElement>('[data-slot="media-card-media"]');
      expect([...media].every((element) => element.style.backgroundColor.startsWith('rgb('))).toBe(true);
      expect(container.querySelectorAll('[data-slot="media-card-placeholder"]')).toHaveLength(0);
    });

    it('loads the first row eagerly and the priority poster first', () => {
      const { container } = renderGrid({ priorityIndex: 3 });
      const loading = [...container.querySelectorAll('img')].map((img) => img.getAttribute('loading'));
      expect(loading.slice(0, 6)).toEqual(['eager', 'eager', 'eager', 'eager', 'eager', 'eager']);
      expect(loading.slice(6)).toEqual(['lazy', 'lazy', 'lazy', 'lazy', 'lazy', 'lazy']);
      expect(container.querySelectorAll('img[fetchpriority="high"]')).toHaveLength(1);
      expect(container.querySelector('[aria-posinset="4"] img')?.getAttribute('fetchpriority')).toBe('high');
    });

    it('renders the same on the server, with no pool needed there', () => {
      const html = renderToString(grid({}));
      expect(html).toContain('data-layout="css"');
      expect(html).toContain('<style>');
      expect(html).not.toContain('<video');
    });
  });

  describe('once it knows its width', () => {
    it('places cards in pixels and keeps only those within about a screen of the view', () => {
      const { list, items, card } = renderGrid({ items: makeItems(200) });
      measure();
      expect(list().dataset.layout).toBe('pixels');
      // 1,024 px: four lanes of 246 px, so the 768 px window and a screen below it hold a few rows.
      expect(card(1)?.style.width).toBe('246px');
      expect(card(1)?.style.transform).toBe('translate(8px, 8px)');
      expect(items().length).toBeGreaterThan(8);
      expect(items().length).toBeLessThan(60);
      expect(card(200)).toBeNull();
      expect(parseFloat(list().style.height)).toBeGreaterThan(5000);
    });

    it('brings in the cards around the view as it scrolls, and lets the ones far above go', () => {
      const { card } = renderGrid({ items: makeItems(200) });
      measure();
      expect(card(150)).toBeNull();
      scrollWindow(topOf(makeItems(200), 149) - 300);
      expect(card(1)).toBeNull();
      expect(card(150)).not.toBeNull();
    });

    it('keeps the cards it places: more items never move the ones before', () => {
      const { card, rerenderGrid } = renderGrid({ items: makeItems(40) });
      measure();
      const before = card(20)?.style.transform;
      rerenderGrid({ items: makeItems(80) });
      expect(card(20)?.style.transform).toBe(before);
    });

    it('lets the cards that came with the page keep their average color; later ones get the blur', () => {
      const ref = createRef<MediaGridHandle>();
      const { container } = renderGrid({ ref, items: makeItems(60) });
      measure();
      const placeholder = (position: number) =>
        container.querySelector(`[aria-posinset="${String(position)}"] [data-slot="media-card-placeholder"]`);
      expect(placeholder(1)).toBeNull();
      act(() => {
        ref.current?.reveal(55);
      });
      expect(placeholder(56)?.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    });

    it('asks for more as its end comes near, while there’s more', () => {
      const onEndReached = vi.fn();
      const { rerenderGrid } = renderGrid({ items: makeItems(40), hasMore: false, onEndReached });
      measure();
      expect(onEndReached).not.toHaveBeenCalled();
      rerenderGrid({ items: makeItems(40), hasMore: true, onEndReached });
      expect(onEndReached).toHaveBeenCalled();
    });

    it('ends every lane in a placeholder while the next page loads', () => {
      const { list, container, rerenderGrid } = renderGrid({ items: makeItems(40) });
      measure();
      expect(container.querySelectorAll('[data-slot="media-grid-skeleton"]')).toHaveLength(0);
      const height = parseFloat(list().style.height);
      rerenderGrid({ items: makeItems(40), hasMore: true, loadingMore: true });
      const skeletons = container.querySelectorAll('[data-slot="media-grid-skeleton"]');
      expect(skeletons).toHaveLength(4);
      expect(skeletons[0]?.getAttribute('aria-hidden')).toBe('true');
      expect(parseFloat(list().style.height)).toBeGreaterThan(height);
    });

    it('follows lane steps of your own', () => {
      const { card, container } = renderGrid({
        lanes: [
          { minWidth: 0, lanes: 2, gap: 0 },
          { minWidth: 900, lanes: 8, gap: 4 },
        ],
      });
      expect(container.querySelector('style')?.textContent).toContain('@container (width >= 900px)');
      measure();
      // 1,024 px: eight lanes of (1,024 - 9 × 4) / 8 = 123.5 px.
      expect(card(1)?.style.width).toBe('123.5px');
      expect(card(2)?.style.transform).toBe('translate(131.5px, 4px)');
    });

    it('doesn’t render its cards again on every scroll frame', () => {
      const renderOverlay = vi.fn((item: MediaItem) => <span>{item.id}</span>);
      renderGrid({ items: makeItems(200), renderOverlay });
      measure();
      const calls = renderOverlay.mock.calls.length;
      scrollWindow(10);
      scrollWindow(20);
      expect(renderOverlay.mock.calls.length).toBe(calls);
    });
  });

  describe('reveal', () => {
    it('scrolls a card that isn’t mounted into the middle of the view, and returns its link', () => {
      const ref = createRef<MediaGridHandle>();
      const { card } = renderGrid({ ref });
      measure();
      expect(card(40)).toBeNull();
      const revealed: (HTMLElement | null | undefined)[] = [];
      act(() => {
        revealed.push(ref.current?.reveal(39));
      });
      expect(windowScrollTo).toHaveBeenCalled();
      expect(revealed[0]?.getAttribute('href')).toBe('/m/039');
    });

    it('leaves a card that’s in view where it is', () => {
      const ref = createRef<MediaGridHandle>();
      renderGrid({ ref });
      measure();
      act(() => {
        ref.current?.reveal(0);
      });
      expect(windowScrollTo).not.toHaveBeenCalled();
    });

    it('keeps it clear of a sticky header: the scroller’s scroll-padding-top', () => {
      const ref = createRef<MediaGridHandle>();
      renderGrid({ ref });
      measure();
      act(() => {
        ref.current?.reveal(39);
      });
      const plain = window.scrollY;
      document.documentElement.style.scrollPaddingTop = '100px';
      window.scrollY = 0;
      act(() => {
        ref.current?.reveal(39);
      });
      // The room below the header is 100 px shorter, so the card's middle sits 50 px further down.
      expect(window.scrollY).toBe(plain - 50);
    });
  });

  describe('in a scroll container', () => {
    function Scrolling(props: Partial<MediaGridProps>) {
      const scroller = useRef<HTMLDivElement>(null);
      return (
        <div ref={scroller} data-testid="scroller" style={{ height: 600, overflowY: 'auto' }}>
          {grid({ ...props, scrollRef: scroller })}
        </div>
      );
    }

    it('shows the cards around what the container shows, and scrolls it to reveal one', () => {
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
      const ref = createRef<MediaGridHandle>();
      const view = render(<Scrolling items={makeItems(200)} ref={ref} />);
      measure();
      const scroller = screen.getByTestId('scroller');
      const card = (position: number) => view.container.querySelector(`[aria-posinset="${String(position)}"]`);
      expect(card(150)).toBeNull();
      act(() => {
        scroller.scrollTop = topOf(makeItems(200), 149) - 300;
        scroller.dispatchEvent(new Event('scroll'));
      });
      act(() => {
        vi.advanceTimersByTime(20);
      });
      expect(card(1)).toBeNull();
      expect(card(150)).not.toBeNull();

      const scrollTo = vi.fn((options: ScrollToOptions) => {
        scroller.scrollTop = options.top ?? 0;
      });
      scroller.scrollTo = scrollTo as typeof scroller.scrollTo;
      act(() => {
        ref.current?.reveal(2);
      });
      expect(scrollTo).toHaveBeenCalled();
      expect(windowScrollTo).not.toHaveBeenCalled();
      expect(card(3)).not.toBeNull();
    });
  });

  describe('cards', () => {
    it('link to getHref, open with onOpen, and show your overlay', () => {
      const onOpen = vi.fn();
      renderGrid({
        onOpen,
        renderOverlay: (item) => (
          <span aria-hidden="true" data-testid="badge">
            {item.kind}
          </span>
        ),
      });
      const link = screen.getByRole('link', { name: 'Item 1' });
      expect(link.getAttribute('href')).toBe('/m/000');
      fireEvent.click(link);
      expect(onOpen).toHaveBeenCalledWith(makeItems(1)[0], link);
      expect(screen.getAllByTestId('badge')).toHaveLength(40);
    });

    it('are buttons without getHref', () => {
      const onOpen = vi.fn();
      renderGrid({ getHref: undefined, onOpen });
      fireEvent.click(screen.getByRole('button', { name: 'Item 2' }));
      expect(onOpen).toHaveBeenCalledWith(makeItems(2)[1], screen.getByRole('button', { name: 'Item 2' }));
    });

    it('don’t preview while the grid is paused', () => {
      const { card, rerenderGrid } = renderGrid({});
      measure();
      const link = card(4)?.querySelector('a');
      if (!link) throw new Error('No video card');
      fireEvent.pointerEnter(link, { pointerType: 'mouse' });
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(isPlaying(card(4)?.querySelector('video'))).toBe(true);
      rerenderGrid({ paused: true });
      expect(isPlaying(card(4)?.querySelector('video'))).toBe(false);
    });
  });

  describe('on a touch screen', () => {
    const touchScreen = () => fakeMatchMedia({ '(pointer: coarse)': true });

    it('plays the video nearest the middle of the screen once scrolling stops', () => {
      const media = touchScreen();
      const { card } = renderGrid({ items: makeItems(40) });
      measure();
      act(() => {
        vi.advanceTimersByTime(149);
      });
      const playing = () =>
        [...document.querySelectorAll<HTMLElement>('[role="listitem"]')]
          .filter((item) => isPlaying(item.querySelector('video')))
          .map((item) => item.getAttribute('aria-posinset'));
      expect(playing()).toEqual([]);
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(playing()).toHaveLength(1);
      expect(card(Number(playing()[0]))?.querySelector('[data-kind="video"]')).not.toBeNull();
      media.restore();
    });

    it('plays nothing by itself with reduced motion, or autoplay off', () => {
      const media = touchScreen();
      for (const [props, reduced] of [
        [{}, 'always'],
        [{ autoplay: false }, 'never'],
      ] as const) {
        render(grid({ items: makeItems(40), ...props }, reduced));
        measure();
        act(() => {
          vi.advanceTimersByTime(500);
        });
        expect([...document.querySelectorAll('video')].filter((video) => isPlaying(video))).toEqual([]);
        expect(screen.getAllByRole('button', { name: 'Play preview' }).length).toBeGreaterThan(0);
        cleanup();
      }
      media.restore();
    });
  });

  describe('with reduced motion', () => {
    it('offers play buttons instead of previews on hover', () => {
      const { card } = renderGrid({}, 'always');
      measure();
      const link = card(4)?.querySelector('a');
      if (!link) throw new Error('No video card');
      fireEvent.pointerEnter(link, { pointerType: 'mouse' });
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(card(4)?.querySelector('video')).toBeNull();
      fireEvent.click(screen.getAllByRole('button', { name: 'Play preview' })[0] ?? document.body);
      expect(isPlaying(card(4)?.querySelector('video'))).toBe(true);
    });
  });

  describe('keyboard', () => {
    testKeyboardMap(mediaGridKeyboard, {
      setup: () => {
        const onOpen = vi.fn();
        renderGrid({ items: makeItems(12, { videos: false }), onOpen });
        measure();
        return { onOpen, target: screen.getByRole('link', { name: 'Item 2' }) };
      },
      expectations: {
        next: () => {
          expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Item 3' }));
        },
        previous: () => {
          expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Item 1' }));
        },
        open: ({ onOpen, target }) => {
          expect(onOpen).toHaveBeenCalledWith(makeItems(2, { videos: false })[1], target);
        },
      },
    });
  });
});
