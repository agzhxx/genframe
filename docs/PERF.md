# Performance log

Every optimization gets a before and after number here.

## M0 baseline

Measured on 2026-10-20 on the M0 build (Next.js 16.4.2, React 19.3.1, Fumadocs 16.17.7):
`pnpm build`, then each file gzipped with Node's default level.

### Registry items

Each item's own code, gzipped. The size check and the budgets arrive in M1 (spec section 7),
set from the first real measurement; until then these numbers are the record.

| Item | gzip | raw | npm packages it brings |
| --- | --- | --- | --- |
| `use-reduced-motion` | 438 B | 850 B | none |

### Docs site

The scripts and stylesheets each page's HTML loads. This is the docs site, not the Kit: the
items people install don't carry Next.js or Fumadocs. The target is LCP ≤ 2.5 s on mobile
(spec section 2), measured with Lighthouse CI from M8; the site is static HTML, so the text
paints before this JS runs.

| Page | JS gzip | JS raw | scripts | CSS gzip |
| --- | --- | --- | --- | --- |
| Home (`/`) | 300.2 KB | 916.5 KB | 14 | 17.3 KB |
| Getting started (`/docs/`) | 318.6 KB | 969.8 KB | 16 | 17.3 KB |

## M1 · sizes and budgets

Measured on 2026-10-20 on the M1 build. From M1 on, the size check (`pnpm sizes`, in CI) measures
each item the way an app ships it: its own files bundled and minified by esbuild 0.28.2, plus the
CSS it writes, gzipped with Node's default level. React, shadcn's parts and other Genframe items
aren't counted. M0's number was the raw source file gzipped, so the two
aren't comparable: the hook is smaller now (330 B against 438 B) although it gained the provider.

Budgets are the first measurement plus 10%, rounded up to the next 100 B; CI fails above them.

| Item | gzip | minified | budget | npm packages it brings |
| --- | --- | --- | --- | --- |
| `use-reduced-motion` (hook + `ReducedMotionProvider`) | 330 B | 582 B | 400 B | none |
| `motion-tokens` (CSS only) | 104 B | 120 B | 200 B | none |

### Docs site

Measured as in M0: the scripts and stylesheets each page's HTML loads, each gzipped.

| Page | JS gzip | JS raw | scripts | CSS gzip |
| --- | --- | --- | --- | --- |
| Home (`/`) | 300.3 KB | 916.5 KB | 14 | 17.7 KB |
| Getting started (`/docs/`) | 336.4 KB | 1,017.4 KB | 17 | 17.7 KB |
| useReducedMotion (`/docs/utilities/use-reduced-motion/`) | 336.4 KB | 1,017.4 KB | 17 | 17.7 KB |

Every docs page now loads 17.8 KB gzip more than M0's Getting started (318.6 KB), because the
docs route loads the client code of every page. Almost all of it is one 16.9 KB chunk with the
playground, Radix's switch and label, the first demo and the hook; the props table is 0.9 KB
(measured by building without fumadocs-typescript). Loading each page's MDX on its own is the
fix; it was left as a known limit (M2 fixed it, below).

## M2 · per-page loading, sizes and budgets

Measured on 2026-10-20 by `node scripts/page-weights.ts` on `pnpm build`'s output: the scripts and
stylesheets each page's HTML references, in tags or in the inline React Server Components payload,
each gzipped with Node's default level. KB are 1,024 bytes, as in M0 and M1; the script gives M1's
numbers exactly.

### Each docs page loads only its own playground

Before: the M1 build. After: the same build with the fix (`components/docs/demo.tsx`, which loads
each playground with `next/dynamic`), nothing else changed.

| Page | JS gzip before | JS gzip after |
| --- | --- | --- |
| Home (`/`) | 300.3 KB | 300.3 KB |
| Getting started, Changelog, Components, Motion tokens | 336.4 KB | 321.0 KB |
| useReducedMotion (has a playground) | 336.4 KB | 338.0 KB |

Pages without a playground load 15.4 KB less. The page with one loads 1.6 KB more: its playground is
now a chunk of its own, which compresses a little worse. fumadocs-mdx's `async` option, tried
first, changed nothing. In Chrome, Getting started doesn't fetch the playground's
chunk, not even after it prefetches the pages it links to. Without the fix, M2's three playgrounds
would put 342.0 KB on every docs page (measured by importing them statically).

### Docs site

| Page | JS gzip | JS raw | scripts | CSS gzip |
| --- | --- | --- | --- | --- |
| Home (`/`) | 300.2 KB | 916.5 KB | 14 | 18.8 KB |
| Getting started (`/docs/`), Changelog, Components, Motion tokens | 321.1 KB | 978.2 KB | 16 | 18.8 KB |
| CompareSlider (`/docs/components/compare-slider/`) | 343.6 KB | 1,038.1 KB | 18 | 18.8 KB |
| AspectRatioPicker (`/docs/components/aspect-ratio-picker/`) | 341.2 KB | 1,031.0 KB | 18 | 18.8 KB |
| useReducedMotion (`/docs/utilities/use-reduced-motion/`) | 339.0 KB | 1,025.0 KB | 18 | 18.8 KB |

