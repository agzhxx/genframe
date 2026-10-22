'use client';

import dynamic from 'next/dynamic';

// The home page's Studio, loaded as the docs' playgrounds are (components/docs/demo.tsx): the server
// renders its HTML in place, so it's there at the first paint and nothing moves, and its code is a
// chunk of its own that the page asks for at low priority, after the stylesheet and the font the
// first paint needs (docs/PERF.md, M7).
export const LazyStudio = dynamic(() => import('./studio').then((module) => module.Studio));
