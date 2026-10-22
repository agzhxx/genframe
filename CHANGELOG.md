The registry follows semver; each release has a dated entry.

## 0.1.0 · M8 · Measured, fixed and presented (2026-10-21)

The first release ready to launch: every goal in the spec measured, the failures fixed or explained,
and the project written up.

- `model-picker`: with nothing matching, the empty list is hidden and its message shows beside it. A
  `listbox` without options is invalid ARIA (axe's `aria-required-children`, critical), found by
  M8's audit in a state the tests reached but didn't check with axe. 2,593 B gzip. No API changed.
- The docs' search dialog loads after each page's code, as Fumadocs loads its own: its engine, its
  dialog and the code that draws its results, 40 KB gzip, no longer come before the first paint.
  Every docs page loads 244.7 KB of JS instead of 284.8 KB, the home page 292.0 KB instead of
  334.0 KB. Its close button is named by what it shows, "Esc", as WCAG's label-in-name rule asks
  (axe: serious).
- Measured: Lighthouse CI runs in every CI run, on the home page, the Studio, Getting started and the
  heaviest component page, with Lighthouse's mobile preset; `scripts/interactions.ts` measures INP
  and frames on every playground and the Studio with the CPU slowed 4×; `scripts/axe-report.ts`
  counts axe's findings at every impact on every page and in 14 states that need an interaction. The
  results, before and after, and the goals that still miss, with why, are in docs/PERF.md.
- The lab corrected: the local server gzips what GitHub Pages gzips (M7's slowed-phone first paint
  was 4.2 s uncompressed, 1.0 s as served), and page weights leave out the polyfills that only
  browsers without ES modules load (38.7 KB on every page until now).
- The README is the project's case study: the gap, the principles, how the components are built,
  three decisions and what they beat, tests, accessibility and the numbers.
- `scripts/record-studio.ts` records the Studio with the Feed's real media: an MP4 for posts, and the
  animated WebP at the top of the README.
- Tests: axe with the search dialog open and with nothing matching in ModelPicker, both failing on
  0.0.8; page weights without the polyfills.

## 0.0.8 · M7 · The Studio and the design hand-off (2026-10-21)

- The Studio (`/studio/`): the components as one small creation studio, on the simulated generator.
  Write a prompt, pick a model, a shape and, for a video, a camera move; generate; watch the jobs
  wait, run and sharpen into view; open an image's draft and final in CompareSlider, or a clip in a
  player with VideoScrubber. The results are AI-generated images and clips from Generation Feed,
  picked to match the settings (the kind, the shape, the camera move and, where the Feed has it, the
  model), never made from the prompt, and the page says so.
- The home page runs the Studio live after the hero, with the install steps, the principles and
  links. Its HTML is in the page from the start; its code is a chunk of its own, fetched at low
  priority. The nav and the docs' sidebar link to the Studio.
- The design hand-off, in `docs/design/`: `tokens.figma.json`, the code's colors, radii, type and
  motion in the W3C design-tokens format for Figma variables, made by `scripts/design-tokens.ts` and
  tested against the code; ten screenshots of the components' key states, taken from the built site
  by `scripts/design-screenshots.ts`; and how to build the Figma file, which comes next.
- The README's sizes, two of them stale since M5, are checked by a test, with each item's size with
  the Genframe items it brings.
- No item changed.
- Tests: results picked by the settings; the Studio's wiring; end to end, the spec's flow by
  keyboard alone and by pointer, a clip scrubbed, reduced motion, axe while jobs wait, run, fail and
  finish, and the Studio on the home page; screenshots of two of the Studio's states.

## 0.0.7 · M6 · VideoScrubber and CameraMotionPicker (2026-10-21)

- `video-scrubber`: a scrub bar for any video. The time played and the buffered ranges are layers
  moved by transforms, a thumb grows in on hover and focus, and over the pointer a preview shows a
  thumbnail of that time, with its timecode: a tile of a sprite sheet
  (`{ url, columns, rows, interval, width, height }`) or `getThumbnail`'s image. With `fps`, `,` and
  `.` step a frame. The time played never animates: it follows the player. 1,476 B gzip.
- `use-scrubber`: the scrubber's logic for any player, given its `duration` and `currentTime` and
  seeking in `onSeek`. The WAI-ARIA slider pattern with the time in words ("1 minute 4 seconds of
  2 minutes", with frames when it has the rate); a mouse seeks where it presses, a touch once it's a
  tap or a drag; seeks land in the middle of a frame, which shows that frame where its start can show
  the one before. While a drag is under way the bar shows the drag, and after a seek where it asked
  to go, until the player reports a new time, so it never jumps back. `useMediaElement` wires a
  `<video>`: the time of the frame on screen while it plays, buffered ranges, one seek at a time
  with only the latest waiting, and a pause for the length of a drag. 2,125 B gzip.
- `timecode`: `m:ss` and `h:mm:ss`, SMPTE `HH:MM:SS:FF` without dropped frames, read and written;
  the frame showing at a time, where a frame starts and its middle, a video's frame count, at any
  rate, with 23.976 and 29.97 read as the exact NTSC rates; and a time in words for
  `aria-valuetext`. The same rules as Storyboard Timeline's timecode. 794 B gzip.
- `camera-motion-picker`: pick a camera move from tiles, native radio buttons each named by its move
  and described by its description, over its poster. A tile loops its clip from the shared video
  pool while the pointer rests on it, while it has keyboard focus, or after a tap, and never more
  clips at once than the pool holds; without a VideoPoolProvider it makes a pool of its own. With
  reduced motion, posters and a play button per tile. 1,905 B gzip.
- `scripts/make-sprites.ts`: sprite sheets of clips, a tile every quarter second, with ffmpeg and
  cwebp, and their JSON. The docs' three, of Generation Feed's story clips, are 33 to 45 KB each.
- Docs: pages for the four items. VideoScrubber's playground plays three of the Feed's story shots in
  a plain `<video>`, with their sprites and controls for the frame rate and the buffered ranges;
  CameraMotionPicker's shows the Feed's red car in eight moves made with Cinema Studio 4.0's presets,
  and three Kling 2.5 scenes, with the pool's counts.
- Tests: the timecode arithmetic at frame boundaries and at 23.976 and 29.97 fps, the scrubber's
  arithmetic and its holds, `useMediaElement` on a video, both keyboard maps, the picker's previews
  through the pool and its bound, both motion versions; end to end, the frame keys present exactly
  the next and the previous frame, a click and a drag move the video, tiles play on hover and focus
  with only the pool's two videos, and with reduced motion nothing plays by itself and Play preview
  works; screenshots of the scrubber's preview and the picker, with and without reduced motion.

## 0.0.6 · M5 · MediaGrid, MediaCard and the video pool, from Generation Feed (2026-10-21)

- `media-grid`: Generation Feed's virtualized masonry grid, made generic. Cards are placed by their
  aspect ratios, so the server and the browser agree at any width: before the grid knows its width,
  a style sheet of its own places the first screen with container queries, before any JavaScript
  runs, and nothing moves when it switches to pixels. Then only the cards within about a screen of
  the view stay in the page. Lane steps of your own, the window or an element as the scroller, pages
  with placeholders while they load, `reveal()` to bring a card back, and on touch screens the clip
  nearest the middle of the screen plays once scrolling stops. 2,966 B gzip.
- `media-card`: an image or clip as a link (plain clicks call `onOpen`) or a button, its poster in
  every width and format your URL builder has, over its ThumbHash or its average color, and a clip's
  preview from the shared pool while the pointer rests on it or it has keyboard focus. A play button
  instead with autoplay off, reduced motion or a browser that refuses to play; a retry button for a
  poster that didn't load. 2,463 B gzip.
- `video-pool`: `createVideoPool`, a fixed set of `<video>` elements that cards borrow: never more
  than its size, a warm card gets its own back, and when every one is taken the least recently used
  is emptied (its decoder freed) and lent on. Pauses in a hidden tab; unlocks Safari's Low Power Mode
  on the first click. 1,243 B gzip.
- `use-video-pool`: `VideoPoolProvider` makes one pool for everything inside, right after hydration
  in a task of its own; `usePooledVideo` borrows a video into a slot of yours while it should play,
  and says when its first frame is on screen. 611 B gzip.
- `masonry-layout`: the lanes at a width, placement by aspect ratio, boxes in pixels, the grid's
  height and an `<img sizes>` for its lanes. 732 B gzip.
- `use-thumbhash`: `thumbHashColor`, an image's average color for server-rendered HTML; decoded
  placeholders are kept for the last 200 hashes. 1,585 B gzip (budget 1,800 B).
- `use-reduced-motion`: works without `matchMedia`, as in jsdom, where apps' tests run. 364 B gzip.
- Generation Feed and Storyboard Timeline each have a pull request that installs the grid or the
  card from the registry in place of their own code.
- Docs: pages for the five items. MediaGrid's playground scrolls 120 of the Feed's worlds in a box,
  with a pool-size control and the pool's counts; MediaCard's shows an image, a clip and a clip as a
  button, with their placeholders.
- Tests: the Feed's tests of the pool, the layout, the card and the grid, ported; the pool's rules
  against a model over 2,000 random steps; keyboard maps, both motion versions; end to end, a grid
  scrolled to its end never has more live videos than its pool, CSS and pixels place the first
  screen alike to half a pixel, and nothing plays by itself with reduced motion; screenshots of the
  card's placeholders and play buttons and the grid's first screen.

## 0.0.5 · M4 · GenerationQueue, GenerationCard and DenoiseReveal (2026-10-21)

- `generation-queue-reducer`: the generation queue's state as a pure reducer, the jobs newest first,
  through submit, start, progress, succeed, fail, cancel, retry and remove. Reports from a run name
  their attempt, and an event about a job that's gone, from another attempt, or that the job's state
  doesn't take changes nothing, so late progress after a cancel and an old attempt's success after a
  retry are ignored. A job canceled before it started is refunded. `queuePosition` and `timeLeft`
  (from the progress rate, the driver's estimate and the slots ahead). 857 B gzip. Its tests came
  first.
- `use-generation-queue`: runs the queue's jobs on your driver, `run(job, { signal, progress })`, a
  few at a time, in a store outside React: a job that can start starts in the same tick, a cancel
  aborts its run, and everything stops on unmount. Requests can carry your own fields, typed.
  982 B gzip.
- `simulated-generator`: a driver for demos and tests, seeded by the job and the attempt, with
  durations, failures and unknown progress; progress twice a second; plain timeouts for fake timers.
  712 B gzip.
- `generation-queue`: the cards in a list, a polite live region for every change of state ("Image 3
  is ready"), never progress, focus that moves on when a card goes, and cards that slide into their
  new places with a FLIP on CSS transitions; jump with reduced motion. 2,005 B gzip.
- `generation-card`: one job, queued with its place in line and time, running with a progress bar
  (a calm pulse while progress is unknown, still with reduced motion), succeeded with its result
  revealed over its ThumbHash, failed with the reason, or canceled and refunded; buttons named after
  the job. Its media keeps the requested shape from the start. 2,581 B gzip.
- `denoise-reveal`: an image that sharpens out of grain and blur once it has loaded: an SVG
  `feTurbulence` grain, drawn once and blended in hard light, fades while the blur drops, over
  600 ms; only opacity and filter animate. A fast fade with reduced motion. 1,037 B gzip; in Chrome on
  a laptop GPU, frames stay at 16.7 ms.
- `use-thumbhash`: a ThumbHash as a placeholder data URL, with the `thumbhash` package. 1,313 B gzip.
- `motion-tokens`: `--genframe-duration-reveal` (600 ms). 227 B gzip.
- Docs: pages for the seven items. The queue's playground runs jobs on the simulated generator with
  the Feed's worlds as their results; the card's shows every state; the reveal's replays it. The
  Feed's results load only on these pages.
- Tests: the reducer's matrix of every event from every state with the late events, the hook, the
  driver on fake timers, the cards' ARIA and wording, the live region's messages, focus after a
  removal and the slide in both motion versions; end-to-end tests of a job from the line to its
  opened result, cancel and retry, failures, focus and the slide, unknown progress and axe while jobs
  change; screenshots of every card state and of the grain; a check that no two registry files share
  a name, after the install test caught shadcn sending the reducer's imports to the component.
  `scripts/reveal-cost.ts` measures the reveal from a Chrome trace.

## 0.0.4 · M3 · ModelPicker and PromptComposer (2026-10-20)

- `model-picker`: a searchable list of models, on shadcn's `popover` and `command`. Each option shows
  its badges (image or video, resolutions, clip lengths, speed) and what a run with the current
  settings would cost, "5 s × $0.042 ≈ $0.21"; type to filter by name, badge or keyword, and choose
  with Enter. The combobox pattern is checked attribute by attribute: two gaps in cmdk 1.1.1
  (`aria-activedescendant` missing on opening and after filtering, `aria-expanded` stuck on true)
  are closed, and options are named by everything they show. 2,569 B gzip, no npm packages of its
  own (shadcn's `command` brings cmdk).
- `prompt-composer`: a prompt box for generation. Text that grows (CSS `field-sizing`), reference
  images picked, dropped or pasted, with thumbnails whose object URLs are revoked when they go,
  @-mentions with a listbox the textarea points at (`aria-activedescendant`), the mentioned
  references ringed, preset chips as checkboxes, a character count spoken near the limit, a
  toolbar, a cost hint, and Cmd/Ctrl+Enter to submit (Enter with `submitOnEnter`), never during an
  input method's composition. Disabled and loading states. 4,979 B gzip, no npm packages.
- `estimate-cost`: what a run will cost, from a model's price and the settings, in exact decimal
  arithmetic (BigInt) rounded once to the currency's smallest unit; `formatEstimate` and
  `formatPrice` word it. 1,103 B gzip.
- `aspect-ratio-picker`: `compact`, without the preview frame and with the ratios in one row, for
  toolbars. 1,801 B gzip.
- Docs: pages for the three items. ModelPicker's playground lists Higgsfield's models at the prices
  Generation Feed recorded, checked on 2026-10-16; PromptComposer's starts with the Feed's
  camera-move stills as references and puts ModelPicker and a compact AspectRatioPicker in its
  toolbar, with the cost from estimateCost: a first look at the Studio.
- Tests: unit tests for the money arithmetic, the model search, and finding and inserting mentions;
  component tests with every keyboard map, the combobox attributes, focus after removals,
  controlled and uncontrolled use and both motion versions; end-to-end tests for filtering and
  choosing with the estimate following, and for an @-mention by keyboard and Cmd/Ctrl+Enter, with
  axe on the open lists; screenshots of the open picker and of the composer with its mention list.

## 0.0.3 · M2 · CompareSlider and AspectRatioPicker (2026-10-20)

- `compare-slider`: a before/after slider for two images or two videos. The after layer is clipped
  with `clip-path`, never resized, and the divider moves with a transform. Drag it, click where it
  should go (it springs there), or use the keys of the WAI-ARIA slider pattern; `aria-valuetext`
  reads like "60% Final". Horizontal or vertical, controlled or not, with labels. With a video in
  each layer, the two play, pause and seek together, and the follower keeps within a frame of the
  clock. 2,902 B gzip, no npm packages.
- `aspect-ratio-picker`: native radio buttons, each a frame drawn in its ratio, with a preview frame
  (an SVG rect with a non-scaling stroke) that takes the picked shape by a transform. Disabled
  ratios give their reason on hover, on tap, while the group has keyboard focus and to screen
  readers. 1,750 B gzip, no npm packages.
- `motion-tokens`: `--genframe-ease-spring`, a damped spring as a CSS `linear()` curve, so a plain
  transition overshoots and settles. The item grows to 218 B; its budget to 300 B.
- Docs: each page loads only its own playground's code (pages without one: 336.4 KB to 321.0 KB of
  gzipped JS). Pages for both components, with the Feed's draft/final, day/night and video media in
  the playgrounds and its ratio scenes changing as you pick.
- Tests: unit tests for the slider's arithmetic, the video sync and the ratio arithmetic; component
  tests with both keyboard maps; end-to-end tests in Chrome for dragging, keys, the spring and two
  videos after a seek, and for the picker's native keys; screenshots of the slider at 0, 50 and 100%
  and of the picker with disabled ratios, with baselines made by a workflow on GitHub's runner. The
  end-to-end tests serve the Feed's media themselves.

## 0.0.2 · M1 · Foundations (2026-10-20)

- Motion tokens: `motion-tokens`, a CSS-only item. `shadcn add` writes `--genframe-duration-fast`
  (120ms), `--genframe-duration-base` (220ms) and `--genframe-ease-out` into the app's `:root`; the
  `genframe-` prefix keeps them from changing Tailwind's `ease-out` utility.
- Reduced motion: `use-reduced-motion` gains `ReducedMotionProvider` (`"user"`, `"always"` or
  `"never"`), so an app's own setting can override the system's. Components read the hook, never
  Tailwind's motion variants.
- Sizes: each item is bundled with esbuild, minified and gzipped, and checked against a budget in
  registry.json; CI fails over budget. `use-reduced-motion` 330 B (budget 400 B), `motion-tokens`
  104 B (budget 200 B).
- The docs page template: a playground with Slow motion (0.25×) and Reduced motion toggles,
  install commands with package-manager tabs and a copy button, props tables generated from the
  types, keyboard maps that the tests run, a size badge, and fixed sections. Pages for both items,
  sidebar groups, and this changelog in the docs.
- Tests: shared helpers for keyboard maps, ARIA states and live regions, and reduced motion; a
  check that every item has a complete page; end-to-end tests for the copy button and the
  playground's toggles, frame by frame in Chrome; the install test checks that the tokens land in
  the app's CSS.

## 0.0.1 · M0 · Setup, registry skeleton, live docs (2026-10-20)

- The name and namespace: Genframe, `@genframe` (checked against npm, GitHub and shadcn's Registry
  Index). Items are written in Radix style on shadcn's own parts, which a test showed install into
  both Base UI apps (shadcn's default) and Radix apps; React Aria apps aren't supported yet.
- The docs site: Next.js 16 + Fumadocs, built as static files and served by GitHub Pages at
  https://agzhxx.github.io/genframe/, in the Feed's tokens (dark, Ember, Instrument Sans) mapped
  onto shadcn's variables. Home page and Getting started; static search.
- The registry: `registry.json` with its first item, `use-reduced-motion` (a hook, 438 B gzip),
  built by `shadcn build` and served at `/r/registry.json` and `/r/use-reduced-motion.json`.
- The install test: every item into fresh Base UI and Radix shadcn apps (`fixtures/`), through
  `shadcn registry add` and `shadcn add`, then `tsc -b` and `vite build` there.
- Tests: Vitest and Testing Library (4 tests for the hook), Playwright in Google Chrome with axe
  (every docs page without console errors or serious issues, every registry item served, search),
  ESLint with typed rules and a ban on `next` imports in `registry/`.
- CI on every push and pull request: lint, typecheck, tests, registry check and build, site
  build, end-to-end tests, install test; pushes to `main` deploy to GitHub Pages. The size check
  (M1) and Lighthouse CI (by M8) join later.
