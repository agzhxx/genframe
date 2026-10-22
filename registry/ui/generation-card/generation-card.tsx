"use client"

import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/registry/hooks/use-reduced-motion"
import { useThumbHash } from "@/registry/hooks/use-thumbhash"
import type {
  GenerationJob,
  GenerationKind,
  GenerationRequest,
} from "@/registry/lib/generation-queue-reducer"
import { DenoiseReveal } from "@/registry/ui/denoise-reveal/denoise-reveal"

export interface GenerationCardProps<Request extends GenerationRequest = GenerationRequest> {
  /** The job to show. Render one card per job, keyed by its id. */
  job: GenerationJob<Request>
  /** Its place in the line while it's queued: 1 is next. GenerationQueue works it out. */
  position?: number | null
  /**
   * How long until it's done, in milliseconds, while it's queued or running; null when there's
   * nothing to go by. GenerationQueue works it out.
   */
  timeLeft?: number | null
  /** Called when the user cancels the queued or running job. Without it, there's no Cancel. */
  onCancel?: (job: GenerationJob<Request>) => void
  /** Called when the user retries the failed or canceled job. Without it, there's no Retry. */
  onRetry?: (job: GenerationJob<Request>) => void
  /** Called when the user removes the finished job. Without it, there's no Remove. */
  onRemove?: (job: GenerationJob<Request>) => void
  /** Called when the user opens the succeeded job's result. Without it, there's no Open. */
  onOpen?: (job: GenerationJob<Request>) => void
  className?: string
}

const kindNames: Record<GenerationKind, string> = { image: "Image", video: "Video" }

/** The job's name, as the card, its buttons and the queue's announcements say it: "Image 3". */
export function jobName(job: Pick<GenerationJob, "kind" | "number">) {
  return `${kindNames[job.kind]} ${String(job.number)}`
}

// How tall the media may be, in rem: a portrait ratio narrows instead, so a 9:16 card doesn't
// tower over its neighbours.
const MEDIA_HEIGHT = 18

// The requested ratio's box, kept from the first state to the result, so nothing jumps.
function mediaStyle(ratio: string): CSSProperties {
  const [width = 1, height = 1] = ratio.split(":").map(Number)
  const valid = width > 0 && height > 0
  const [w, h] = valid ? [width, height] : [1, 1]
  return {
    aspectRatio: `${String(w)} / ${String(h)}`,
    maxWidth: `${String(Math.round((MEDIA_HEIGHT * w * 1000) / h) / 1000)}rem`,
  }
}

const suffixes: Record<string, string> = { one: "st", two: "nd", few: "rd", other: "th" }
const ordinals = new Intl.PluralRules("en-US", { type: "ordinal" })

function placeInLine(position: number) {
  if (position === 1) return "Next in line"
  return `${String(position)}${suffixes[ordinals.select(position)] ?? "th"} in line`
}

// "about 25 s" and, for screen readers, "about 25 seconds": whole seconds below 10, steps of 5
// below a minute, then minutes, so the number doesn't flicker.
function duration(ms: number, long: boolean) {
  const seconds = ms / 1000
  const shown = seconds < 9.5 ? Math.max(1, Math.round(seconds)) : Math.round(seconds / 5) * 5
  if (shown < 60) return `about ${String(shown)} ${long ? (shown === 1 ? "second" : "seconds") : "s"}`
  const minutes = Math.round(seconds / 60)
  return `about ${String(minutes)} ${long ? (minutes === 1 ? "minute" : "minutes") : "min"}`
}

function left(ms: number, long: boolean) {
  return ms <= 0 ? "almost done" : `${duration(ms, long)} left`
}

/**
 * One generation job: queued with its place in line and the time it'll take, running with its
 * progress, succeeded with its result revealed out of grain, failed with the reason, or canceled.
 * The media keeps the requested aspect ratio from the start.
 */
