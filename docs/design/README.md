# Genframe: design hand-off

What a Figma file of the Kit needs, made from the code: the tokens as Figma variables, and a
screenshot of each component at its key states to draw its frame next to. The code stays the
source of truth; the file shows the same values.

| What | Where |
| --- | --- |
| Figma file (variables, text styles, component frames) | _Add the public link here once the file is published (steps below)_ |
| Tokens for Figma | [tokens.figma.json](tokens.figma.json), in the W3C design-tokens format |
| Tokens in code | [app/global.css](../../app/global.css) (colors, radii) and the `motion-tokens` item in [registry.json](../../registry.json) |
| Screenshots | [screenshots/](screenshots/), 10 PNGs, 236.7 KB in all |

Both are made by scripts, so they can't be copied wrong:

- `node scripts/design-tokens.ts` writes `tokens.figma.json` from the code.
  `tests/design-tokens.test.ts` fails as soon as the code and the file disagree, so CI says when to
  run it again (and the Figma variables need the same change).
- `pnpm build && node scripts/design-screenshots.ts` takes the screenshots from the built site in
  Google Chrome at 1×, so a frame and its screenshot match pixel for pixel. The Feed's images are
  the end-to-end tests' stand-ins, flat colors in its media's shapes: a frame shows the component,
  not a photograph. ffmpeg stores them with a palette of 256 colors.

## Tokens

Generation Feed's values on shadcn's names: the components only use shadcn's names
(`bg-background`, `text-muted-foreground`), so in someone else's app they take that app's theme.

| Variable | Value | Feed token, or what it's for |
| --- | --- | --- |
| `color/background` | `#0b0b0c` | bg |
| `color/foreground` | `#f2f2f3` | fg |
| `color/card`, `color/muted` | `#141416` | surface |
| `color/popover`, `color/secondary`, `color/accent` | `#1d1d20` | surface-raised; shadcn's accent is the hover fill |
| `color/muted-foreground` | `#a8a8b0` | fg-muted |
| `color/primary`, `color/ring` | `#ff7a45` | accent ("Ember") and focus |
| `color/primary-foreground` | `#1a0a03` | on-accent |
| `color/destructive` | `#ff6b81` | danger |
| `color/border` | `#2a2a2f` | line |
| `color/input` | `#62626b` | line-strong |
| `radius/sm`, `md`, `lg`, `xl`, `full` | 4, 6, 8, 12, 9999 px | badges, cards, controls, panels, pills and handles |
| `font-family/sans` | Instrument Sans | 400, 500 and 600 |
| `font-size`/`line-height` `xs` to `xl` | 12/16, 14/20, 16/24, 18/28, 20/28 px | Tailwind's sizes, as the components use them |
| `motion/duration-fast`, `-base`, `-reveal` | 120, 220, 600 ms | feedback; things that move, open or appear; a result coming into view |
| `motion/ease-out` | cubic-bezier(0.2, 0.8, 0.2, 1) | every transition but the spring |
| `motion/spring` | mass 1, stiffness 1968.7, damping 66.6 | a slider's handle moving to a click: settles in 220 ms, 2.8% overshoot |

## Building the Figma file

About two hours by hand: no tool here can write to Figma.

1. Create a design file called "Genframe".
2. Add the tokens as variables. Fast way: install the Tokens Studio for Figma plugin, load
   `tokens.figma.json` into it as a local file, then export the tokens to Figma variables. Manual
   way: open Local variables, make a collection "Genframe" and add the color, radius and size
   variables from the table above.
3. Make text styles from the sizes: `xs` to `xl` in Instrument Sans (one of Figma's Google
   fonts), at 400, 500 and 600.
4. Motion, for prototypes: Smart animate with a custom bezier of 0.2, 0.8, 0.2, 1 over 120, 220 or
   600 ms; the slider's handle with a custom spring of mass 1, stiffness 1968.7 and damping 66.6.
   If Figma's stiffness doesn't go that high, halve the mass, the stiffness and the damping (0.5,
   984.4, 33.3): the same spring.
5. Draw the frames below, each next to its screenshot (place the PNG, lock it, and build the frame
   beside it at the same size), with auto layout and the variables, never raw values. Images are
   rectangles with a gradient fill, as in the Feed's file.
6. Share the file as "Anyone with the link can view", paste the link into the table at the top of
   this file and into the project README, and tick the spec's second M7 box.

## Component frames

| Frame | Screenshot | Size (px) | What it shows |
| --- | --- | --- | --- |
| CompareSlider / 50% | [compare-slider.png](screenshots/compare-slider.png) | 374 × 211 | Two layers split at the divider, the round handle with its arrows, the Final and Draft labels |
| AspectRatioPicker / Disabled ratios | [aspect-ratio-picker.png](screenshots/aspect-ratio-picker.png) | 292 × 124 | A frame per ratio in its shape, the picked one in Ember, disabled ones faded |
| ModelPicker / Open | [model-picker-open.png](screenshots/model-picker-open.png) | 384 × 332 | The search box, the models in groups with badges and the estimate, the active and the current option |
| PromptComposer / Mentions open | [prompt-composer.png](screenshots/prompt-composer.png) | 630 × 385 | References, the mention list, preset chips (one on), the toolbar, the count, the cost and Generate |
| GenerationCard / States | [generation-card-states.png](screenshots/generation-card-states.png) | 630 × 1242 | Queued, running, running without progress, succeeded, failed and canceled, with their buttons |
| DenoiseReveal / Grain | [denoise-reveal-grain.png](screenshots/denoise-reveal-grain.png) | 374 × 211 | The first frame of a reveal: grain over the ThumbHash (a noise fill in Figma) |
| MediaCard / Play buttons | [media-card.png](screenshots/media-card.png) | 630 × 266 | An image, a clip and a clip as a button, with the AI and length badges and play buttons |
| VideoScrubber / Preview | [video-scrubber-preview.png](screenshots/video-scrubber-preview.png) | 374 × 319 | The bar, the thumb, and the preview: a sprite tile in a 2 px ring, and its timecode |
| CameraMotionPicker / Play buttons | [camera-motion-picker.png](screenshots/camera-motion-picker.png) | 630 × 382 | Eight tiles with poster, name and description, the picked one checked, play buttons |
| Studio / Draft and final | [studio.png](screenshots/studio.png) | 1120 × 860 | The components together: the prompt box and toolbar, the opened image in the slider, the queue |

For each frame, two more states the screenshots don't show: keyboard focus (a 3 px ring of
`color/ring` at 50%, outside the control) and reduced motion, which changes no layout (the reveal
becomes a fade; play buttons replace previews that play by themselves).
