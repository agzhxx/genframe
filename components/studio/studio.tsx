'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { SelectControl } from '@/components/docs/controls';
import { Playground } from '@/components/docs/playground';
import { Button } from '@/components/ui/button';
import { byKind, demoModels, pricesChecked } from '@/lib/demo-models';
import { cameraMoves, cameraMoveScenes, type CameraMove } from '@/lib/feed-camera-moves';
import { posterUrl, videoUrl } from '@/lib/feed-media';
import { studioRatios, type StudioRatio } from '@/lib/feed-studio';
import { pickResult, settingsKey, type StudioRequest, type StudioSettings } from '@/lib/studio-results';
import { useGenerationQueue } from '@/registry/hooks/use-generation-queue';
import { VideoPoolProvider } from '@/registry/hooks/use-video-pool';
import { estimateCost, formatEstimate } from '@/registry/lib/estimate-cost';
import { createSimulatedGenerator } from '@/registry/lib/simulated-generator';
import { AspectRatioPicker } from '@/registry/ui/aspect-ratio-picker/aspect-ratio-picker';
import { CameraMotionPicker, type CameraMotionOption } from '@/registry/ui/camera-motion-picker/camera-motion-picker';
import { GenerationQueue } from '@/registry/ui/generation-queue/generation-queue';
import { ModelPicker, type ModelOption } from '@/registry/ui/model-picker/model-picker';
import { PromptComposer, type PromptReference } from '@/registry/ui/prompt-composer/prompt-composer';
import { Stage } from './stage';

const models = demoModels('sale');

function modelById(id: string): ModelOption {
  const model = models.find((entry) => entry.id === id) ?? models[0];
  if (!model) throw new Error('No demo models');
  return model;
}

// The moves to pick from: the Feed's red car in each, made with Cinema Studio 4.0's presets.
const moveOptions: CameraMotionOption[] = (cameraMoveScenes[0]?.clips ?? []).map((clip) => ({
  id: clip.move,
  ...cameraMoves[clip.move],
  previewSrc: videoUrl(clip),
  poster: posterUrl(clip, 480, 'webp'),
}));

const speeds = [
  { value: '1', label: '1×' },
  { value: '2', label: '2×' },
  { value: '4', label: '4×' },
];
const failureRates = [
  { value: '0', label: 'None' },
  { value: '0.2', label: '1 in 5' },
  { value: '1', label: 'All' },
];

function isStudioRatio(ratio: string): ratio is StudioRatio {
  return (studioRatios as readonly string[]).includes(ratio);
}

function isCameraMove(id: string): id is CameraMove {
  return Object.hasOwn(cameraMoves, id);
}

/**
 * The Studio: Genframe's components as one small creation studio. Write a prompt with
 * PromptComposer (ModelPicker, a compact AspectRatioPicker and estimateCost's hint in its
 * toolbar), pick a camera move for a video, and generate: useGenerationQueue runs the job on the
 * simulated generator, GenerationQueue shows it waiting, running and revealed. Open a result to
 * compare its draft and final in CompareSlider, or to scrub its clip with VideoScrubber. Each
 * component gets data in and sends events out; the Studio only keeps the state between them.
 */
export function Studio() {
  const [speed, setSpeed] = useState('1');
  const [failureRate, setFailureRate] = useState('0');
  return (
    <VideoPoolProvider>
      <Playground
        title="Studio"
        wide
        toolbar={
          <>
            <SelectControl inline label="Speed" value={speed} options={speeds} onValueChange={setSpeed} />
            <SelectControl inline label="Failures" value={failureRate} options={failureRates} onValueChange={setFailureRate} />
          </>
        }
      >
        <StudioBody speed={Number(speed)} failureRate={Number(failureRate)} />
      </Playground>
    </VideoPoolProvider>
  );
}

