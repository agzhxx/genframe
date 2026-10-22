"use client"

import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/registry/hooks/use-reduced-motion"
import { frameAt, useScrubber, type ScrubberOptions } from "@/registry/hooks/use-scrubber"
import { formatTime, formatTimecode } from "@/registry/lib/timecode"
import { spriteThumbnail, type SpriteSheet, type Thumbnail } from "./sprite-sheet"

export type { SpriteSheet, Thumbnail }

export interface VideoScrubberProps extends ScrubberOptions {
  /**
   * Thumbnails for the hover preview, from one image of tiles:
   * `{ url, columns, rows, interval, width, height }`.
   */
  sprite?: SpriteSheet
  /** Thumbnails from your own code, for any time; used when there's no `sprite`. */
  getThumbnail?: (time: number) => Thumbnail | undefined
  /**
   * How wide the preview shows a thumbnail, in CSS pixels; its height follows the thumbnail's
   * shape. Make tiles twice as wide for sharp previews on high-density screens.
   *
   * @defaultValue 160
   */
  thumbnailWidth?: number
  /**
   * The slider's accessible name.
   *
   * @defaultValue "Seek"
   */
  "aria-label"?: string
  /** The id of an element that names the slider, instead of `aria-label`. */
  "aria-labelledby"?: string
  className?: string
}

/** A share of the bar as a CSS percentage, to a thousandth of a percent: 0.7 × 100 is 70.00000000000001. */
function percent(fraction: number) {
  return `${String(Math.round(fraction * 100_000) / 1000)}%`
}

/**
 * A scrub bar for any video: the time played, what's buffered, and a preview of the time under
 * the pointer, a thumbnail and its timecode. Drag it, click or tap where to go, or use the keys;
 * with `fps`, "," and "." step a frame. Give it the player's `duration` and `currentTime`, and
 * seek in `onSeek` (`useMediaElement` does all three for a <video>).
 */
export function VideoScrubber({
  sprite,
  getThumbnail,
  thumbnailWidth = 160,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  className,
  ...options
}: VideoScrubberProps) {
  const reduced = useReducedMotion()
  const { progress, buffered, hover, scrubbing, sliderProps } = useScrubber(options)
  const { duration, fps } = options

  // The preview stays in the page while it's hidden, so a sprite has loaded by the first hover.
  const previewTime = hover?.time ?? 0
  const thumbnail = sprite ? spriteThumbnail(sprite, previewTime) : hover ? getThumbnail?.(previewTime) : undefined
  const scale = thumbnail ? thumbnailWidth / thumbnail.width : 1
  const label =
    fps === undefined
      ? formatTime(previewTime, { hours: duration >= 3600 })
      : formatTimecode(frameAt(previewTime, duration, fps), fps)
  // The preview's width: the thumbnail's, or the label's, wide enough for any time in the video.
  const longest = fps === undefined ? formatTime(duration, { hours: duration >= 3600 }) : formatTimecode(0, fps)
  const previewWidth = thumbnail ? `${String(thumbnailWidth)}px` : `${String(longest.length)}ch + 1rem`

  return (
    <div
      {...sliderProps}
      aria-label={ariaLabelledby ? undefined : (ariaLabel ?? "Seek")}
      aria-labelledby={ariaLabelledby}
      data-slot="video-scrubber"
      data-scrubbing={scrubbing ? "" : undefined}
      data-motion={reduced ? "reduce" : undefined}
      className={cn(
        "group/scrubber relative flex h-6 cursor-pointer touch-pan-y items-center rounded-sm outline-none select-none",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-disabled:cursor-default aria-disabled:opacity-50",
        className
      )}
    >
      <div data-slot="video-scrubber-track" className="relative h-1 w-full overflow-hidden rounded-full bg-foreground/20">
        {buffered.map((range) => (
          <div
            key={range.start}
            data-slot="video-scrubber-buffered"
            className="absolute inset-0 origin-left bg-foreground/30"
            style={{ transform: `translateX(${percent(range.start)}) scaleX(${String(range.end - range.start)})` }}
          />
        ))}
        <div
          data-slot="video-scrubber-progress"
          className="absolute inset-0 origin-left bg-primary"
          style={{ transform: `scaleX(${String(progress)})` }}
        />
      </div>
      {/* A layer the bar's width, moved by a share of its own width, carries the thumb along. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ transform: `translateX(${percent(progress)})` }}
      >
        <div
          data-slot="video-scrubber-thumb"
          className={cn(
            "absolute top-1/2 left-0 size-3 -translate-1/2 scale-0 rounded-full bg-primary shadow-sm",
            "transition-transform duration-(--genframe-duration-fast) ease-(--genframe-ease-out) in-data-[motion=reduce]:transition-none",
            "group-hover/scrubber:scale-100 group-focus-visible/scrubber:scale-100 group-data-scrubbing/scrubber:scale-100"
          )}
        />
      </div>
      <div
        aria-hidden="true"
        hidden={hover === null}
        data-slot="video-scrubber-preview"
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-full text-xs",
          "transition-opacity duration-(--genframe-duration-fast) ease-(--genframe-ease-out) starting:opacity-0 in-data-[motion=reduce]:transition-none"
        )}
        // Over the pointer, but never past either end of the bar.
        style={{
          transform: `translateX(clamp(calc((${previewWidth}) / 2), ${percent(hover?.fraction ?? 0)}, calc(100% - (${previewWidth}) / 2)))`,
        }}
      >
        <div
          className="absolute bottom-1.5 left-0 flex -translate-x-1/2 flex-col items-center gap-1"
          style={{ width: `calc(${previewWidth})` }}
        >
          {thumbnail ? (
            <span
              data-slot="video-scrubber-thumbnail"
              className="relative block w-full overflow-hidden rounded-md bg-muted shadow-md ring-2 ring-foreground"
              style={{ height: thumbnail.height * scale }}
            >
              <img
                src={thumbnail.url}
                alt=""
                decoding="async"
                fetchPriority="low"
                draggable={false}
                className="absolute top-0 left-0 max-w-none origin-top-left"
                style={{
                  transform: `scale(${String(scale)}) translate(${String(-thumbnail.x)}px, ${String(-thumbnail.y)}px)`,
                }}
              />
            </span>
          ) : null}
          <span
            data-slot="video-scrubber-time"
            className="rounded-sm bg-popover px-1.5 py-0.5 text-popover-foreground tabular-nums shadow-md"
          >
            {label}
          </span>
        </div>
      </div>
    </div>
  )
}
