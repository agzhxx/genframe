"use client"

import { useEffect, useId, useRef, useState, type FocusEvent, type PointerEvent } from "react"

import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/registry/hooks/use-reduced-motion"
import { usePooledVideo, useVideoPool, VideoPoolProvider } from "@/registry/hooks/use-video-pool"

/** A camera move to pick, with a clip that shows it. */
export interface CameraMotionOption {
  /** The picker's value when it's picked, and what a form sends. */
  id: string
  /** Its name, like "Dolly in": the radio's accessible name. */
  label: string
  /**
   * What the move does, like "The camera moves toward the subject": shown under the name, and the
   * radio's description for screen readers.
   */
  description: string
  /** A short clip of the move, 16:9: muted and looped while its tile previews it. */
  previewSrc: string
  /** A still of the clip, best its first frame, so nothing jumps when the clip starts. */
  poster: string
}

export interface CameraMotionPickerProps {
  /** The moves to pick from, in order. */
  options: readonly CameraMotionOption[]
  /** The picked move's id, when you control it. */
  value?: string
  /** The move picked at first, when the picker keeps its own value. None unless you give one. */
  defaultValue?: string
  /** Called with the id of the move the user picks. */
  onValueChange?: (value: string) => void
  /** The name the picked move is sent under when the picker is inside a form. */
  name?: string
  /**
   * The group's accessible name.
   *
   * @defaultValue "Camera motion"
   */
  "aria-label"?: string
  /** The id of an element that names the group, instead of `aria-label`. */
  "aria-labelledby"?: string
  className?: string
}

/** How long the pointer rests on a tile, or keyboard focus stays, before its clip plays. */
const INTENT_MS = 100

/**
 * Pick a camera move from tiles that show it: each tile loops a short clip of its move while the
 * pointer rests on it, while it has keyboard focus, or after a tap, borrowing a video from the
 * page's pool (VideoPoolProvider; without one, the picker makes a pool of its own). With reduced
 * motion nothing plays by itself: each tile has a play button. A radio group of native radio
 * buttons.
 */
export function CameraMotionPicker({
  options,
  value: controlledValue,
  defaultValue,
  onValueChange,
  name,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  className,
}: CameraMotionPickerProps) {
  const reduced = useReducedMotion()
  const pool = useVideoPool()
  const id = useId()
  const [ownValue, setOwnValue] = useState(defaultValue)
  const value = controlledValue ?? ownValue
  // Touch screens have no hover: the tile tapped last plays, until another is tapped.
  const [tapped, setTapped] = useState<{ id: string; since: number } | null>(null)
  // One play button is in the tab order, the picked tile's (else the first's): Tab goes from the
  // group to it. The others take clicks, taps and screen readers.
  const tabStop = options.some((option) => option.id === value) ? value : options[0]?.id

  const group = (
    <div
      role="radiogroup"
      aria-label={ariaLabelledby ? undefined : (ariaLabel ?? "Camera motion")}
      aria-labelledby={ariaLabelledby}
      data-slot="camera-motion-picker"
      data-motion={reduced ? "reduce" : undefined}
      className={cn("grid grid-cols-2 gap-2 sm:grid-cols-4", className)}
    >
      {options.map((option) => (
        <Tile
          key={option.id}
          option={option}
          cardId={`${id}:${option.id}`}
          name={name ?? id}
          checked={option.id === value}
          tabStop={option.id === tabStop}
          reduced={reduced}
          tappedSince={tapped?.id === option.id ? tapped.since : null}
          onTap={(since) => {
            setTapped({ id: option.id, since })
          }}
          onPick={() => {
            if (controlledValue === undefined) setOwnValue(option.id)
            onValueChange?.(option.id)
          }}
        />
      ))}
    </div>
  )

  return pool ? group : <VideoPoolProvider>{group}</VideoPoolProvider>
}

interface TileProps {
  option: CameraMotionOption
  /** The tile's key in the video pool, unique on the page. */
  cardId: string
  name: string
  checked: boolean
  tabStop: boolean
  reduced: boolean
  tappedSince: number | null
  onTap: (since: number) => void
  onPick: () => void
}

