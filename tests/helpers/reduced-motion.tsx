import { act, render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { onTestFinished } from 'vitest';
import { ReducedMotionProvider, type ReducedMotionSetting } from '@/registry/hooks/use-reduced-motion';
import { fakeMatchMedia, REDUCED_MOTION } from './match-media';

/**
 * Renders `ui` under a ReducedMotionProvider, as an app's own motion setting would. With
 * "always" or "never", components don't read the system setting, so jsdom needs no matchMedia.
 */
export function renderWithReducedMotion(
  ui: ReactElement,
  reducedMotion: ReducedMotionSetting,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <ReducedMotionProvider reducedMotion={reducedMotion}>{children}</ReducedMotionProvider>;
  }
  return render(ui, { ...options, wrapper: Wrapper });
}

/**
 * Sets the operating system's reduced-motion setting for the rest of the test (through
 * fakeMatchMedia) and puts matchMedia back when the test ends. `set` changes it mid-test, as a
 * user switching the setting would.
 */
export function mockSystemReducedMotion(reduce: boolean) {
  const media = fakeMatchMedia({ [REDUCED_MOTION]: reduce });
  onTestFinished(() => {
    media.restore();
  });
  return {
    set(next: boolean) {
      act(() => {
        media.set(REDUCED_MOTION, next);
      });
    },
  };
}
