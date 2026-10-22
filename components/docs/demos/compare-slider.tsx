'use client';

import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { SelectControl, SwitchControl } from '@/components/docs/controls';
import { FeedPicture } from '@/components/docs/feed-picture';
import { Playground } from '@/components/docs/playground';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { dayNightPairs, draftFinalPairs, ferryClip, posterUrl, videoUrl, type ImagePair } from '@/lib/feed-media';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/registry/hooks/use-reduced-motion';
import { CompareSlider, type CompareSliderOrientation } from '@/registry/ui/compare-slider/compare-slider';

interface Media {
  value: string;
  label: string;
  labels: { before: string; after: string };
  /** The two images; the videos have none. */
  pair?: ImagePair;
}

const media: Media[] = [
  ...draftFinalPairs.map((pair, index) => ({
    value: `draft-final-${String(index)}`,
    label: `Draft and final: ${pair.name}`,
    labels: { before: 'Draft', after: 'Final' },
    pair,
  })),
  ...dayNightPairs.map((pair, index) => ({
    value: `day-night-${String(index)}`,
    label: `Day and night: ${pair.name}`,
    labels: { before: 'Day', after: 'Night' },
    pair,
  })),
  { value: 'videos', label: 'Two videos: the ferry', labels: { before: 'Grayscale', after: 'Color' } },
];

/**
 * CompareSlider's playground: the Feed's draft/final and day/night pairs, and two videos that
 * stay in step. The position is controlled here, for the readout.
 */
export function CompareSliderDemo() {
  const [chosen, setChosen] = useState('draft-final-0');
  const [orientation, setOrientation] = useState<CompareSliderOrientation>('horizontal');
  const [showLabels, setShowLabels] = useState(true);
  const [position, setPosition] = useState(50);
  const clock = useRef<HTMLVideoElement>(null);
  const follower = useRef<HTMLVideoElement>(null);
  const current = media.find((item) => item.value === chosen) ?? media[0];
  if (!current) throw new Error('No demo media');
  const labels = showLabels ? current.labels : undefined;
  const slider = { labels, orientation, position, onPositionChange: setPosition };

  return (
    <Playground
      title="CompareSlider demo"
      controls={
        <div className="flex flex-col gap-4 text-sm">
          <SelectControl label="Media" value={chosen} options={media} onValueChange={setChosen} />
          <SwitchControl
            label="Vertical"
            checked={orientation === 'vertical'}
            onCheckedChange={(vertical) => {
              setOrientation(vertical ? 'vertical' : 'horizontal');
            }}
          />
          <SwitchControl label="Labels" checked={showLabels} onCheckedChange={setShowLabels} />
          <p className="text-muted-foreground">
            Position <span className="text-foreground tabular-nums">{Math.round(position)}%</span>
            {labels ? (
              <>
                , read out as <span className="text-foreground">“{Math.round(position)}% {labels.after}”</span>
              </>
            ) : null}
          </p>
          {current.pair ? null : (
            <VideoControls
              clock={clock}
              follower={follower}
              onSeek={(time) => {
                if (clock.current) clock.current.currentTime = time;
              }}
            />
          )}
        </div>
      }
    >
      <figure className="flex w-full flex-col items-center gap-3">
        {current.pair ? (
          <ImageSlider pair={current.pair} {...slider} />
        ) : (
          <CompareSlider
            {...slider}
            className="aspect-video w-full max-w-xl rounded-lg"
            before={<FerryVideo ref={clock} className="grayscale" />}
            after={<FerryVideo ref={follower} />}
          />
        )}
        <figcaption className="max-w-xl text-center text-xs text-muted-foreground">
          {current.pair
            ? 'AI-generated images from Generation Feed.'
            : 'The Feed has no clip in two versions, so both layers play the same AI-generated clip, the before one in grayscale. If they drifted apart, the ferry would break at the divider.'}
        </figcaption>
      </figure>
    </Playground>
  );
}

function ImageSlider({
  pair,
  labels,
  ...slider
}: {
  pair: ImagePair;
  labels?: { before: string; after: string };
  orientation: CompareSliderOrientation;
  position: number;
  onPositionChange: (position: number) => void;
}) {
  const portrait = pair.after.height > pair.after.width;
  const sizes = portrait ? '(min-width: 768px) 320px, 100vw' : '(min-width: 768px) 576px, 100vw';
  return (
    <CompareSlider
      {...slider}
      labels={labels}
      className={cn('w-full rounded-lg', portrait ? 'max-w-xs' : 'max-w-xl')}
      before={
        <FeedPicture
          image={pair.before}
          alt={`${labels?.before ?? 'Before'}: ${pair.before.description}`}
          sizes={sizes}
          className="size-full"
        />
      }
      after={
        <FeedPicture
          image={pair.after}
          alt={`${labels?.after ?? 'After'}: ${pair.after.description}`}
          sizes={sizes}
          className="size-full"
        />
      }
    />
  );
}

function FerryVideo({ ref, className }: { ref: RefObject<HTMLVideoElement | null>; className?: string }) {
  return (
    <video
      ref={ref}
      src={videoUrl(ferryClip)}
      poster={posterUrl(ferryClip, 960, 'webp')}
      aria-label={ferryClip.description}
      muted
      loop
      playsInline
      preload="auto"
      className={cn('size-full object-cover', className)}
    />
  );
}

// Play and pause, a time bar, and how far apart the two videos are. They act on the before
// video; the slider passes everything on to the other one.
function VideoControls({
  clock,
  follower,
  onSeek,
}: {
  clock: RefObject<HTMLVideoElement | null>;
  follower: RefObject<HTMLVideoElement | null>;
  onSeek: (time: number) => void;
}) {
  const reduced = useReducedMotion();
  const timeId = useId();
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [apart, setApart] = useState(0);

  useEffect(() => {
    const video = clock.current;
    if (!video) return;
    function update() {
      if (!video) return;
      setPlaying(!video.paused);
      setTime(video.currentTime);
      setApart(Math.abs(video.currentTime - (follower.current?.currentTime ?? video.currentTime)));
    }
    const events = ['play', 'pause', 'timeupdate', 'seeked'];
    for (const type of events) video.addEventListener(type, update);
    return () => {
      for (const type of events) video.removeEventListener(type, update);
    };
  }, [clock, follower]);

  // The muted clips play on their own, except with reduced motion: then they wait for Play.
  useEffect(() => {
    const video = clock.current;
    if (reduced) video?.pause();
    else video?.play().catch(() => undefined);
  }, [clock, reduced]);

  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => {
          const video = clock.current;
          if (video?.paused) video.play().catch(() => undefined);
          else video?.pause();
        }}
      >
        {playing ? 'Pause' : 'Play'}
      </Button>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={timeId} className="font-normal text-muted-foreground">
          Time <span className="text-foreground tabular-nums">{time.toFixed(1)} s</span>
        </Label>
        <input
          id={timeId}
          type="range"
          min={0}
          max={ferryClip.duration}
          step={0.01}
          value={time}
          onChange={(event) => {
            onSeek(Number(event.target.value));
          }}
          className="w-full accent-primary"
        />
      </div>
      <p className="text-muted-foreground">
        Apart by <span className="text-foreground tabular-nums">{Math.round(apart * 1000)} ms</span>
      </p>
    </div>
  );
}
