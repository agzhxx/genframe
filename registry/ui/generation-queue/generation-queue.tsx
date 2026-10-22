"use client"

import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"

import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/registry/hooks/use-reduced-motion"
import {
  queuePosition,
  timeLeft,
  type GenerationJob,
  type GenerationRequest,
} from "@/registry/lib/generation-queue-reducer"
import { GenerationCard } from "@/registry/ui/generation-card/generation-card"
import { describeChanges } from "./announcements"
import { slideToNewPlaces, type Place } from "./slide"

export interface GenerationQueueProps<Request extends GenerationRequest = GenerationRequest> {
  /** The jobs, in the order to show them: useGenerationQueue's are newest first. */
  jobs: readonly GenerationJob<Request>[]
  /**
   * How many jobs run at once, for the time a queued job will take: the same as the queue's.
   *
   * @defaultValue 2
   */
  concurrency?: number
  /** Called when the user cancels a queued or running job. */
  onCancel?: (job: GenerationJob<Request>) => void
  /** Called when the user retries a failed or canceled job. */
  onRetry?: (job: GenerationJob<Request>) => void
  /** Called when the user removes a finished job. Focus moves to the next card. */
  onRemove?: (job: GenerationJob<Request>) => void
  /** Called when the user opens a succeeded job's result. */
  onOpen?: (job: GenerationJob<Request>) => void
  /**
   * The list's accessible name.
   *
   * @defaultValue "Generations"
   */
  "aria-label"?: string
  /** The id of an element that names the list, instead of `aria-label`. */
  "aria-labelledby"?: string
  className?: string
}

// One clock for every queue on the page, which ticks once a second while any of them has a job
// queued or running, for the time left. The server has none: the times appear after hydration,
// so the server's HTML and the first render agree.
const clock = {
  now: 0,
  timer: undefined as ReturnType<typeof setInterval> | undefined,
  listeners: new Set<() => void>(),
}

function subscribeToClock(listener: () => void) {
  clock.listeners.add(listener)
  if (clock.listeners.size === 1) {
    clock.timer = setInterval(() => {
      clock.now = Date.now()
      for (const each of clock.listeners) each()
    }, 1000)
  }
  return () => {
    clock.listeners.delete(listener)
    if (clock.listeners.size > 0) return
    clearInterval(clock.timer)
    // Read afresh by the next queue that needs it.
    clock.now = 0
  }
}

function readClock() {
  if (clock.now === 0) clock.now = Date.now()
  return clock.now
}

function subscribeToNothing() {
  return () => {}
}

function noClock() {
  return null
}

/**
 * The generation queue's cards, in a list. Screen readers hear each job's changes of state through
 * a polite live region ("Image 3 is ready"), never its progress. Cards slide into their new places
 * when the order changes, and focus moves to the next card when the one that had it goes.
 */
export function GenerationQueue<Request extends GenerationRequest>({
  jobs,
  concurrency = 2,
  onCancel,
  onRetry,
  onRemove,
  onOpen,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  className,
}: GenerationQueueProps<Request>) {
  const reduced = useReducedMotion()
  const active = jobs.some((job) => job.status === "queued" || job.status === "running")
  const now = useSyncExternalStore(
    active ? subscribeToClock : subscribeToNothing,
    active ? readClock : noClock,
    noClock
  )
  const list = useRef<HTMLUListElement>(null)
  const items = useRef(new Map<string, HTMLLIElement>())
  // Where each card was laid out, and in which order, after the last render.
  const places = useRef(new Map<string, Place>())
  const order = useRef<readonly string[]>([])
  // The element that last had focus in a card, and that card's job.
  const focused = useRef<{ id: string; element: Element } | null>(null)
  // The cards there from the start don't fade in; the ones that join later do.
  const [initial] = useState(() => new Set(jobs.map((job) => job.id)))
  // What screen readers last heard about, and what they hear next.
  const [heard, setHeard] = useState(jobs)
  const [announcement, setAnnouncement] = useState({ text: "", count: 0 })
  if (heard !== jobs) {
    setHeard(jobs)
    const text = describeChanges(heard, jobs)
    if (text) setAnnouncement((previous) => ({ text, count: previous.count + 1 }))
  }

  useLayoutEffect(() => {
    const ids = jobs.map((job) => job.id)
    const before = order.current
    order.current = ids
    const moved = ids.length !== before.length || ids.some((id, index) => before[index] !== id)
    places.current = slideToNewPlaces(items.current, places.current, moved && !reduced, list.current)

    // The card that had focus is gone, and focus went with it: on to the next card, or the one
    // before, or the list. (A card that's still there keeps focus itself.)
    const lost = focused.current
    if (!lost || lost.element.isConnected) return
    focused.current = null
    const current = document.activeElement
    if (ids.includes(lost.id) || (current !== null && current !== document.body)) return
    const index = before.indexOf(lost.id)
    const next =
      before.slice(index + 1).find((id) => ids.includes(id)) ??
      before
        .slice(0, index)
        .reverse()
        .find((id) => ids.includes(id))
    const card = next && items.current.get(next)?.querySelector<HTMLElement>('[data-slot="generation-card"]')
    ;(card || list.current)?.focus()
  })

  return (
    <div
      data-slot="generation-queue"
      data-motion={reduced ? "reduce" : undefined}
      className={cn("min-w-0", className)}
    >
      <ul
        ref={list}
        tabIndex={-1}
        aria-label={ariaLabelledby ? undefined : (ariaLabel ?? "Generations")}
        aria-labelledby={ariaLabelledby}
        data-slot="generation-queue-list"
        className={cn(
          "relative grid grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] items-start gap-4",
          "rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        )}
      >
        {jobs.map((job) => (
          <li
            key={job.id}
            ref={(element) => {
              if (!element) return
              items.current.set(job.id, element)
              return () => {
                items.current.delete(job.id)
              }
            }}
            data-slot="generation-queue-item"
            className={cn(
              // A card slides to its new place, and one that joins rises into it; with reduced
              // motion, cards jump there, and a new one only fades in.
              "min-w-0 transition-[transform,translate,opacity] duration-(--genframe-duration-base) ease-(--genframe-ease-out) in-data-[motion=reduce]:transition-opacity",
              !initial.has(job.id) && "starting:translate-y-2 starting:opacity-0"
            )}
            onFocus={(event) => {
              focused.current = { id: job.id, element: event.target }
            }}
          >
            <GenerationCard
              job={job}
              position={queuePosition(jobs, job.id)}
              timeLeft={now === null ? null : timeLeft(jobs, job.id, { now, concurrency })}
              onCancel={onCancel}
              onRetry={onRetry}
              onRemove={onRemove}
              onOpen={onOpen}
            />
          </li>
        ))}
      </ul>
      <div role="status" data-slot="generation-queue-status" className="sr-only">
        {/* A new element each time, so the same words twice are still read twice. */}
        {announcement.text ? <span key={announcement.count}>{announcement.text}</span> : null}
      </div>
    </div>
  )
}
