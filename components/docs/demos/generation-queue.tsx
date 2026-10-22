'use client';

import { useMemo, useRef, useState } from 'react';
import { SelectControl, SwitchControl } from '@/components/docs/controls';
import { FeedPicture } from '@/components/docs/feed-picture';
import { Playground } from '@/components/docs/playground';
import { Button } from '@/components/ui/button';
import { posterUrl, videoUrl } from '@/lib/feed-media';
import {
  imageResults,
  resultRatios,
  videoResults,
  type FeedClipResult,
  type FeedResult,
  type ResultRatio,
} from '@/lib/feed-results';
import { useGenerationQueue } from '@/registry/hooks/use-generation-queue';
import { useReducedMotion } from '@/registry/hooks/use-reduced-motion';
import type { GenerationJob, GenerationKind, GenerationRequest } from '@/registry/lib/generation-queue-reducer';
import { createSimulatedGenerator } from '@/registry/lib/simulated-generator';
import { AspectRatioPicker } from '@/registry/ui/aspect-ratio-picker/aspect-ratio-picker';
import { jobName } from '@/registry/ui/generation-card/generation-card';
import { GenerationQueue } from '@/registry/ui/generation-queue/generation-queue';

// The demo's requests carry the Feed media that they'll "make": the queue carries extra fields
// along, and the simulated generator hands it back as the result.
interface DemoRequest extends GenerationRequest {
  sample: FeedResult | FeedClipResult;
}
type DemoJob = GenerationJob<DemoRequest>;

const kinds = [
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
] as const satisfies readonly { value: GenerationKind; label: string }[];
const concurrencies = ['1', '2', '3', '4'].map((value) => ({ value, label: value }));
const failureRates = [
  { value: '0', label: 'None' },
  { value: '0.2', label: '1 in 5' },
  { value: '0.5', label: 'Half' },
  { value: '1', label: 'All' },
];
const speeds = [
  { value: '0.5', label: '0.5×' },
  { value: '1', label: '1×' },
  { value: '2', label: '2×' },
  { value: '4', label: '4×' },
];

function isResultRatio(ratio: string): ratio is ResultRatio {
  return (resultRatios as readonly string[]).includes(ratio);
}

/**
 * GenerationQueue's playground: jobs run on the simulated generator, and the Feed's worlds are what
 * they make. A video's result is its clip's poster; opening it plays the clip.
 */
export function GenerationQueueDemo() {
  const reduced = useReducedMotion();
  const [kind, setKind] = useState<GenerationKind>('image');
  const [ratio, setRatio] = useState<ResultRatio>('16:9');
  const [concurrency, setConcurrency] = useState('2');
  const [failureRate, setFailureRate] = useState('0.2');
  const [unknownProgress, setUnknownProgress] = useState(false);
  const [speed, setSpeed] = useState('1');
  const [opened, setOpened] = useState<DemoJob | null>(null);
  // How many jobs of each kind and ratio were added, to take the Feed's samples in turn.
  const added = useRef(new Map<string, number>());

  const driver = useMemo(() => {
    const scale = 1 / Number(speed);
    return createSimulatedGenerator<DemoRequest>({
      result: ({ sample }) => ({
        src: posterUrl(sample, 640, 'webp'),
        width: sample.width,
        height: sample.height,
        thumbhash: sample.thumbhash,
        alt: sample.description,
      }),
      durations: { image: [3000 * scale, 6000 * scale], video: [8000 * scale, 14_000 * scale] },
      failureRate: Number(failureRate),
      unknownProgress,
    });
  }, [speed, failureRate, unknownProgress]);
  const queue = useGenerationQueue({ driver, concurrency: Number(concurrency) });

  function addJob() {
    const key = `${kind} ${ratio}`;
    const count = added.current.get(key) ?? 0;
    added.current.set(key, count + 1);
    const samples = kind === 'image' ? imageResults[ratio] : videoResults[ratio];
    const sample = samples[count % samples.length];
    if (sample) queue.submit({ kind, ratio, prompt: sample.prompt, sample });
  }

  return (
    <Playground
      title="GenerationQueue demo"
      wide
      controls={
        <div className="flex flex-col gap-4 text-sm">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <div className="w-32">
              <SelectControl label="Kind" value={kind} options={kinds} onValueChange={setKind} />
            </div>
            <AspectRatioPicker
              compact
              ratios={[...resultRatios]}
              value={ratio}
              onValueChange={(next) => {
                if (isResultRatio(next)) setRatio(next);
              }}
            />
            <Button onClick={addJob}>Add job</Button>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <SelectControl label="At once" value={concurrency} options={concurrencies} onValueChange={setConcurrency} />
            <SelectControl label="Failures" value={failureRate} options={failureRates} onValueChange={setFailureRate} />
            <SelectControl label="Speed" value={speed} options={speeds} onValueChange={setSpeed} />
            <div className="flex items-end pb-1.5">
              <SwitchControl label="Unknown progress" checked={unknownProgress} onCheckedChange={setUnknownProgress} />
            </div>
          </div>
        </div>
      }
    >
      <div className="flex w-full flex-col gap-4">
        {queue.jobs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No jobs yet: add one below. They run on a simulated generator.
          </p>
        ) : null}
        <GenerationQueue
          jobs={queue.jobs}
          concurrency={Number(concurrency)}
          onCancel={(job) => {
            queue.cancel(job.id);
          }}
          onRetry={(job) => {
            queue.retry(job.id);
          }}
          onRemove={(job) => {
            queue.remove(job.id);
            if (opened?.id === job.id) setOpened(null);
          }}
          onOpen={setOpened}
        />
        {opened?.result ? (
          <figure data-slot="demo-opened" className="flex flex-col items-center gap-2 rounded-xl border bg-card p-3">
            {'duration' in opened.sample ? (
              <video
                key={opened.id}
                src={videoUrl(opened.sample)}
                poster={opened.result.src}
                aria-label={opened.sample.description}
                controls
                muted
                loop
                playsInline
                autoPlay={!reduced}
                className="max-h-96 w-auto max-w-full rounded-lg"
              />
            ) : (
              <FeedPicture
                image={opened.sample}
                alt={opened.sample.description}
                sizes="(min-width: 768px) 640px, 100vw"
                className="max-h-96 w-auto max-w-full rounded-lg"
              />
            )}
            <figcaption className="text-center text-xs text-muted-foreground">
              Opened <span className="text-foreground">{jobName(opened)}</span>: {opened.sample.description}.
            </figcaption>
          </figure>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Results and prompts: AI-generated images and clips from Generation Feed; a video’s result is its poster.
        </p>
      </div>
    </Playground>
  );
}
