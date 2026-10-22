import { act, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ReducedMotionProvider,
  useReducedMotion,
  type ReducedMotionSetting,
} from '@/registry/hooks/use-reduced-motion';
import { fakeMatchMedia, REDUCED_MOTION } from './helpers/match-media';

function under(...settings: ReducedMotionSetting[]) {
  // The first setting is the outermost provider.
  return function Wrapper({ children }: { children: ReactNode }) {
    return settings.reduceRight<ReactNode>(
      (inner, setting) => <ReducedMotionProvider reducedMotion={setting}>{inner}</ReducedMotionProvider>,
      children,
    );
  };
}

describe('useReducedMotion', () => {
  let media: ReturnType<typeof fakeMatchMedia> | undefined;

  afterEach(() => {
    media?.restore();
    media = undefined;
  });

  it('is false when the user has not asked for reduced motion', () => {
    media = fakeMatchMedia({ [REDUCED_MOTION]: false });
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('is true when the user has asked for reduced motion', () => {
    media = fakeMatchMedia({ [REDUCED_MOTION]: true });
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it('is false without matchMedia, as in jsdom, where an app’s own tests render its components', () => {
    // jsdom has none; Vitest's window answers undefined for it.
    expect(typeof window.matchMedia).not.toBe('function');
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('follows the setting when it changes while mounted', () => {
    media = fakeMatchMedia({ [REDUCED_MOTION]: false });
    const { result } = renderHook(() => useReducedMotion());

    act(() => {
      media?.set(REDUCED_MOTION, true);
    });
    expect(result.current).toBe(true);

    act(() => {
      media?.set(REDUCED_MOTION, false);
    });
    expect(result.current).toBe(false);
  });

  it('stops listening when unmounted', () => {
    media = fakeMatchMedia();
    const { unmount } = renderHook(() => useReducedMotion());
    expect(media.listenerCount(REDUCED_MOTION)).toBe(1);

    unmount();
    expect(media.listenerCount(REDUCED_MOTION)).toBe(0);
  });
});

describe('ReducedMotionProvider', () => {
  let media: ReturnType<typeof fakeMatchMedia> | undefined;

  afterEach(() => {
    media?.restore();
    media = undefined;
  });

  it('"always" reduces motion when the system does not ask for it', () => {
    media = fakeMatchMedia({ [REDUCED_MOTION]: false });
    const { result } = renderHook(() => useReducedMotion(), { wrapper: under('always') });
    expect(result.current).toBe(true);
  });

  it('"never" keeps full motion when the system asks for reduced motion', () => {
    media = fakeMatchMedia({ [REDUCED_MOTION]: true });
    const { result } = renderHook(() => useReducedMotion(), { wrapper: under('never') });
    expect(result.current).toBe(false);
  });

  it('"user" falls back to the system setting, and follows it live', () => {
    media = fakeMatchMedia({ [REDUCED_MOTION]: false });
    const { result } = renderHook(() => useReducedMotion(), { wrapper: under('user') });
    expect(result.current).toBe(false);

    act(() => {
      media?.set(REDUCED_MOTION, true);
    });
    expect(result.current).toBe(true);
  });

  it('defaults to "user"', () => {
    media = fakeMatchMedia({ [REDUCED_MOTION]: true });
    const { result } = renderHook(() => useReducedMotion(), {
      wrapper: ({ children }) => <ReducedMotionProvider>{children}</ReducedMotionProvider>,
    });
    expect(result.current).toBe(true);
  });

  it('lets the nearest provider win when they nest', () => {
    media = fakeMatchMedia({ [REDUCED_MOTION]: false });
    expect(renderHook(() => useReducedMotion(), { wrapper: under('always', 'never') }).result.current).toBe(false);
    expect(renderHook(() => useReducedMotion(), { wrapper: under('never', 'always') }).result.current).toBe(true);
  });

  it('goes back to the system setting under a nested "user"', () => {
    media = fakeMatchMedia({ [REDUCED_MOTION]: false });
    const { result } = renderHook(() => useReducedMotion(), { wrapper: under('always', 'user') });
    expect(result.current).toBe(false);
  });

  it('re-renders its components when its setting changes', () => {
    media = fakeMatchMedia({ [REDUCED_MOTION]: false });
    function Probe() {
      return <output>{useReducedMotion() ? 'reduced' : 'full'}</output>;
    }

    const { rerender } = render(
      <ReducedMotionProvider reducedMotion="always">
        <Probe />
      </ReducedMotionProvider>,
    );
    expect(screen.getByRole('status').textContent).toBe('reduced');

    rerender(
      <ReducedMotionProvider reducedMotion="user">
        <Probe />
      </ReducedMotionProvider>,
    );
    expect(screen.getByRole('status').textContent).toBe('full');
  });

  it('does not listen to the system while it overrides the setting', () => {
    media = fakeMatchMedia();
    renderHook(() => useReducedMotion(), { wrapper: under('always') });
    expect(media.listenerCount(REDUCED_MOTION)).toBe(0);

    // So it works where there's no matchMedia at all, as in jsdom.
    media.restore();
    media = undefined;
    expect(renderHook(() => useReducedMotion(), { wrapper: under('never') }).result.current).toBe(false);
  });
});