function StudioBody({ speed, failureRate }: { speed: number; failureRate: number }) {
  const id = useId();
  const [modelId, setModelId] = useState('grok-imagine-2');
  const [ratio, setRatio] = useState<StudioRatio>('16:9');
  const [move, setMove] = useState<CameraMove | undefined>();
  const [references, setReferences] = useState<PromptReference[]>([]);
  const [openedId, setOpenedId] = useState<string | null>(null);
  // How many jobs were submitted with each set of settings, so they take the Feed's media in turn.
  const turns = useRef(new Map<string, number>());
  // What opened the stage, to go back to when it closes.
  const opener = useRef<HTMLElement | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const model = modelById(modelId);
  const video = model.kind === 'video';
  const costSettings = { count: 1, references: references.length };
  const estimate = estimateCost(model, { ...costSettings, duration: model.durations?.[0] });
  const cost = estimate ? formatEstimate(estimate) : null;

  const driver = useMemo(
    () =>
      createSimulatedGenerator<StudioRequest>({
        result: ({ media }) => ({
          src: posterUrl(media, 640, 'webp'),
          width: media.width,
          height: media.height,
          thumbhash: media.thumbhash,
          alt: media.description,
        }),
        durations: { image: [3000 / speed, 6000 / speed], video: [8000 / speed, 14_000 / speed] },
        failureRate,
      }),
    [speed, failureRate],
  );
  const queue = useGenerationQueue({ driver });
  const opened = queue.jobs.find((job) => job.id === openedId && job.status === 'succeeded');

  function submit(prompt: string) {
    const settings: StudioSettings = { kind: model.kind, ratio, model: model.name, move: video ? move : undefined };
    const key = settingsKey(settings);
    const turn = turns.current.get(key) ?? 0;
    turns.current.set(key, turn + 1);
    queue.submit({ kind: model.kind, ratio, prompt, model: model.id, move: settings.move, media: pickResult(settings, turn) });
  }

  function close() {
    const back = opener.current;
    flushSync(() => {
      setOpenedId(null);
    });
    // Back to the Open button, or to the list when its card has gone.
    const list = root.current?.querySelector<HTMLElement>('[data-slot="generation-queue-list"]');
    (back?.isConnected ? back : list)?.focus();
  }

  return (
    <div ref={root} className="flex w-full min-w-0 flex-col gap-6">
      <p data-slot="studio-note" className="max-w-3xl text-sm text-muted-foreground">
        <strong className="font-medium text-foreground">Generation is simulated:</strong> nothing is sent anywhere or
        made from your prompt. Each result is an AI-generated image or clip from Generation Feed, picked to match
        your settings: the kind, the shape, the camera move and, where the Feed has it, the model. Example prices:
        Higgsfield’s API prices, checked on {pricesChecked}.
      </p>

      <PromptComposer
        placeholder="Describe the image or clip; type @ to mention a reference"
        maxLength={500}
        references={references}
        onReferencesChange={setReferences}
        maxReferences={4}
        toolbar={
          <>
            <ModelPicker
              models={models}
              value={modelId}
              onValueChange={setModelId}
              settings={costSettings}
              groupBy={byKind}
              className="w-52"
            />
            <AspectRatioPicker
              compact
              ratios={[...studioRatios]}
              value={ratio}
              onValueChange={(next) => {
                if (isStudioRatio(next)) setRatio(next);
              }}
            />
          </>
        }
        costHint={cost ? `${cost.breakdown} ${cost.total}` : undefined}
        onSubmit={({ text }) => {
          submit(text.trim());
        }}
      />

      {video ? (
        <section aria-labelledby={`${id}-move`} data-slot="studio-camera-move" className="flex flex-col gap-3">
          <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1">
            <h2 id={`${id}-move`} className="text-base font-semibold">
              Camera move
            </h2>
            <span className="text-sm text-muted-foreground">
              {move ? cameraMoves[move].label : 'None: the model decides'}
            </span>
            {move ? (
              <Button
                variant="ghost"
                size="sm"
                aria-label="Clear the camera move"
                onClick={(event) => {
                  const section = event.currentTarget.closest('section');
                  setMove(undefined);
                  // The button goes with the move: focus the moves, where Tab would have gone.
                  section?.querySelector<HTMLInputElement>('input[type="radio"]')?.focus();
                }}
              >
                Clear
              </Button>
            ) : null}
          </div>
          <CameraMotionPicker
            aria-labelledby={`${id}-move`}
            options={moveOptions}
            value={move ?? ''}
            onValueChange={(next) => {
              if (isCameraMove(next)) setMove(next);
            }}
          />
        </section>
      ) : null}

      <div className={opened ? 'grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]' : 'grid gap-6'}>
        {/* Keyed by the job: another result opens a fresh player. */}
        {opened ? <Stage key={opened.id} job={opened} onClose={close} /> : null}
        <section aria-labelledby={`${id}-generations`} className="flex min-w-0 flex-col gap-3">
          <h2 id={`${id}-generations`} className="text-base font-semibold">
            Generations
          </h2>
          {queue.jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              None yet: write a prompt, then press Generate or Ctrl+Enter (⌘+Enter on a Mac).
            </p>
          ) : null}
          <GenerationQueue
            jobs={queue.jobs}
            aria-labelledby={`${id}-generations`}
            onCancel={(job) => {
              queue.cancel(job.id);
            }}
            onRetry={(job) => {
              queue.retry(job.id);
            }}
            onRemove={(job) => {
              queue.remove(job.id);
            }}
            onOpen={(job) => {
              opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
              setOpenedId(job.id);
            }}
          />
        </section>
      </div>
    </div>
  );
}
