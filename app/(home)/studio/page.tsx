import type { Metadata } from 'next';
import Link from 'next/link';
import { Studio } from '@/components/studio/studio';

export const metadata: Metadata = {
  title: 'Studio',
  description:
    'Genframe’s components as one small creation studio on a simulated generator: write a prompt, generate, watch the queue, compare a draft with its final, scrub a clip.',
};

// The components the Studio is made of, and what each does there.
const parts = [
  { name: 'PromptComposer', page: 'components/prompt-composer', role: 'the prompt, its references and the toolbar' },
  { name: 'ModelPicker', page: 'components/model-picker', role: 'the model, with what a run costs' },
  { name: 'AspectRatioPicker', page: 'components/aspect-ratio-picker', role: 'the shape, compact in the toolbar' },
  { name: 'estimateCost', page: 'utilities/estimate-cost', role: 'the cost hint by the Generate button' },
  { name: 'CameraMotionPicker', page: 'components/camera-motion-picker', role: 'a video’s camera move' },
  { name: 'useGenerationQueue', page: 'utilities/use-generation-queue', role: 'runs the jobs, two at a time' },
  { name: 'createSimulatedGenerator', page: 'utilities/simulated-generator', role: 'the pretend generator' },
  { name: 'GenerationQueue', page: 'components/generation-queue', role: 'the jobs as cards, newest first' },
  { name: 'DenoiseReveal', page: 'components/denoise-reveal', role: 'each result sharpening out of grain' },
  { name: 'CompareSlider', page: 'components/compare-slider', role: 'an image’s draft against its final' },
  { name: 'VideoScrubber', page: 'components/video-scrubber', role: 'a clip’s scrub bar, with useMediaElement' },
];

export default function StudioPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-10 sm:py-14">
      <header className="flex max-w-3xl flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Studio</h1>
        <p className="text-lg text-muted-foreground">
          Genframe’s components working together as one small creation studio: write a prompt, pick a model, a shape
          and a camera move, generate, watch the queue, see each result sharpen into view, then compare a draft with
          its final or scrub a clip.
        </p>
      </header>

      <Studio />

      <section aria-labelledby="parts" className="flex max-w-3xl flex-col gap-3">
        <h2 id="parts" className="text-xl font-semibold">
          What it’s made of
        </h2>
        <p className="text-muted-foreground">
          Each part gets its data as props and reports what happens through callbacks; the Studio only keeps the
          state between them.
        </p>
        <ul className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {parts.map((part) => (
            <li key={part.name}>
              <Link href={`/docs/${part.page}/`} className="font-medium text-foreground underline underline-offset-4">
                {part.name}
              </Link>
              <span className="text-muted-foreground">: {part.role}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
