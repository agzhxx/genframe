"use client"

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react"

import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/registry/hooks/use-reduced-motion"
import {
  afterClipPath,
  clampPosition,
  DEFAULT_POSITION,
  dividerTransform,
  positionAt,
  positionForKey,
  positionText,
  type CompareSliderOrientation,
} from "./slider-math"
import { syncVideos } from "./video-sync"

export type { CompareSliderOrientation }

export interface CompareSliderProps {
  /** What shows at 0: an image, a video or any node. */
  before: ReactNode
  /**
   * What shows at 100. It's drawn over `before` and shows from the left edge up to the divider
   * (from the bottom edge when vertical).
   */
  after: ReactNode
  /** How much of `after` shows, from 0 to 100, when you control the position. */
  position?: number
  /**
   * Where the divider starts when the slider keeps its own position.
   *
   * @defaultValue 50
   */
  defaultPosition?: number
  /** Called with the new position, from 0 to 100, as the user moves the divider. */
  onPositionChange?: (position: number) => void
  /**
   * Horizontal splits the layers left and right; vertical splits them top and bottom.
   *
   * @defaultValue "horizontal"
   */
  orientation?: CompareSliderOrientation
  /**
   * Names for the two layers, like "Draft" and "Final": shown in their corners, and read out
   * with the position ("60% Final").
   */
  labels?: { before: string; after: string }
  /**
   * The slider's accessible name.
   *
   * @defaultValue the labels ("Draft and Final"), or "Before and after"
   */
  "aria-label"?: string
  /** The id of an element that names the slider, instead of `aria-label`. */
  "aria-labelledby"?: string
  className?: string
}

// How far a touch or a pen may move on the track before it counts as a drag, not a tap, in pixels.
const TAP_SLOP = 6

interface Gesture {
  pointerId: number
  /** "tap": a touch on the track that may still become a drag; "drag": the divider follows. */
  mode: "tap" | "drag"
  /** Where the pointer took hold of the divider, relative to it, so the divider doesn't jump. */
  offset: number
  startX: number
  startY: number
}

// The divider springs to a new position; while dragging, and with reduced motion, it goes
// straight there.
const motion =
  "duration-(--genframe-duration-base) ease-(--genframe-ease-spring) in-data-dragging:transition-none in-data-[motion=reduce]:transition-none"

/**
 * A before/after slider: two layers, one over the other, and a divider that shows more of one or
 * the other. Drag it, click where it should go, or use the keys. Two videos stay in step.
 */
