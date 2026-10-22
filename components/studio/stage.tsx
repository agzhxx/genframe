'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { FeedPicture } from '@/components/docs/feed-picture';
import { Button } from '@/components/ui/button';
import { demoModels } from '@/lib/demo-models';
import { posterUrl, videoUrl } from '@/lib/feed-media';
import type { StudioClip, StudioImage } from '@/lib/feed-studio';
import { basePath } from '@/lib/site';
import type { StudioJob } from '@/lib/studio-results';
import { useReducedMotion } from '@/registry/hooks/use-reduced-motion';
import { frameAt, useMediaElement } from '@/registry/hooks/use-scrubber';
import { formatTimecode, frameCount } from '@/registry/lib/timecode';
import { CompareSlider } from '@/registry/ui/compare-slider/compare-slider';
import { jobName } from '@/registry/ui/generation-card/generation-card';
import { VideoScrubber } from '@/registry/ui/video-scrubber/video-scrubber';

const modelNames = new Map(demoModels().map((model) => [model.id, model.name]));

// The media's box: full width, but a portrait narrows rather than grow past 30rem tall.
function boxStyle({ width, height }: { width: number; height: number }): CSSProperties {
  return { maxWidth: `${String(Math.round((30 * width * 100) / height) / 100)}rem` };
}

const sizes = '(min-width: 1024px) 640px, 100vw';

/**
 * The Studio's opened result: an image's draft and final in CompareSlider, or an image on its own
 * where the Feed has no draft, or a clip in a plain <video> with VideoScrubber. Its heading takes
 * focus when it opens, so keyboard and screen reader users land on it.
 */
export function Stage({ job, onClose }: { job: StudioJob; onClose: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const name = jobName(job);
  const { media } = job;

  useEffect(() => {
    heading.current?.focus();
  }, [job.id]);

  return (
    <section aria-labelledby={`stage-${job.id}`} data-slot="studio-stage" className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 ref={heading} id={`stage-${job.id}`} tabIndex={-1} className="text-base font-semibold outline-none">
          {name}
        </h2>
        <span className="text-sm text-muted-foreground tabular-nums">
          {job.ratio} · {modelNames.get(job.model) ?? job.model}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          aria-label={`Close ${name.toLowerCase()}`}
          onClick={onClose}
        >
          Close
        </Button>
      </div>
      {media.kind === 'image' ? <StagedImage image={media} /> : <StagedClip clip={media} askedMove={job.move !== undefined} />}
    </section>
  );
}

function StagedImage({ image }: { image: StudioImage }) {
  const { draft } = image;
  return (
    <figure className="flex flex-col gap-2">
      <div className="mx-auto w-full" style={boxStyle(image)}>
        {draft ? (
          <CompareSlider
            labels={{ before: 'Draft', after: 'Final' }}
            className="w-full rounded-lg"
            before={<FeedPicture image={draft} alt={`Draft: ${draft.description}`} sizes={sizes} className="size-full" />}
            after={<FeedPicture image={image} alt={`Final: ${image.description}`} sizes={sizes} className="size-full" />}
          />
        ) : (
          <FeedPicture image={image} alt={image.description} sizes={sizes} className="block w-full rounded-lg" />
        )}
      </div>
      <figcaption className="text-xs text-muted-foreground">
        {draft
          ? `${image.description}. The draft was made with ${draft.model}, and the final from it with ${image.model}: AI-generated images from Generation Feed.`
          : `${image.description}. Made with ${image.model}: an AI-generated image from Generation Feed, which has drafts and finals in 16:9 and 3:4 only.`}
      </figcaption>
    </figure>
  );
}

function StagedClip({ clip, askedMove }: { clip: StudioClip; askedMove: boolean }) {
  const reduced = useReducedMotion();
  const video = useRef<HTMLVideoElement>(null);
  const media = useMediaElement(video);
  const [playing, setPlaying] = useState(false);
  const { fps } = clip.sprite;
  const sprite = { ...clip.sprite, url: `${basePath}/sprites/${clip.sprite.url}` };
  const { currentTime, duration } = media;
  const known = duration > 0 && Number.isFinite(duration);
  const time = known
    ? `${formatTimecode(frameAt(currentTime, duration, fps), fps)} / ${formatTimecode(frameCount(duration, fps), fps)}`
    : formatTimecode(0, fps);

  // A clip plays by itself when it opens, muted, except with reduced motion: then it waits for Play.
  useEffect(() => {
    if (reduced) video.current?.pause();
  }, [reduced]);

  return (
    <figure className="flex flex-col gap-2">
      <div className="mx-auto flex w-full flex-col gap-2" style={boxStyle(clip)}>
        <video
          ref={video}
          src={videoUrl(clip)}
          poster={posterUrl(clip, 960, 'webp')}
          aria-label={clip.description}
          muted
          loop
          playsInline
          preload="metadata"
          autoPlay={!reduced}
          onPlay={() => {
            setPlaying(true);
          }}
          onPause={() => {
            setPlaying(false);
          }}
          onEmptied={() => {
            setPlaying(false);
          }}
          className="block w-full rounded-lg bg-muted object-cover"
          style={{ aspectRatio: `${String(clip.width)} / ${String(clip.height)}` }}
        />
        <VideoScrubber {...media} fps={fps} sprite={sprite} thumbnailWidth={clip.sprite.width} />
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const element = video.current;
              if (element?.paused) element.play().catch(() => undefined);
              else element?.pause();
            }}
          >
            {playing ? 'Pause' : 'Play'}
          </Button>
          <span data-slot="studio-timecode" className="text-sm text-muted-foreground tabular-nums">
            {time}
          </span>
        </div>
      </div>
      <figcaption className="text-xs text-muted-foreground">
        {clip.description}. Made with {clip.model}: an AI-generated clip from Generation Feed.
        {askedMove && !clip.move ? ' The Feed’s camera moves are all 16:9, so this one has none.' : null}
      </figcaption>
    </figure>
  );
}