export function GenerationCard<Request extends GenerationRequest>({
  job,
  position = null,
  timeLeft = null,
  onCancel,
  onRetry,
  onRemove,
  onOpen,
  className,
}: GenerationCardProps<Request>) {
  const reduced = useReducedMotion()
  const id = useId()
  const card = useRef<HTMLElement>(null)
  // The element in the card that last had focus.
  const focused = useRef<Element | null>(null)
  // A result that arrives while the card is on screen is revealed; one that was there already
  // just shows.
  const [fresh] = useState(job.status !== "succeeded")
  const placeholder = useThumbHash(job.result?.thumbhash)
  const name = jobName(job)
  const lowerName = name.toLowerCase()
  const { status, progress, result } = job
  const active = status === "queued" || status === "running"

  // When the focused button goes with the state it belonged to (Cancel, once the job finishes),
  // focus stays on the card instead of dropping to the page.
  useLayoutEffect(() => {
    const lost = focused.current
    if (!lost || lost.isConnected) return
    focused.current = null
    const current = document.activeElement
    if (current === null || current === document.body) card.current?.focus({ preventScroll: true })
  })

  let statusText = "Ready"
  let valueText = ""
  if (status === "queued") {
    const when = timeLeft === null ? null : `done in ${duration(timeLeft, false)}`
    const place = position === null ? "Queued" : placeInLine(position)
    statusText = when ? `${place} · ${when}` : place
  } else if (status === "running") {
    const done = progress === null ? "Generating" : `${String(Math.round(progress * 100))}%`
    statusText = timeLeft === null ? done : `${done} · ${left(timeLeft, false)}`
    valueText = timeLeft === null ? done : `${done}, ${left(timeLeft, true)}`
  } else if (status === "failed") {
    statusText = `Failed: ${job.error ?? "something went wrong"}`
  } else if (status === "canceled") {
    statusText = job.refunded ? "Canceled · refunded" : "Canceled"
  }

  // The buttons for the job's state, named after it: "Cancel image 3".
  const actions = [
    { label: "Cancel", on: active ? onCancel : undefined },
    { label: "Open", on: status === "succeeded" ? onOpen : undefined },
    { label: "Retry", on: status === "failed" || status === "canceled" ? onRetry : undefined },
    { label: "Remove", on: active ? undefined : onRemove },
  ].flatMap(({ label, on }) => (on ? [{ label, on }] : []))

  return (
    <article
      ref={card}
      tabIndex={-1}
      aria-labelledby={`${id}-name`}
      aria-describedby={`${id}-status`}
      data-slot="generation-card"
      data-status={status}
      data-motion={reduced ? "reduce" : undefined}
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card text-card-foreground outline-none",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className
      )}
      onFocus={(event) => {
        focused.current = event.target
      }}
    >
      <div
        data-slot="generation-card-media"
        // A tint of the text color: a theme's muted color can be its card color.
        className="relative mx-auto w-full overflow-hidden bg-foreground/5"
        style={mediaStyle(job.ratio)}
      >
        {status === "succeeded" && result ? (
          <DenoiseReveal
            src={result.src}
            alt={result.alt ?? job.prompt}
            width={result.width}
            height={result.height}
            placeholder={placeholder}
            denoise={fresh}
            className="size-full"
          />
        ) : (
          <div
            aria-hidden="true"
            className="absolute inset-0 grid place-items-center text-muted-foreground/60"
          >
            {status === "running" && progress === null ? (
              // Working, for how long it can't tell: a slow pulse; still with reduced motion.
              <div
                data-slot="generation-card-shimmer"
                className="absolute inset-0 animate-pulse bg-foreground/5 in-data-[motion=reduce]:animate-none"
              />
            ) : null}
            <StatusIcon status={status} />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 p-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <KindIcon kind={job.kind} />
          <span id={`${id}-name`} className="truncate text-sm font-medium">
            {name}
          </span>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
            {job.ratio}
          </span>
        </div>
        <p className="line-clamp-2 text-xs text-muted-foreground" title={job.prompt}>
          {job.prompt}
        </p>

        {status === "running" ? (
          <div
            role="progressbar"
            aria-labelledby={`${id}-name`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress === null ? undefined : Math.round(progress * 100)}
            aria-valuetext={valueText}
            data-slot="generation-card-progress"
            className="relative h-1 overflow-hidden rounded-full bg-muted"
          >
            {progress === null ? (
              <div className="absolute inset-0 animate-pulse rounded-full bg-primary/40 in-data-[motion=reduce]:animate-none" />
            ) : (
              // Each report moves the bar there smoothly; with reduced motion, it jumps.
              <div
                className="absolute inset-0 rounded-full bg-primary transition-transform duration-(--genframe-duration-base) ease-(--genframe-ease-out) in-data-[motion=reduce]:transition-none"
                style={{ transform: `translateX(-${String(Math.round((1 - progress) * 1000) / 10)}%)` }}
              />
            )}
          </div>
        ) : null}

        <p
          id={`${id}-status`}
          // The progress bar says it to screen readers already.
          aria-hidden={status === "running" || undefined}
          data-slot="generation-card-status"
          className={cn(
            "text-xs text-muted-foreground tabular-nums",
            status === "failed" && "text-destructive"
          )}
        >
          {statusText}
        </p>

        {actions.length > 0 ? (
          <div data-slot="generation-card-actions" className="flex flex-wrap gap-2">
            {actions.map(({ label, on }) => (
              <Button
                key={label}
                type="button"
                variant={label === "Remove" ? "ghost" : "outline"}
                size="sm"
                aria-label={`${label} ${lowerName}`}
                onClick={() => {
                  on(job)
                }}
              >
                {label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  )
}

function KindIcon({ kind }: { kind: GenerationKind }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-4 shrink-0 text-muted-foreground"
    >
      {kind === "image" ? (
        <>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
        </>
      ) : (
        <>
          <rect x="2" y="6" width="14" height="12" rx="2" />
          <path d="m16 13 5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 11" />
        </>
      )}
    </svg>
  )
}

// A quiet mark in the empty media: an hourglass while queued, a warning when failed, a crossed-out
// circle when canceled. Running jobs show their progress below instead.
function StatusIcon({ status }: { status: GenerationJob["status"] }) {
  if (status === "running" || status === "succeeded") return null
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("relative size-8", status === "failed" && "text-destructive/70")}
    >
      {status === "queued" ? (
        <path d="M5 22h14M5 2h14M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22M7 2v4.17a2 2 0 0 0 .59 1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2" />
      ) : status === "failed" ? (
        <>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="10" />
          <path d="m4.9 4.9 14.2 14.2" />
        </>
      )}
    </svg>
  )
}
