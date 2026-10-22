'use client';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { lazy, type ReactNode } from 'react';

// The search dialog with its engine and the code that draws its results: about 40 KB gzip that
// no page needs to show itself. Loaded the way Fumadocs loads its own default dialog, after the
// page's code, so the first paint doesn't wait for it (docs/PERF.md, M8).
const SearchDialog = lazy(() => import('@/components/search'));

export function Provider({ children }: { children: ReactNode }) {
  return (
    <RootProvider search={{ SearchDialog }} theme={{ enabled: false }}>
      {children}
    </RootProvider>
  );
}