function Tile({ option, cardId, name, checked, tabStop, reduced, tappedSince, onTap, onPick }: TileProps) {
  const id = useId()
  const [hoverSince, setHoverSince] = useState<number | null>(null)
  const [focusSince, setFocusSince] = useState<number | null>(null)
  const [manualSince, setManualSince] = useState<number | null>(null)
  // The browser refused to play, as in iOS Low Power Mode: a play button instead.
  const [blocked, setBlocked] = useState(false)
  const hoverTimer = useRef<number | undefined>(undefined)
  const focusTimer = useRef<number | undefined>(undefined)
  const slot = useRef<HTMLSpanElement>(null)

  useEffect(
    () => () => {
      window.clearTimeout(hoverTimer.current)
      window.clearTimeout(focusTimer.current)
    },
    []
  )

  // A press on the play button wins; otherwise the clip plays on its own, if it may.
  const showPlayButton = reduced || blocked
  const since = manualSince ?? (showPlayButton ? null : (hoverSince ?? focusSince ?? tappedSince))
  const showing = usePooledVideo(slot, cardId, option.previewSrc, since, {
    onBlocked: () => {
      setBlocked(true)
    },
  })

  // A request's time is when the pointer or focus arrived, so the time to the first frame includes the wait.
  function startIntent(timer: { current: number | undefined }, start: (since: number) => void) {
    const at = performance.now()
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      start(at)
    }, INTENT_MS)
  }

  return (
    <div
      data-slot="camera-motion-picker-option"
      className="relative"
      onPointerEnter={(event: PointerEvent<HTMLDivElement>) => {
        if (event.pointerType !== "touch") startIntent(hoverTimer, setHoverSince)
      }}
      onPointerLeave={() => {
        window.clearTimeout(hoverTimer.current)
        setHoverSince(null)
      }}
      onPointerUp={(event: PointerEvent<HTMLDivElement>) => {
        // A touch that ended here was a tap: a scroll would have been taken over by the browser.
        if (event.pointerType === "touch") onTap(performance.now())
      }}
    >
      <label
        className={cn(
          "group/option flex h-full cursor-pointer flex-col gap-1.5 rounded-md border border-transparent p-1.5 text-left",
          "hover:bg-accent has-checked:border-primary has-checked:bg-primary/10",
          "has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50"
        )}
      >
        <input
          type="radio"
          name={name}
          value={option.id}
          checked={checked}
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-description`}
          onChange={onPick}
          onFocus={(event: FocusEvent<HTMLInputElement>) => {
            // Keyboard focus plays the clip like a resting pointer; focus from a click doesn't.
            if (event.currentTarget.matches(":focus-visible")) startIntent(focusTimer, setFocusSince)
          }}
          onBlur={() => {
            window.clearTimeout(focusTimer.current)
            setFocusSince(null)
          }}
          className="absolute inset-0 cursor-pointer appearance-none rounded-md outline-none"
        />
        <span className="relative block aspect-video overflow-hidden rounded-sm bg-muted">
          <img
            src={option.poster}
            alt=""
            decoding="async"
            draggable={false}
            className="absolute inset-0 size-full object-cover"
          />
          <span
            ref={slot}
            aria-hidden="true"
            data-slot="camera-motion-picker-preview"
            className={cn(
              "absolute inset-0 transition-opacity duration-(--genframe-duration-fast) ease-(--genframe-ease-out) in-data-[motion=reduce]:transition-none [&>video]:size-full [&>video]:object-cover",
              !showing && "opacity-0"
            )}
          />
          {/* Picked shows in the frame's color and a check mark, not in color alone. */}
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 hidden size-5 items-center justify-center rounded-full bg-primary text-primary-foreground group-has-checked/option:flex"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 8.5 6.5 12 13 4.5" />
            </svg>
          </span>
        </span>
        <span id={`${id}-label`} className="text-sm leading-tight font-medium">
          {option.label}
        </span>
        <span id={`${id}-description`} className="text-xs leading-snug text-muted-foreground">
          {option.description}
        </span>
      </label>
      {showPlayButton ? (
        // Over the clip, beside the label: a button can't sit inside a label. The span lines up
        // with the clip's box, inside the label's border and padding.
        <span className="pointer-events-none absolute inset-x-[calc(--spacing(1.5)+1px)] top-[calc(--spacing(1.5)+1px)] aspect-video">
          <button
            type="button"
            tabIndex={tabStop ? 0 : -1}
            aria-label={`${manualSince === null ? "Play" : "Pause"} preview of ${option.label}`}
            aria-pressed={manualSince !== null}
            onClick={() => {
              setManualSince(manualSince === null ? performance.now() : null)
            }}
            className="pointer-events-auto absolute top-1/2 left-1/2 flex size-11 -translate-1/2 items-center justify-center rounded-full bg-background/70 text-foreground outline-ring focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
              {manualSince === null ? (
                <path d="M5.5 3.5 L12.5 8 L5.5 12.5 Z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
              ) : (
                <path d="M4.5 3.5 h2.5 v9 h-2.5 Z M9 3.5 h2.5 v9 H9 Z" />
              )}
            </svg>
          </button>
        </span>
      ) : null}
    </div>
  )
}
