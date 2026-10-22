'use client';

import { useRef, useState } from 'react';
import { SelectControl } from '@/components/docs/controls';
import { Playground } from '@/components/docs/playground';
import { Button } from '@/components/ui/button';
import { posterUrl, videoUrl } from '@/lib/feed-media';
import { storyClips } from '@/lib/feed-story';
import { basePath } from '@/lib/site';
import { frameAt, useMediaElement, type TimeRange } from '@/registry/hooks/use-scrubber';
import { formatTime, formatTimecode, frameCount, framesToSeconds, spokenTime } from '@/registry/lib/timecode';
import { VideoScrubber } from '@/registry/ui/video-scrubber/video-scrubber';

const clips = storyClips.map((clip) => ({ value: clip.id, label: `${clip.shot}: ${clip.description}` }));

const rates = [
  { value: 'none', label: 'None: no frame keys' },
  { value: '24', label: '24 fps, the clip’s' },
  { value: '23.976', label: '23.976 fps' },
  { value: '25', label: '25 fps' },
  { value: '29.97', label: '29.97 fps' },
  { value: '30', label: '30 fps' },
] as const;
type Rate = (typeof rates)[number]['value'];

const bufferings = [
  { value: 'video', label: 'What the video has buffered' },
  { value: 'example', label: 'An example with gaps' },
] as const;
type Buffering = (typeof bufferings)[number]['value'];

/** Buffered ranges with gaps: a 5 s clip buffers in a blink. */
function exampleRanges(duration: number): TimeRange[] {
  if (!(duration > 0)) return [];
  return [
    { start: 0, end: duration * 0.35 },
    { start: duration * 0.5, end: duration * 0.7 },
  ];
}

/**
 * VideoScrubber's playground: one of the Feed's story clips in a plain <video>, wired with
 * useMediaElement, with the sprite scripts/make-sprites.ts made of it.
 */
export function VideoScrubberDemo() {
  const video = useRef<HTMLVideoElement>(null);
  const media = useMediaElement(video);
  const [clipId, setClipId] = useState(clips[0]?.value ?? '');
  const [rate, setRate] = useState<Rate>('24');
  const [buffering, setBuffering] = useState<Buffering>('video');
  const [playing, setPlaying] = useState(false);
  const clip = storyClips.find((candidate) => candidate.id === clipId) ?? storyClips[0];
  if (!clip) throw new Error('No demo clip');
  const fps = rate === 'none' ? undefined : Number(rate);
  const sprite = { ...clip.sprite, url: `${basePath}/sprites/${clip.sprite.url}` };
  const buffered = buffering === 'example' ? exampleRanges(media.duration) : media.buffered;
  const { currentTime, duration } = media;
  const known = duration > 0 && Number.isFinite(duration);

  // The time as the scrubber reads it out: with a frame rate, the frame showing, and the length in
  // frames (121 frames at 24 fps is 00:00:05:01).
  const frame = fps !== undefined && known ? frameAt(currentTime, duration, fps) : null;
  const time =
    fps !== undefined && frame !== null
      ? `${formatTimecode(frame, fps)} / ${formatTimecode(frameCount(duration, fps), fps)}`
      : `${formatTime(currentTime)} / ${formatTime(known ? duration : 0)}`;
  const spoken = known
    ? `${spokenTime(fps !== undefined && frame !== null ? framesToSeconds(frame, fps) : currentTime, fps)} of ${spokenTime(duration)}`
    : null;

  return (
    <Playground
      title="VideoScrubber demo"
      controls={
        <div className="flex flex-col gap-4 text-sm">
          <SelectControl label="Clip" value={clipId} options={clips} onValueChange={setClipId} />
          <SelectControl label="Frame rate" value={rate} options={rates} onValueChange={setRate} />
          <SelectControl label="Buffered" value={buffering} options={bufferings} onValueChange={setBuffering} />
          <p className="text-muted-foreground" data-slot="scrubber-readout">
            {frame === null ? null : (
              <>
                Frame <span className="text-foreground tabular-nums">{frame}</span>.{' '}
              </>
            )}
            {spoken ? (
              <>
                Read out as <span className="text-foreground">“{spoken}”</span>
              </>
            ) : (
              'Loading the clip…'
            )}
          </p>
        </div>
      }
    >
      <figure className="flex w-full max-w-xl flex-col gap-2">
        <video
          ref={video}
          src={videoUrl(clip)}
          poster={posterUrl(clip, 960, 'webp')}
          aria-label={clip.description}
          muted
          playsInline
          preload="metadata"
          onPlay={() => {
            setPlaying(true);
          }}
          onPause={() => {
            setPlaying(false);
          }}
          onEmptied={() => {
            setPlaying(false);
          }}
          className="block aspect-video w-full rounded-lg bg-muted object-cover"
        />
        <VideoScrubber {...media} buffered={buffered} fps={fps} sprite={sprite} />
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
          <span className="text-sm text-muted-foreground tabular-nums">{time}</span>
        </div>
        <figcaption className="text-xs text-muted-foreground">
          An AI-generated clip from Generation Feed’s story, made with Kling 2.5 Pro.
        </figcaption>
      </figure>
    </Playground>
  );
}
