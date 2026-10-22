'use client';

import dynamic from 'next/dynamic';

// Every docs page is the same Next.js route, and a route loads the client code of every client
// component its pages import. So pages don't import their playgrounds: each one is a dynamic
// import here, in a client component, which Next.js splits into its own chunk and loads only on
// the page that renders it. It still renders on the server, into the HTML.
const demos = {
  'compare-slider': dynamic(() => import('./demos/compare-slider').then((module) => module.CompareSliderDemo)),
  'aspect-ratio-picker': dynamic(() =>
    import('./demos/aspect-ratio-picker').then((module) => module.AspectRatioPickerDemo),
  ),
  'model-picker': dynamic(() => import('./demos/model-picker').then((module) => module.ModelPickerDemo)),
  'prompt-composer': dynamic(() =>
    import('./demos/prompt-composer').then((module) => module.PromptComposerDemo),
  ),
  'generation-queue': dynamic(() =>
    import('./demos/generation-queue').then((module) => module.GenerationQueueDemo),
  ),
  'generation-card': dynamic(() =>
    import('./demos/generation-card').then((module) => module.GenerationCardDemo),
  ),
  'denoise-reveal': dynamic(() => import('./demos/denoise-reveal').then((module) => module.DenoiseRevealDemo)),
  'media-grid': dynamic(() => import('./demos/media-grid').then((module) => module.MediaGridDemo)),
  'media-card': dynamic(() => import('./demos/media-card').then((module) => module.MediaCardDemo)),
  'video-scrubber': dynamic(() => import('./demos/video-scrubber').then((module) => module.VideoScrubberDemo)),
  'camera-motion-picker': dynamic(() =>
    import('./demos/camera-motion-picker').then((module) => module.CameraMotionPickerDemo),
  ),
  'use-reduced-motion': dynamic(() =>
    import('./demos/use-reduced-motion').then((module) => module.UseReducedMotionDemo),
  ),
};

type DemoName = keyof typeof demos;

function isDemoName(name: string): name is DemoName {
  return Object.hasOwn(demos, name);
}

/** An item's playground, from components/docs/demos/<name>.tsx: `<Demo name="compare-slider" />`. */
export function Demo({ name }: { name: string }) {
  if (!isDemoName(name)) throw new Error(`No demo named "${name}": add it to components/docs/demo.tsx`);
  const Component = demos[name];
  return <Component />;
}
