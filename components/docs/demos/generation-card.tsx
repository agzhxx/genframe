'use client';

import { useEffect, useState } from 'react';
import { Playground } from '@/components/docs/playground';
import { Button } from '@/components/ui/button';
import { posterUrl } from '@/lib/feed-media';
import { imageResults, videoResults, type FeedResult } from '@/lib/feed-results';
import type { GenerationJob } from '@/registry/lib/generation-queue-reducer';
import { GenerationCard, jobName } from '@/registry/ui/generation-card/generation-card';

const [city] = imageResults['1:1'];
const [rowboat] = imageResults['9:16'];
const [ferry] = imageResults['16:9'];
const [balloon] = imageResults['3:4'];
const [whale] = videoResults['16:9'];
const [lanterns] = videoResults['9:16'];
if (!city || !rowboat || !ferry || !balloon || !whale || !lanterns) throw new Error('No demo results');

function job(
  number: number,
  kind: GenerationJob['kind'],
  ratio: string,
  sample: FeedResult,
  state: Partial<GenerationJob>,
): GenerationJob {
  return {
    kind,
    prompt: sample.prompt,
    ratio,
    id: `${kind}-${String(number)}`,
    number,
    status: 'queued',
    attempt: 1,
    estimate: null,
    startedAt: null,
    progress: null,
    progressAt: null,
    result: null,
    error: null,
    refunded: false,
    ...state,
  };
}

function resultOf(sample: FeedResult) {
  return {
    src: posterUrl(sample, 640, 'webp'),
    width: sample.width,
    height: sample.height,
    thumbhash: sample.thumbhash,
    alt: sample.description,
  };
}

// Every state, with its place in line and time left as GenerationQueue would work them out.
const gallery: { job: GenerationJob; position?: number; timeLeft?: number }[] = [
  { job: job(4, 'image', '1:1', city, { status: 'queued' }), position: 2, timeLeft: 38_000 },
  { job: job(3, 'image', '3:4', balloon, { status: 'running', progress: 0.45 }), timeLeft: 12_000 },
  { job: job(2, 'video', '16:9', whale, { status: 'running' }), timeLeft: 21_000 },
  { job: job(2, 'image', '16:9', ferry, { status: 'succeeded', progress: 1, result: resultOf(ferry) }) },
  { job: job(1, 'video', '9:16', lanterns, { status: 'failed', error: 'The model timed out' }) },
  { job: job(1, 'image', '9:16', rowboat, { status: 'canceled', refunded: true }) },
];

// The succeeded card again, as a job that finishes while you watch: it's running for a moment,
// then its result is revealed.
function ReplayedCard({ onAction }: { onAction: (action: string) => void }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDone(true);
    }, 600);
    return () => {
      clearTimeout(timer);
    };
  }, []);
  const [entry] = gallery.filter(({ job: { status } }) => status === 'succeeded');
  if (!entry) return null;
  const running = { ...entry.job, status: 'running' as const, progress: 0.92, result: null };
  return <GallerySlot job={done ? entry.job : running} timeLeft={done ? undefined : 1000} onAction={onAction} />;
}

function GallerySlot({
  job: shown,
  position,
  timeLeft,
  onAction,
}: {
  job: GenerationJob;
  position?: number;
  timeLeft?: number;
  onAction: (action: string) => void;
}) {
  const report = (action: string) => (pressed: GenerationJob) => {
    onAction(`${action} ${jobName(pressed).toLowerCase()}`);
  };
  return (
    <GenerationCard
      job={shown}
      position={position}
      timeLeft={timeLeft}
      onCancel={report('Cancel')}
      onRetry={report('Retry')}
      onRemove={report('Remove')}
      onOpen={report('Open')}
    />
  );
}

/**
 * GenerationCard's playground: one card in each state, side by side, with the Feed's worlds as the
 * results. Replay shows the succeeded card finishing again, with its reveal.
 */
export function GenerationCardDemo() {
  const [replays, setReplays] = useState(0);
  const [pressed, setPressed] = useState('');

  return (
    <Playground
      title="GenerationCard demo"
      wide
      controls={
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setReplays((count) => count + 1);
            }}
          >
            Replay the reveal
          </Button>
          <p className="text-muted-foreground" aria-live="polite">
            {pressed ? (
              <>
                Pressed: <span className="text-foreground">{pressed}</span>
              </>
            ) : (
              'Press a card’s buttons: the demo only shows what you pressed.'
            )}
          </p>
        </div>
      }
    >
      <div className="flex w-full flex-col gap-3">
        <ul
          aria-label="Card states"
          className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,13rem),1fr))] items-start gap-4"
        >
          {gallery.map((entry) => (
            <li key={entry.job.id} data-state={entry.job.status}>
              {entry.job.status === 'succeeded' && replays > 0 ? (
                <ReplayedCard key={replays} onAction={setPressed} />
              ) : (
                <GallerySlot {...entry} onAction={setPressed} />
              )}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Results and prompts: AI-generated images and clips from Generation Feed; a video’s result is its poster.
        </p>
      </div>
    </Playground>
  );
}