export function CompareSlider({
  before,
  after,
  position: controlledPosition,
  defaultPosition = DEFAULT_POSITION,
  onPositionChange,
  orientation = "horizontal",
  labels,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  className,
}: CompareSliderProps) {
  const reduced = useReducedMotion()
  const [ownPosition, setOwnPosition] = useState(defaultPosition)
  const [dragging, setDragging] = useState(false)
  const position = clampPosition(controlledPosition ?? ownPosition)
  // The last position sent, so a move to where the divider already is sends nothing. A ref, as
  // several pointer events can arrive before React renders again.
  const latest = useRef(position)
  const gesture = useRef<Gesture | null>(null)
  const beforeLayer = useRef<HTMLDivElement>(null)
  const afterLayer = useRef<HTMLDivElement>(null)
  const handle = useRef<HTMLDivElement>(null)
  const horizontal = orientation === "horizontal"

  useEffect(() => {
    latest.current = position
  })

  // With a video in each layer, keep them in step: `before` is the clock. Layers can change
  // what they hold at any time, so watch them.
  useEffect(() => {
    const beforeElement = beforeLayer.current
    const afterElement = afterLayer.current
    if (!beforeElement || !afterElement) return
    let pair: (HTMLVideoElement | null)[] = []
    let stop: (() => void) | undefined
    function findVideos() {
      if (!beforeElement || !afterElement) return
      const clock = beforeElement.querySelector("video")
      const follower = afterElement.querySelector("video")
      if (clock === pair[0] && follower === pair[1]) return
      stop?.()
      stop = clock && follower ? syncVideos(clock, follower) : undefined
      pair = [clock, follower]
    }
    findVideos()
    const observer = new MutationObserver(findVideos)
    observer.observe(beforeElement, { childList: true, subtree: true })
    observer.observe(afterElement, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      stop?.()
    }
  }, [])

  function moveTo(next: number) {
    const value = clampPosition(next)
    if (value === latest.current) return
    latest.current = value
    if (controlledPosition === undefined) setOwnPosition(value)
    onPositionChange?.(value)
  }

  function pointerPosition(event: PointerEvent<HTMLDivElement>) {
    return positionAt(event, event.currentTarget.getBoundingClientRect(), orientation)
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || gesture.current) return
    const onHandle = event.target instanceof Node && Boolean(handle.current?.contains(event.target))
    const at = pointerPosition(event)
    event.currentTarget.setPointerCapture(event.pointerId)
    // No text selection; the keys work from here on.
    event.preventDefault()
    handle.current?.focus({ preventScroll: true })
    const start = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY }
    if (onHandle) {
      gesture.current = { ...start, mode: "drag", offset: at - position }
    } else if (event.pointerType === "mouse") {
      // A click on the track: the divider springs there, and follows if the mouse moves on.
      moveTo(at)
      gesture.current = { ...start, mode: "drag", offset: 0 }
    } else {
      // A touch may be the start of a scroll, which the browser takes over: wait and see.
      gesture.current = { ...start, mode: "tap", offset: 0 }
    }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current
    if (current?.pointerId !== event.pointerId) return
    if (current.mode === "tap") {
      const moved = Math.hypot(event.clientX - current.startX, event.clientY - current.startY)
      if (moved < TAP_SLOP) return
      current.mode = "drag"
    }
    setDragging(true)
    moveTo(pointerPosition(event) - current.offset)
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (gesture.current?.pointerId !== event.pointerId) return
    if (gesture.current.mode === "tap") moveTo(pointerPosition(event))
    endGesture()
  }

  function endGesture() {
    gesture.current = null
    setDragging(false)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Leave the browser's and the system's shortcuts alone.
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const next = positionForKey(event.key, event.shiftKey, position)
    if (next === null) return
    event.preventDefault()
    moveTo(next)
  }

  return (
    <div
      data-slot="compare-slider"
      data-orientation={orientation}
      data-dragging={dragging ? "" : undefined}
      data-motion={reduced ? "reduce" : undefined}
      className={cn(
        "relative isolate grid overflow-hidden select-none",
        // Swipes across the slider move the divider; swipes the other way still scroll the page.
        horizontal ? "cursor-ew-resize touch-pan-y" : "cursor-ns-resize touch-pan-x",
        className
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={endGesture}
      onLostPointerCapture={endGesture}
      onDoubleClick={() => {
        moveTo(DEFAULT_POSITION)
      }}
      onDragStart={(event) => {
        event.preventDefault()
      }}
    >
      <div
        ref={beforeLayer}
        data-slot="compare-slider-before"
        className="relative col-start-1 row-start-1"
      >
        {before}
        {labels ? (
          <LayerLabel className={horizontal ? "top-2 right-2" : "top-2 left-2"}>
            {labels.before}
          </LayerLabel>
        ) : null}
      </div>
      <div
        ref={afterLayer}
        data-slot="compare-slider-after"
        className={cn("relative col-start-1 row-start-1 transition-[clip-path]", motion)}
        style={{ clipPath: afterClipPath(position, orientation) }}
      >
        {after}
        {labels ? (
          <LayerLabel className={horizontal ? "top-2 left-2" : "bottom-2 left-2"}>
            {labels.after}
          </LayerLabel>
        ) : null}
      </div>
      <div
        data-slot="compare-slider-divider"
        className={cn("pointer-events-none absolute inset-0 transition-transform", motion)}
        style={{ transform: dividerTransform(position, orientation) }}
      >
        <div
          className={cn(
            "absolute bg-foreground shadow-[0_0_0_1px] shadow-background/30",
            horizontal ? "inset-y-0 left-0 w-0.5 -translate-x-1/2" : "inset-x-0 top-0 h-0.5 -translate-y-1/2"
          )}
        />
        <div
          ref={handle}
          role="slider"
          tabIndex={0}
          aria-label={
            ariaLabelledby
              ? undefined
              : (ariaLabel ?? (labels ? `${labels.before} and ${labels.after}` : "Before and after"))
          }
          aria-labelledby={ariaLabelledby}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(position)}
          aria-valuetext={positionText(position, labels?.after)}
          aria-orientation={orientation}
          data-slot="compare-slider-handle"
          className={cn(
            "pointer-events-auto absolute grid size-10 touch-none place-items-center rounded-full border bg-background text-foreground shadow-md outline-none",
            "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
            horizontal ? "top-1/2 left-0" : "top-0 left-1/2",
            "-translate-x-1/2 -translate-y-1/2"
          )}
          onKeyDown={onKeyDown}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={cn("size-5", !horizontal && "rotate-90")}
          >
            <path d="m9 7-5 5 5 5M15 7l5 5-5 5" />
          </svg>
        </div>
      </div>
    </div>
  )
}

function LayerLabel({ className, children }: { className: string; children: ReactNode }) {
  // Screen readers get the labels from the slider's name and value instead.
  return (
    <span
      aria-hidden="true"
      data-slot="compare-slider-label"
      className={cn(
        "pointer-events-none absolute rounded-sm bg-background/80 px-1.5 py-0.5 text-xs font-medium text-foreground",
        className
      )}
    >
      {children}
    </span>
  )
}
