type ChangeListener = (event: MediaQueryListEvent) => void;

export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/**
 * Replaces `window.matchMedia` (jsdom has none) with one the test controls. `set` changes a
 * query's result and notifies its listeners, the way a browser does when the OS setting changes.
 */
export function fakeMatchMedia(initial: Record<string, boolean> = {}) {
  const results = new Map(Object.entries(initial));
  const listeners = new Map<string, Set<ChangeListener>>();
  // jsdom has no matchMedia: Vitest's window has an accessor for it that returns undefined.
  const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');

  function listenersOf(query: string) {
    let set = listeners.get(query);
    if (!set) {
      set = new Set();
      listeners.set(query, set);
    }
    return set;
  }

  const matchMedia = (query: string) =>
    // Only the members our code uses; the deprecated addListener API is left out on purpose.
    ({
      media: query,
      get matches() {
        return results.get(query) ?? false;
      },
      onchange: null,
      addEventListener: (_type: 'change', listener: ChangeListener) => {
        listenersOf(query).add(listener);
      },
      removeEventListener: (_type: 'change', listener: ChangeListener) => {
        listenersOf(query).delete(listener);
      },
    }) as unknown as MediaQueryList;
  // Defined, not assigned: assigning would go through that accessor's setter, which keeps the
  // fake around after `restore` puts the accessor back.
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: matchMedia });

  return {
    set(query: string, matches: boolean) {
      results.set(query, matches);
      const event = { matches, media: query } as MediaQueryListEvent;
      for (const listener of listenersOf(query)) listener(event);
    },
    listenerCount(query: string) {
      return listenersOf(query).size;
    },
    restore() {
      if (original) Object.defineProperty(window, 'matchMedia', original);
      else Reflect.deleteProperty(window, 'matchMedia');
    },
  };
}
