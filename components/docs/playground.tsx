'use client';

import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { SwitchControl } from '@/components/docs/controls';
import { cn } from '@/lib/utils';
import { ReducedMotionProvider, useReducedMotion } from '@/registry/hooks/use-reduced-motion';

interface PlaygroundProps {
  /** Names the playground for assistive technology: "CompareSlider demo". */
  title: string;
  /** The live demo. */
  children: ReactNode;
  /** Controls for the demo, beside it (below it on narrow screens). */
  controls?: ReactNode;
  /** Gives the demo the full width, with the controls below it, for wide components. */
  wide?: boolean;
  /** More controls for the toolbar, after the two motion switches. */
  toolbar?: ReactNode;
}

/**
 * A docs page's live demo: the preview, a toolbar with the two motion toggles every page has, and
 * an optional controls panel. Render the parts that animate as children (or inside `controls`),
 * so they're inside the toolbar's settings.
 *
 * - Slow motion (0.25×) puts `data-slow-motion` on the preview. app/global.css redefines the
 *   motion tokens there at four times their length, and everything inside inherits them.
 * - Reduced motion wraps the demo in a ReducedMotionProvider. The switch starts at the system
 *   setting; once flipped, the provider says "always" or "never".
 */
export function Playground({ title, children, controls, wide = false, toolbar }: PlaygroundProps) {
  const hydrated = useHydrated();
  const system = useReducedMotion();
  const [reduced, setReduced] = useState<boolean | null>(null);
  const [slow, setSlow] = useState(false);

  return (
    <section
      aria-label={title}
      data-hydrated={hydrated ? '' : undefined}
      className="not-prose my-6 overflow-hidden rounded-xl border bg-card"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b px-4 py-2.5">
        <SwitchControl label="Slow motion (0.25×)" checked={slow} onCheckedChange={setSlow} />
        <SwitchControl label="Reduced motion" checked={reduced ?? system} onCheckedChange={setReduced} />
        {toolbar}
      </div>
      <ReducedMotionProvider reducedMotion={reduced === null ? 'user' : reduced ? 'always' : 'never'}>
        <div className={cn('grid', controls && !wide && 'md:grid-cols-[minmax(0,1fr)_16rem]')}>
          <div
            data-slow-motion={slow ? '' : undefined}
            className="flex min-h-48 items-center justify-center bg-background p-6"
          >
            {children}
          </div>
          {controls ? (
            <div className={cn('border-t p-4', !wide && 'md:border-t-0 md:border-l')}>{controls}</div>
          ) : null}
        </div>
      </ReducedMotionProvider>
    </section>
  );
}

function subscribeToNothing() {
  return () => undefined;
}

/**
 * False in the server's HTML and while React hydrates it, true from then on. A playground's code
 * loads after the page, and until it has hydrated its HTML doesn't respond; `data-hydrated` tells
 * the end-to-end tests when it does.
 */
function useHydrated() {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}