The two component pages carry their playgrounds: 22.5 KB (the slider's, with the Feed's media list
and the video controls) and 20.1 KB (the picker's), shared parts included. The stylesheet grows by
1.1 KB, for the components' classes. The demos' media come from the Feed's bucket and aren't
counted here.

### Registry items

| Item | gzip | minified | budget | npm packages it brings |
| --- | --- | --- | --- | --- |
| `compare-slider` (component, slider math, video sync) | 2,902 B | 6,643 B | 3,200 B | none |
| `aspect-ratio-picker` (component, ratio math) | 1,750 B | 4,026 B | 2,000 B | none |
| `use-reduced-motion` (hook + `ReducedMotionProvider`) | 330 B | 582 B | 400 B | none |
| `motion-tokens` (CSS only) | 218 B | 356 B | 300 B | none |

The new budgets are the first measurement plus 10%, rounded up to the next 100 B. `motion-tokens`
grew from 104 B to 218 B with `--genframe-ease-spring` (114 B gzip, a 19-point `linear()` curve), so
its budget was raised from 200 B to 300 B.

## M3 · sizes, budgets and page weights

Measured on 2026-10-20 on the M3 build, the same ways as in M2: `pnpm sizes` for the items,
`node scripts/page-weights.ts` for the pages (KB of 1,024 bytes).

### Registry items

| Item | gzip | minified | budget | npm packages it brings |
| --- | --- | --- | --- | --- |
| `prompt-composer` (component, mentions) | 4,979 B | 13,510 B | 5,500 B | none |
| `model-picker` (component, search) | 2,569 B | 5,736 B | 2,900 B | none (cmdk comes with shadcn's `command`) |
| `estimate-cost` (estimates, formatting) | 1,103 B | 2,494 B | 1,300 B | none |
| `compare-slider` | 2,902 B | 6,643 B | 3,200 B | none |
| `aspect-ratio-picker` (now with `compact`) | 1,801 B | 4,104 B | 2,000 B | none |
| `use-reduced-motion` | 330 B | 582 B | 400 B | none |
| `motion-tokens` (CSS only) | 218 B | 356 B | 300 B | none |

The new budgets are the first measurement plus 10%, rounded up to the next 100 B. AspectRatioPicker
grew by 51 B with `compact`, inside its budget. shadcn's parts aren't counted:
the one with a weight worth knowing is cmdk, which shadcn's `command` brings to ModelPicker, 4.7 KB
gzip in a Radix app and 17.9 KB in a Base UI app (esbuild, minified, React left out).

### Docs site

| Page | JS gzip | JS raw | scripts | CSS gzip |
| --- | --- | --- | --- | --- |
| Home (`/`) | 302.0 KB | 921.3 KB | 15 | 21.5 KB |
| Getting started (`/docs/`), Changelog, Components, estimateCost, Motion tokens | 323.1 KB | 983.5 KB | 17 | 21.5 KB |
| CompareSlider (`/docs/components/compare-slider/`) | 346.0 KB | 1,044.4 KB | 19 | 21.5 KB |
| AspectRatioPicker (`/docs/components/aspect-ratio-picker/`) | 343.7 KB | 1,037.6 KB | 19 | 21.5 KB |
| ModelPicker (`/docs/components/model-picker/`) | 362.8 KB | 1,096.8 KB | 20 | 21.5 KB |
| PromptComposer (`/docs/components/prompt-composer/`) | 370.0 KB | 1,119.6 KB | 20 | 21.5 KB |
| useReducedMotion (`/docs/utilities/use-reduced-motion/`) | 341.2 KB | 1,030.7 KB | 19 | 21.5 KB |

- ModelPicker's page loads 39.7 KB more than a page without a playground: the playground, the
  picker, estimateCost, the demo's models, shadcn's `popover` and `command`, and cmdk.
- PromptComposer's page loads 46.9 KB more: its playground holds the composer, the picker, cmdk and a
  compact AspectRatioPicker, the Studio's first pieces together.
- Every page, the home page included, loads about 1.9 KB more than in M2, though none of the new code
  reaches it: matching the chunks of an M2 build by their contents, one shared chunk of 24.2 KB is
  now two, of 17.5 KB and 8.6 KB, because the new playgrounds share some of its modules (Radix's
  popover and dialog layers). Two chunks compress a little worse than one. It's for M8's
  performance pass.
- The stylesheet grows from 18.8 KB to 21.5 KB: the classes of the two components and of shadcn's
  `command`, `popover` and `dialog` parts.

## M4 · sizes, budgets, page weights and the reveal's cost

Measured on 2026-10-21 on the M4 build, the same ways as in M3: `pnpm sizes` for the items,
`node scripts/page-weights.ts` for the pages (KB of 1,024 bytes), and `node scripts/reveal-cost.ts`
for DenoiseReveal.

### Registry items

| Item | gzip | minified | budget | npm packages it brings |
| --- | --- | --- | --- | --- |
| `generation-queue` (component, announcements, slide) | 2,005 B | 4,208 B | 2,300 B | none |
| `generation-card` (component) | 2,581 B | 6,070 B | 2,900 B | none |
| `denoise-reveal` (component) | 1,037 B | 2,035 B | 1,200 B | none |
| `generation-queue-reducer` (reducer, selectors) | 857 B | 2,225 B | 1,000 B | none |
| `use-generation-queue` (hook, store) | 982 B | 1,868 B | 1,100 B | none |
| `simulated-generator` (driver) | 712 B | 1,132 B | 800 B | none |
| `use-thumbhash` (hook) | 1,313 B | 2,290 B | 1,500 B | `thumbhash` |
| `motion-tokens` (CSS only, now with `--genframe-duration-reveal`) | 227 B | 389 B | 300 B | none |
| `compare-slider` | 2,902 B | 6,643 B | 3,200 B | none |
| `aspect-ratio-picker` | 1,801 B | 4,104 B | 2,000 B | none |
| `model-picker` | 2,569 B | 5,736 B | 2,900 B | none (cmdk comes with shadcn's `command`) |
| `prompt-composer` | 4,979 B | 13,510 B | 5,500 B | none |
| `estimate-cost` | 1,103 B | 2,494 B | 1,300 B | none |
| `use-reduced-motion` | 330 B | 582 B | 400 B | none |

The new budgets are the first measurement plus 10%, rounded up to the next 100 B. Other Genframe
items aren't counted in an item's size, so the queue with everything it brings is 2,005 + 2,581 +
1,037 + 857 + 1,313 + 330 + 227 = 8,350 B gzip, and 9,332 B with the hook. Of `use-thumbhash`'s
1,313 B, the hook's own code is 182 B and `thumbhash` (0.1.1) the rest: its `thumbHashToDataURL` is
1,239 B gzip on its own, and the whole package, encoder included, 2,015 B. `motion-tokens` grew from
218 B to 227 B with the reveal's duration, inside its budget.

### Docs site

| Page | JS gzip | JS raw | scripts | CSS gzip |
| --- | --- | --- | --- | --- |
| Home (`/`) | 302.0 KB | 921.3 KB | 15 | 22.2 KB |
| Getting started (`/docs/`), Changelog, Components, and the pages without a playground | 323.2 KB | 984.3 KB | 17 | 22.2 KB |
| GenerationQueue (`/docs/components/generation-queue/`) | 354.3 KB | 1,068.1 KB | 19 | 22.2 KB |
| GenerationCard (`/docs/components/generation-card/`) | 349.8 KB | 1,054.4 KB | 19 | 22.2 KB |
| DenoiseReveal (`/docs/components/denoise-reveal/`) | 347.3 KB | 1,047.3 KB | 19 | 22.2 KB |
| CompareSlider | 346.1 KB | 1,045.1 KB | 19 | 22.2 KB |
| AspectRatioPicker | 343.8 KB | 1,038.3 KB | 19 | 22.2 KB |
| ModelPicker | 363.0 KB | 1,097.5 KB | 20 | 22.2 KB |
| PromptComposer | 370.2 KB | 1,120.3 KB | 20 | 22.2 KB |
| useReducedMotion | 341.3 KB | 1,031.4 KB | 19 | 22.2 KB |

- GenerationQueue's page loads 31.1 KB more than a page without a playground: the playground, the
  queue, the card, the reveal, the reducer, the hook, the simulated generator, `thumbhash`, a
  compact AspectRatioPicker for the ratio, and the Feed's results. GenerationCard's loads 26.6 KB
  more, DenoiseReveal's 24.1 KB.
- The Feed's results for these demos were first in `lib/feed-media.ts`, with the other demos' media.
  Next.js put every export of that shared module in the chunk the older playgrounds load, so
  CompareSlider's page went to 348.5 KB, AspectRatioPicker's to 346.2 KB and PromptComposer's to
  372.6 KB, 2.4 KB each of data they don't show. In `lib/feed-results.ts`, a module of their own,
  those pages are back to 346.1, 343.8 and 370.2 KB, within 0.2 KB of M3.
- Pages without a playground: 323.2 KB, against 323.1 KB in M3. The stylesheet grows from 21.5 KB
  to 22.2 KB, for the new components' classes.

### What DenoiseReveal costs

`node scripts/reveal-cost.ts` serves the built site, opens DenoiseReveal's page in Google Chrome
155 (headless, on the GPU: an Apple M1 Pro through ANGLE and Metal), replays the reveal 12 times
inside a performance trace with full motion, then 12 times with reduced motion (a plain fade, to
compare with), and averages each reveal. The image is the Feed's 960 px poster of the floating
city, shown at 374 × 374 CSS px with a device pixel ratio of 2: 748 × 748 device pixels.

| Per reveal | Full motion | Reduced motion (a fade) |
| --- | --- | --- |
| Duration, click to revealed | 706 ms | 219 ms |
| Frames the compositor drew | 39.6 | 9.3 |
| Frame interval, median | 16.7 ms | 16.7 ms |
| Frame interval, 95th percentile | 16.7 ms | 16.8 ms |
| Frames longer than 20 ms | 0.08 (one in 12 reveals, 33 ms) | 0 |
| Main thread busy | 76.2 ms | 27.7 ms |
| of which style, layout, paint | 6.0, 1.9, 8.9 ms | 2.2, 1.5, 3.7 ms |
| Paints | 9.5 | 6.7 |
| Raster on the renderer's tile workers | 0 ms | 0 ms |
| GPU process and display compositor busy | 74.0 ms | 20.1 ms |

- Frames hold at 60 a second: the median and the 95th percentile are one vsync. One frame in 12
  reveals took two, at the start, where React remounts the reveal.
- About three more paints than a fade, not one per frame: the grain is painted when it appears,
  and where it was when it goes. Between, the browser runs the opacity and filter transitions on
  the compositor, with the noise drawn once.
- The main thread is busy for about a tenth of each reveal either way (76 ms of 706, 28 of 219),
  about the same per frame for both. Style, layout and paint come to 17 ms per reveal, against
  7 ms for the fade; the rest is React's render of the replay and the page's work in each frame
  (the script's own requestAnimationFrame loop among it).
- Chrome rasterizes on the GPU here, so the tile workers do nothing; the GPU process and the display
  compositor are busy about 1.9 ms a frame for the blur and the hard-light blend, the same per frame
  as for the fade (2.1 ms).
- With the CPU slowed four times (`--throttle 4`): frames still at 16.7 ms (median and 95th
  percentile), the main thread busy 94 ms per reveal, its style, layout and paint 22 ms.
- Not measured: a phone's GPU, and software rendering, where the blur would cost the CPU.

## M5 · sizes, budgets, page weights, and the two apps

Measured on 2026-10-21 on the M5 build, the same ways as in M4: `pnpm sizes` for the items,
`node scripts/page-weights.ts` for the pages (KB of 1,024 bytes).

### Registry items

| Item | gzip | budget | npm packages it brings |
| --- | --- | --- | --- |
| `media-grid` (component, first-screen CSS) | 2,966 B | 3,300 B | none |
| `media-card` (component) | 2,463 B | 2,800 B | none |
| `video-pool` (`createVideoPool`) | 1,243 B | 1,400 B | none |
| `use-video-pool` (provider, `useVideoPool`, `usePooledVideo`) | 611 B | 700 B | none |
| `masonry-layout` | 732 B | 900 B | none |
| `use-thumbhash` (now with `thumbHashColor` and a cache) | 1,585 B | 1,800 B (was 1,500 B) | `thumbhash` |
| `use-reduced-motion` (now without `matchMedia` too) | 364 B | 400 B | none |

The new budgets are the first measurement plus 10%, rounded up to the next 100 B. `use-thumbhash`
grew from 1,313 B to 1,585 B: `thumbHashToAverageRGBA` (221 B gzip on its own) and the bounded cache;
over its 1,500 B budget, so the budget went to 1,800 B. `use-reduced-motion`
grew from 330 B to 364 B with the `matchMedia` check, inside its budget. The grid with everything it
brings is 2,966 + 2,463 + 732 + 611 + 1,243 + 1,585 + 364 + 227 = 10,191 B gzip.

### What a ThumbHash costs

Node 24 on an Apple M1 Pro, 200 of the Feed's worlds, warm: decoding one to a data URL takes about
0.18 ms and gives about 4.1 KB of text; its average color takes under a microsecond. A grid that
mounts eight cards in a scroll frame spends about 1.4 ms decoding here, about 6 ms on a phone four
times slower, which is why decoded placeholders are kept now (the last 200: about 800 KB at most),
and why the first screen's cards use the average color.

### Docs site

| Page | JS gzip | JS raw | scripts | CSS gzip |
| --- | --- | --- | --- | --- |
| Home (`/`) | 302.0 KB | 921.3 KB | 15 | 22.5 KB |
| Getting started (`/docs/`), and the pages without a playground | 323.3 KB | 984.7 KB | 17 | 22.5 KB |
| MediaGrid (`/docs/components/media-grid/`) | 357.7 KB | 1,074.0 KB | 19 | 22.5 KB |
| MediaCard (`/docs/components/media-card/`) | 349.8 KB | 1,054.1 KB | 19 | 22.5 KB |
| GenerationQueue | 354.7 KB | 1,069.3 KB | 19 | 22.5 KB |
| GenerationCard | 350.1 KB | 1,055.6 KB | 19 | 22.5 KB |
| DenoiseReveal | 347.6 KB | 1,048.4 KB | 19 | 22.5 KB |
| CompareSlider | 346.3 KB | 1,045.7 KB | 19 | 22.5 KB |
| AspectRatioPicker | 344.0 KB | 1,038.9 KB | 19 | 22.5 KB |
| ModelPicker | 363.1 KB | 1,098.0 KB | 20 | 22.5 KB |
| PromptComposer | 370.3 KB | 1,120.9 KB | 20 | 22.5 KB |
| useReducedMotion | 341.5 KB | 1,031.9 KB | 19 | 22.5 KB |

- MediaGrid's page loads 34.4 KB more than a page without a playground: the playground, the grid,
  the card, the pool and its hook, the masonry math, `thumbhash` and the 120 worlds (90 images, 30
  clips, with their ThumbHashes and descriptions). MediaCard's loads 26.5 KB more, with three items
  from `lib/feed-results.ts` rather than the 120.
- Pages without a playground: 323.3 KB, against 323.2 KB in M4. The pages that show
  `useThumbHash` (GenerationCard, GenerationQueue, DenoiseReveal) or `useReducedMotion` grew by
  0.2 to 0.4 KB with those hooks. The stylesheet grows from 22.2 KB to 22.5 KB, for the two
  components' classes.

### In the two apps

The numbers, before and after, are in each app's own `docs/PERF.md`; in short:

| | Before | After |
| --- | --- | --- |
| Generation Feed, first-load JS on `/` (local production build, `pnpm measure:js`) | 158.9 KB | 161.0 KB, of its 172.3 KB budget |
| Generation Feed, the HTML of `/`, gzip | 33.3 KB | 34.2 KB |
| Generation Feed, a detail page's JS | 135.2 KB | 135.2 KB |
| Storyboard Timeline, first-load JS (the shell) | 114,488 B | 114,489 B, of its 120 KB budget |
| Storyboard Timeline, the Feed tab's own chunk | 2,565 B | 6,330 B |

## M6 · sizes, budgets, page weights, sprites and clips

Measured on 2026-10-21 on the M6 build, the same ways as in M5: `pnpm sizes` for the items,
`node scripts/page-weights.ts` for the pages (KB of 1,024 bytes).

### Registry items

| Item | gzip | budget | npm packages it brings |
| --- | --- | --- | --- |
| `video-scrubber` (component, sprite-sheet math) | 1,476 B | 1,700 B | none |
| `camera-motion-picker` (component) | 1,905 B | 2,100 B | none |
| `use-scrubber` (`useScrubber`, its arithmetic, `useMediaElement`) | 2,125 B | 2,400 B | none |
| `timecode` | 794 B | 900 B | none |

The new budgets are the first measurement plus 10%, rounded up to the next 100 B; VideoScrubber's
was set at 1,467 B, before its thumbnail's ring (9 B). Other Genframe items aren't counted in an
item's size, so the scrubber with everything it brings is 1,476 + 2,125 + 794 + 364 + 227 = 4,986 B
gzip, and the picker with the video pool 1,905 + 611 + 1,243 + 364 + 227 = 4,350 B.

### Docs site

| Page | JS gzip | JS raw | scripts | CSS gzip |
| --- | --- | --- | --- | --- |
| Home (`/`) | 302.0 KB | 921.3 KB | 15 | 22.9 KB |
| Getting started (`/docs/`), and the pages without a playground | 323.4 KB | 985.3 KB | 17 | 22.9 KB |
| VideoScrubber (`/docs/components/video-scrubber/`) | 347.0 KB | 1,047.7 KB | 19 | 22.9 KB |
| CameraMotionPicker (`/docs/components/camera-motion-picker/`) | 346.2 KB | 1,045.0 KB | 19 | 22.9 KB |
| MediaGrid | 357.9 KB | 1,074.7 KB | 19 | 22.9 KB |
| MediaCard | 349.9 KB | 1,054.7 KB | 19 | 22.9 KB |
| GenerationQueue | 354.8 KB | 1,069.9 KB | 19 | 22.9 KB |
| GenerationCard | 350.2 KB | 1,056.2 KB | 19 | 22.9 KB |
| DenoiseReveal | 347.8 KB | 1,049.0 KB | 19 | 22.9 KB |
| CompareSlider | 346.4 KB | 1,046.3 KB | 19 | 22.9 KB |
| AspectRatioPicker | 344.1 KB | 1,039.4 KB | 19 | 22.9 KB |
| ModelPicker | 363.2 KB | 1,098.6 KB | 20 | 22.9 KB |
| PromptComposer | 370.4 KB | 1,121.5 KB | 20 | 22.9 KB |
| useReducedMotion | 341.6 KB | 1,032.5 KB | 19 | 22.9 KB |

- VideoScrubber's page loads 23.6 KB more than a page without a playground: the playground, the
  scrubber, the hook and `useMediaElement`, the timecode helpers, three story clips' data and their
  sprites' JSON. CameraMotionPicker's loads 22.8 KB more: the picker, the pool and its hook, the
  scenes, and the pool's counts.
- Every other page grows by 0.1 to 0.2 KB, the map of playgrounds that every docs page loads
  (`components/docs/demo.tsx`) among it, which has two more entries. The stylesheet grows from
  22.5 KB to 22.9 KB, for the two components' classes.

### The sprites

`node scripts/make-sprites.ts`: 21 tiles of 160 × 90 in a 5 × 5 sheet (800 × 450), a tile every
quarter second, WebP at quality 50. Each loads once, with the page, at low priority.

| Clip (Generation Feed's story) | Sprite |
| --- | --- |
| 10-wide, the tram (`qjr027827t`) | 44.8 KB |
| 11-crane-up (`hoasfc54e8`) | 32.6 KB |
| 15-wide, rolling away (`a7391hh3rt`) | 34.2 KB |

On the tram's shot, the busiest: quality 60 makes 50.8 KB, 70 57.2 KB, 80 72.9 KB; 320 × 180 tiles
make 129.1 KB at 50, 147.5 KB at 60, 165.8 KB at 70 and 220.7 KB at 80.

### What the demos' clips weigh

The clips come from the Feed's bucket, only when used. VideoScrubber's clip loads its metadata with
the page and the rest when played or sought: the story's `full.mp4` files are 1.1 to 1.5 MB
(1280 × 720, 5 s). A hovered tile of CameraMotionPicker loads its move's `full.mp4`, 0.3 to 0.5 MB
for the red car's (854 × 480) and 0.7 to 1.9 MB for the Kling scenes' (1280 × 720), where the Feed's
2.5 s previews would be 0.1 to 0.2 MB (but a move takes all five seconds). Its
posters, the Feed's 480 px WebP, are 5 to 17 KB each.

## M7 · the Studio, the home page, and the design hand-off

Measured on 2026-10-21 on the M7 build: `node scripts/page-weights.ts` for the pages (KB of 1,024
bytes, as before; it now weighs the pages beside the docs too, the Studio among them), and
`node scripts/first-load.ts` for how the home page loads. Before: the M6 build (a86f822), measured
the same way. The registry's items are unchanged, so are their sizes and budgets.

### Page weights

| Page | JS gzip before | JS gzip after | scripts | HTML gzip before | HTML gzip after |
| --- | --- | --- | --- | --- | --- |
| Home (`/`) | 302.0 KB | 372.7 KB | 15 → 21 | 5.5 KB | 9.1 KB |
| Studio (`/studio/`) | (new) | 370.7 KB | 19 | | 8.5 KB |
| Getting started (`/docs/`), and the pages without a playground | 323.4 KB | 323.5 KB | 17 | | |
| GenerationQueue | 354.8 KB | 355.5 KB | 20 | | |
| the other pages with a playground | | +0.1 to +0.3 KB | | | |

- The home page loads the Studio: 70.7 KB of JS gzip more, in six chunks it didn't load before:
  the Studio and the items it composes, with cmdk and Radix's popover under the model picker. They
  are fetched at low priority, after the stylesheet and the font. The
  Studio's HTML, rendered in place, is 17.9 KB (3.3 KB gzip) of the page's.
- `/studio/` loads the same code: 370.7 KB. Its Feed media (`lib/feed-studio.ts`: 16 images, 8 of
  them with their drafts, and 31 clips with their sprites' JSON) are 3.5 KB gzip of it.
- Every docs page gains 0.1 KB: the Studio's link in the nav and the sidebar, and the playground's
  toolbar slot. GenerationQueue's page gains 0.7 KB: the bundler splits the modules it shares with
  the Studio differently, four chunks into five. The stylesheet stays at 22.9 KB: the Studio's
  classes were there already.

### How the home page loads

`node scripts/first-load.ts --runs 5`: Google Chrome 155 on an Apple M1 Pro, the CPU slowed 4×, the
network at 150 ms and 1.6 Mbps (Lighthouse's mobile preset), no cache, the Feed's media refused.
Medians of five loads. "Responds" is when the nav's search first opens its dialog, which needs the
page hydrated.

| Home page, 412 px wide | FCP | LCP | LCP element | CLS | Responds |
| --- | --- | --- | --- | --- | --- |
| Before (M6) | 4.2 s | 4.2 s | the hero's paragraph | 0 | 5.6 s |
| After: the Studio in place, its code at low priority | 4.2 s | 4.2 s | the hero's paragraph | 0 | 6.8 s |

At 1,350 px: 4.2 s, 4.2 s, 0 and 5.7 s before; 4.3 s, 4.3 s, 0 and 7.0 s after. `/studio/`: 4.2 s,
4.2 s (its intro's paragraph), 0, and 6.8 to 6.9 s.

- The first paint and the largest one don't move: they're the static HTML and the stylesheet, and
  the Studio's first screen has no image, so the hero's text stays the largest paint. Nothing
  shifts.
- The page responds 1.2 s later on this slowed phone: React hydrates the page once the Studio's
  code has arrived and run. That's the cost of having the Studio there, working, on the home
  page.
- The two ways tried to load the Studio's code later, measured the same
  way: with a Suspense boundary of its own, React moved the Studio's 18 KB of HTML to the end of
  the page and a script put it back about 0.2 to 0.3 s after the first paint, a layout shift of
  0.12 at 1,280 px and 0.31 at 390 px (CPU slowed 6×); without one, holding the Studio's code back
  also held the whole page's hydration: the search didn't open until the Studio's code came.

### Sprites and the design hand-off

- The Studio's clips have sprites, as VideoScrubber's demo does: 28 more sheets, 744 KB in all
  (15.0 to 41.6 KB each), 855 KB with the story clips'. Each loads only when its clip is opened.
  Tiles have the area of a 160 × 90 one in the clip's shape: 90 × 160 for 9:16, 120 × 120 for 1:1,
  104 × 139 for 3:4.
- `docs/design/screenshots/`: 10 PNGs at 1×, 236.7 KB in all, stored with a 256-color palette; the
  largest are the reveal's grain (78.0 KB: noise doesn't compress) and the Studio (40.3 KB).

## M8 · every goal measured, the lab corrected, one fix

Measured on 2026-10-21 and 22 on an Apple M1 Pro with Google Chrome 155, on two builds: **before**,
the M7 release (9aaedcf), and **after**, M8's (ModelPicker's accessibility fix and the search loaded
after the page's code). Both are served by `scripts/serve.ts`, gzipped as GitHub Pages serves them
(below). Lighthouse is 12.6.1 (`@lhci/cli` 0.15.1), axe-core 4.14.0. The goals are the spec's
(section 2).

### The lab, corrected first

- **Compression.** The local server sent files uncompressed; GitHub Pages gzips text. The same M7
  build on a slowed phone (`scripts/first-load.ts`, 412 px): first paint 4.2 s and responds at 6.8 s
  uncompressed, as M7 recorded; 1.0 s and 2.7 s gzipped, as visitors get it. Lighthouse's LCP
  estimate for the home page went from 8.4 s to 3.5 s for the same reason. Every number below is
  gzipped.
- **Polyfills.** Page weights counted Next.js's `noModule` script, 38.7 KB gzip, which browsers with
  ES modules never download. The M7 home page is 372.7 KB as M7 measured it, 334.0 KB without it.
  The tables below leave it out; the tables above, M0 to M7, include it.

### Item sizes

`pnpm sizes`: all 23 items within their budgets, with 9 to 24% to spare. One changed:
`model-picker`, 2,569 B to 2,593 B gzip (budget 2,900 B), for its empty list. The whole Kit, every
item once, is 38,051 B gzip.

### Page weights

`node scripts/page-weights.ts`, KB of 1,024 bytes, without the polyfills. The stylesheet stays at
22.9 KB gzip.

| Page | JS gzip before | JS gzip after | scripts |
| --- | --- | --- | --- |
| Home (`/`) | 334.0 KB | 292.0 KB | 20 → 18 |
| Studio (`/studio/`) | 332.0 KB | 290.1 KB | 18 → 16 |
| Getting started (`/docs/`) and every page without a playground | 284.8 KB | 244.7 KB | 16 → 14 |
| AspectRatioPicker | 305.5 KB | 265.4 KB | 18 → 16 |
| CameraMotionPicker | 307.6 KB | 267.5 KB | 18 → 16 |
| CompareSlider | 307.8 KB | 267.7 KB | 18 → 16 |
| DenoiseReveal | 309.2 KB | 269.0 KB | 18 → 16 |
| GenerationCard | 311.6 KB | 271.5 KB | 18 → 16 |
| GenerationQueue | 316.8 KB | 276.7 KB | 19 → 17 |
| MediaCard | 311.3 KB | 271.2 KB | 18 → 16 |
| MediaGrid | 319.3 KB | 279.2 KB | 18 → 16 |
| ModelPicker | 324.6 KB | 284.5 KB | 19 → 17 |
| PromptComposer | 331.9 KB | 291.8 KB | 19 → 17 |
| VideoScrubber | 308.6 KB | 268.5 KB | 18 → 16 |
| useReducedMotion | 303.0 KB | 262.9 KB | 18 → 16 |

Every page loads 40.1 KB less (the home page and the Studio 42 KB): the search dialog, its engine
(`zbsearch`, 24 KB) and the hast runtime that draws its results now come after the page's code. What
a plain docs page still loads, by package (from a source-mapped build): Next.js with React, 138 KB;
Base UI and floating-ui under Fumadocs' layout, about 56 KB; Fumadocs' own components, about 25 KB;
`cn`, 9 KB, twice on pages with a playground (Fumadocs' 0.4.0 and the site's 0.5.0).

### Lighthouse, mobile preset

Four pages, three runs each, the median; LCP's range in brackets. Lighthouse's default throttling is
simulated: it loads the page unthrottled and estimates a phone from that trace. Applied throttling
("devtools") slows Chrome itself to the same network and CPU. Accessibility scored 100 on every page,
in both builds.

| Page | LCP, simulated: before | after | TBT, simulated: before | after | Performance score: before | after |
| --- | --- | --- | --- | --- | --- | --- |
| Home | 3.48 s (3.46–3.48) | 3.21 s (3.16–3.22) | 30 ms | 7 ms | 91 | 93 |
| Studio | 3.47 s (3.47–3.48) | 3.24 s (3.16–3.24) | 28 ms | 16 ms | 91 | 93 |
| Getting started | 3.38 s (3.31–3.38) | 3.23 s (3.00–3.23) | 15 ms | 14 ms | 92 | 93 |
| PromptComposer | 3.62 s (3.62–3.77) | 3.31 s (3.31–3.40) | 22 ms | 12 ms | 89–90 | 92 |

| Page | LCP, applied: before | after | TBT, applied: before | after | Time to interactive, applied: before | after |
| --- | --- | --- | --- | --- | --- | --- |
| Home | 1.70 s | 1.70 s | 20 ms | 18 ms | 2.34 s | 2.34 s |
| Studio | 1.70 s | 1.72 s | 20 ms | 22 ms | 2.34 s | 2.35 s |
| Getting started | 1.69 s | 1.68 s | 22 ms | 24 ms | 2.35 s | 2.37 s |
| PromptComposer (5 runs) | 1.90 s | 1.84 s | 210 ms | 146 ms | 4.07 s | 3.91 s |

- First contentful paint, simulated: 1.06 s (home, Studio) and 1.21 s (docs pages), before and after.
  Layout shift: 0.000 on every run.
- Why the simulated LCP is twice the applied one: Lighthouse's model counts every request that started
  before the first paint as blocking it, and Next.js asks for all of a page's scripts in the `<head>`.
  With its scripts stripped from the HTML, Getting started estimates at 1.2 s. Chrome itself loads
  the stylesheet and the font first and doesn't wait for `async` scripts, so the paint comes at
  1.7 s.
- The applied numbers barely move with the fix, because these scripts never held the paint for real;
  PromptComposer's blocking time varies from 99 to 263 ms between runs, so it's given over five.
- Lighthouse CI (`pnpm lighthouse`) asserts LCP at 2.5 s as a warning, with simulated throttling;
  layout shift, blocking time, script bytes and the accessibility score fail the run.
- On GitHub's runner (ubuntu-24.04, CI run 39663037948, the after build), simulated: LCP 3.10 s
  (home), 3.13 s (Studio), 3.08 s (Getting started) and 3.23 s (PromptComposer), close to the
  laptop's; blocking time 107 to 231 ms against the laptop's 5 to 30 ms, since Lighthouse slows the
  runner's own, slower CPU four times. The blocking-time budget, 350 ms, comes from these runs.

### First load on a slowed phone

`node scripts/first-load.ts --runs 5`: Chrome with its CPU slowed 4×, the network at 150 ms and
1.6 Mbps, no cache, the Feed's media refused; medians of five loads, at 412 px (1,350 px within
0.1 s). "Search opens" is M7's probe; "playground responds" (`--probe playground`) is when the
page's playground first toggles its slow motion.

| Page | First and largest paint: before | after | Search opens: before | after | Playground responds: before | after |
| --- | --- | --- | --- | --- | --- | --- |
| Home | 1.0 s | 1.0 s | 2.7 s | 3.0 s | 2.7 s | 2.5 s |
| Studio | 1.0 s | 1.0 s | 2.6 s | 2.9 s | 2.7 s | 2.5 s |
| Getting started | 1.0 s | 1.0 s | 2.5 s | 2.9 s | | |
| PromptComposer | 1.0 s | 1.1 s | 2.8 s | 3.4 s | 2.9 s | 2.7 s |

- No layout shift on any page (0.001 at most, at 1,350 px).
- The page's own controls respond 0.2 s sooner; search, whose code now comes after the page's,
  opens 0.3 to 0.6 s later the first time. PromptComposer's page shows the most: its playground's
  code arrives at the same time as the search's.

### Interactions: INP and frames

`node scripts/interactions.ts`, Chrome with its CPU slowed 4×, a desktop window (1,280 × 900),
the Feed's media as the end-to-end tests' stand-ins. Each scenario runs after the page has loaded
and its main thread has been quiet for 2 s. Before and after were run alternately, three times each,
in one session: on this laptop, the same build measured 30 to 50% slower in a session an hour
apart, so only runs side by side compare. Frames are the after runs'; the before runs' match them.

| Scenario | Interactions | INP before (3 runs) | INP after (3 runs) | Frames, median | 95th percentile | Over 20 ms | Slowest interaction |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CompareSlider: drag across, two clicks, seven keys | 11 | 32, 32, 32 ms | 32, 32, 32 ms | 16.7 ms | 16.7 ms | 0.5% | a key on the handle |
| AspectRatioPicker: seven arrows, a click | 8 | 72, 64, 72 ms | 56, 64, 72 ms | 16.7 ms | 16.8 ms | 0.6 to 1.2% | a click on a ratio |
| ModelPicker: open, type, choose, open again | 11 | 152, 192, 120 ms | 160, 144, 136 ms | 16.7 ms | 16.8 ms | 1.7 to 2.5% | the first opening |
| PromptComposer: type 70 characters, a mention, submit | 78 | 80, 72, 72 ms | 64, 64, 88 ms | 16.7 ms | 16.8 ms | 0.3 to 0.5% | a key in the prompt |
| GenerationQueue: four jobs, reveals, two removed | 6 | 104, 96, 88 ms | 88, 88, 88 ms | 16.7 ms | 16.8 ms | 0.3 to 0.5% | Add job |
| DenoiseReveal: three replays | 3 | 88, 72, 80 ms | 88, 64, 64 ms | 16.7 ms | 16.7 ms | 0.4% | Replay |
| MediaGrid: 30 wheel ticks, resting on cards | 0 | | | 16.7 ms | 16.8 ms | 0.4 to 0.8% | (scrolling isn't an interaction) |
| VideoScrubber: hover, drag, a click, seven keys | 9 | 48, 32, 32 ms | 32, 24, 48 ms | 16.7 ms | 16.8 ms | 0.5 to 1.0% | a click on the bar |
| CameraMotionPicker: three hovers, four arrows | 4 | 48, 40, 32 ms | 24, 48, 48 ms | 16.7 ms | 33.3 ms | 5.5 to 6.9% | a key on a tile |
| Studio: three images, open, drag, a clip with a move, scrub | 63 | 64, 72, 48 ms | 64, 56, 56 ms | 16.7 ms | 16.8 ms | 0.5 to 0.6% | a key in the prompt |

- INP is under 100 ms in every scenario but ModelPicker's, where the first opening takes 120 to
  192 ms (112 to 184 ms across all sessions); its later openings take 40 to 56 ms. The first one
  runs code for the first time (Radix's popover layers, floating-ui, cmdk, React mounting every
  option) and lays the popover out for the first time. Two changes were tried on a prototype, in one
  session: caching `estimateCost`'s number formatters (about a hundred `Intl.NumberFormat`s per
  render) took the click's own work from 57–62 to 51–58 ms, and drawing the options a frame after the
  popover took it to 39–43 ms. The whole interaction went from 112–120 ms to 96–104 ms, not reliably
  under 100 ms, and the second shows an empty popover for a frame, so neither shipped.
- Frames hold one vsync (16.7 ms) at the median everywhere, and at the 95th percentile everywhere but
  CameraMotionPicker, where about 6% of frames take two while a hovered tile's clip starts.
- The search change doesn't touch interactions: before and after overlap in every scenario.
- Unthrottled, on the laptop itself (`--throttle 1`), INP is 24 to 72 ms, ModelPicker's first opening
  72 ms: every scenario passes. A click measures 64 to 72 ms even unthrottled, against 24 to 40 ms
  for a key, so part of each number is the time to present the next frame in this setup, the same in
  both builds.

### Accessibility

`node scripts/axe-report.ts`: axe on every page as it loads (28) and in 14 states that need an
interaction (search open; a docs page at 390 px with its menu open; CompareSlider dragged with
reduced motion; ModelPicker filtered, and with nothing matching; PromptComposer's mention list; the
queue with jobs waiting, running and failed, and all finished with unknown progress; MediaGrid
scrolled with a clip previewing; VideoScrubber's preview; CameraMotionPicker with reduced motion; the
Studio with jobs running, with a draft and final open, and with a clip open at 390 px with reduced
motion).

| Build | Critical | Serious | Moderate | Minor |
| --- | --- | --- | --- | --- |
| Before | 1 (ModelPicker with nothing matching: `aria-required-children`) | 1 (search open: `label-content-name-mismatch`) | 70 | 0 |
| After | 0 | 0 | 70 | 0 |

The moderate findings are all in Fumadocs' layout: `region` (its table of contents outside any
landmark) and `landmark-unique` (its code blocks' scrolling regions) on the docs pages, and a second
banner with the menu open at 390 px. The home page and the Studio have none.

### Against the spec's goals

| Goal | Target | Before | After |
| --- | --- | --- | --- |
| Installable anywhere | Every item into a fresh Vite + Tailwind v4 + shadcn app | Pass: 23 items, Base UI and Radix apps | Pass |
| Small | Each item within its budget | Pass | Pass: 23 of 23 |
| Accessible | 0 serious axe issues on every docs page | **Fail**: 1 critical, 1 serious | Pass: 0 on 28 pages and 14 states |
| Respects motion settings | A tested reduced-motion version of every animation | Pass | Pass |
| Smooth | 60 fps; INP ≤ 100 ms on the playgrounds | Frames pass; INP fails on ModelPicker's first opening | The same: 9 of 10 scenarios and the Studio under 100 ms, ModelPicker's first opening 120 to 192 ms |
| Fast docs | LCP ≤ 2.5 s on a phone, lab, Lighthouse CI | **Fail** by Lighthouse's estimate: 3.38 to 3.62 s; 1.69 to 1.90 s applied | **Fail** by the estimate: 3.21 to 3.31 s; 1.68 to 1.84 s applied |
| Used for real | The Feed and the Timeline install from the Kit | Pull requests green, not merged (Vercel) | The same |
| Tested | Unit, component, end-to-end, screenshots | Pass | Pass, with two axe checks that fail on the old code |
