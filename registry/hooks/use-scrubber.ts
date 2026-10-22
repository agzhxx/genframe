"use client"

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react"

import { frameCount, framesToSeconds, secondsToFrames, snapToFrame, spokenTime } from "@/registry/lib/timecode"

/** A stretch of a video, in seconds: one it has buffered, say. */
export interface TimeRange {
  start: number
  end: number
}

export interface ScrubberOptions {
  /**
   * The video's length in seconds. While it isn't known (NaN, 0, or Infinity for a live stream),
   * the slider is disabled.
   */
  duration: number
  /** The player's time in seconds. */
  currentTime: number
  /** Called with the time to go to, in seconds: for a key, a click, and every move of a drag. */
  onSeek: (time: number) => void
  /**
   * The video's frame rate. With it, "," and "." step a frame, seeks land in the middle of a
   * frame, and the time is read out with its frames.
   */
  fps?: number
  /** What the player has downloaded, in seconds: `video.buffered` as an array. */
  buffered?: readonly TimeRange[]
  /** Called when a drag starts: pause the player, if you like, and resume it in `onScrubEnd`. */
  onScrubStart?: () => void
  /** Called when a drag ends. */
  onScrubEnd?: () => void
}

/** A time under the pointer, and where it is along the bar, from 0 (the start) to 1 (the end). */
export interface ScrubberPoint {
  time: number
  fraction: number
}

/** Spread on the element that is the slider: its role, its ARIA values, its keys and pointers. */
export interface ScrubberSliderProps {
  role: "slider"
  tabIndex: number
  "aria-valuemin": number
  "aria-valuemax": number
  "aria-valuenow": number
  "aria-valuetext": string
  "aria-orientation": "horizontal"
  "aria-disabled": true | undefined
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  onPointerDown: (event: PointerEvent<HTMLElement>) => void
  onPointerMove: (event: PointerEvent<HTMLElement>) => void
  onPointerUp: (event: PointerEvent<HTMLElement>) => void
  onPointerCancel: (event: PointerEvent<HTMLElement>) => void
  onPointerLeave: () => void
  onLostPointerCapture: () => void
}

export interface Scrubber {
  /**
   * The time to show: where a drag is, or a seek the scrubber asked for until the player reports a
   * new time, or else the player's time. Within 0 and the duration.
   */
  time: number
  /** `time` as a fraction of the duration, from 0 to 1. */
  progress: number
  /** The buffered ranges as fractions of the duration, from 0 to 1, in order and merged. */
  buffered: TimeRange[]
  /** The time under a hovering mouse or pen, or a drag's: what a preview shows. Null otherwise. */
  hover: ScrubberPoint | null
  /** True while a pointer drags. */
  scrubbing: boolean
  sliderProps: ScrubberSliderProps
}

/** How far ←/→ move, in seconds. */
const STEP = 5
/** How far a touch or pen may move before it's a drag, not a tap, in pixels. */
const TAP_SLOP = 6

/**
 * Where a seek to `time` should go: within the video, and with `fps` to the middle of the frame
 * showing there, which shows that frame whatever the browser's rounding. 0 and the end stay as
 * they are.
 */
export function seekTime(time: number, duration: number, fps?: number): number {
  if (!(time > 0)) return 0
  if (time >= duration) return duration
  return fps === undefined ? time : Math.min(snapToFrame(time, fps), duration)
}

/** The frame showing at `time` in a video `duration` long: never past its last frame. */
export function frameAt(time: number, duration: number, fps: number): number {
  return Math.max(0, Math.min(secondsToFrames(time, fps), frameCount(duration, fps) - 1))
}

/**
 * Where a key takes the scrubber from `time`: ←/→ (↓/↑ too) 5 seconds back or on, Home and End
 * the start and the end, and with `fps` "," and "." a frame back or on. Null for any other key.
 */
export function timeForKey(key: string, time: number, duration: number, fps?: number): number | null {
  switch (key) {
    case "ArrowRight":
    case "ArrowUp":
      return seekTime(time + STEP, duration, fps)
    case "ArrowLeft":
    case "ArrowDown":
      return seekTime(time - STEP, duration, fps)
    case "Home":
      return 0
    case "End":
      return duration
    case ".":
    case ",": {
      if (fps === undefined) return null
      const current = frameAt(time, duration, fps)
      const frame = Math.max(0, Math.min(current + (key === "." ? 1 : -1), frameCount(duration, fps) - 1))
      // At the first or the last frame, the time stays where it is.
      return frame === current ? time : seekTime(framesToSeconds(frame, fps), duration, fps)
    }
    default:
      return null
  }
}

/** The time under a pointer at `clientX` over a bar with this box, and where along the bar it is. */
export function pointerTime(
  clientX: number,
  box: { left: number; width: number },
  duration: number,
  fps?: number
): ScrubberPoint {
  const fraction = box.width > 0 ? Math.min(1, Math.max(0, (clientX - box.left) / box.width)) : 0
  return { time: seekTime(fraction * duration, duration, fps), fraction }
}

/** Buffered ranges as fractions of the duration, from 0 to 1, in order, overlapping ones merged. */
export function bufferedFractions(ranges: readonly TimeRange[], duration: number): TimeRange[] {
  if (!(duration > 0 && Number.isFinite(duration))) return []
  const fractions = ranges
    .map((range) => ({ start: Math.max(0, range.start / duration), end: Math.min(1, range.end / duration) }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start)
  const merged: TimeRange[] = []
  for (const range of fractions) {
    const last = merged.at(-1)
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end)
    else merged.push(range)
  }
  return merged
}

/** Seconds as ARIA values: to the millisecond. */
function ariaSeconds(time: number) {
  return Math.round(time * 1000) / 1000
}

interface Gesture {
  pointerId: number
  /** "tap": a touch or pen that may still become a drag, or a scroll; "drag": seeking as it moves. */
  mode: "tap" | "drag"
  startX: number
  startY: number
  /** Where the drag is, ahead of React's render. */
  time: number
}

/**
 * A scrub bar's logic, without its looks: the WAI-ARIA slider pattern with the time in words,
 * pointers that seek (a mouse at once, a touch once it's a tap or a drag), keys, and buffered
 * ranges. It works with any player: give it the player's `duration` and `currentTime`, and seek
 * in `onSeek`. While a drag is under way it shows the drag, not the player's time, and after a
 * seek it shows where it asked to go until the player reports a new time, so the bar never jumps
 * back. `useMediaElement` gives it all of that from a <video>.
 */
export function useScrubber({
  duration,
  currentTime,
  onSeek,
  fps,
  buffered = [],
  onScrubStart,
  onScrubEnd,
}: ScrubberOptions): Scrubber {
  const known = Number.isFinite(duration) && duration > 0
  const length = known ? duration : 0
  const [dragTime, setDragTime] = useState<number | null>(null)
  const [hover, setHover] = useState<ScrubberPoint | null>(null)
  // The last seek asked for, and the player's time when it was: shown until the player reports
  // another time.
  const [asked, setAsked] = useState<{ time: number; from: number } | null>(null)
  if (asked !== null && asked.from !== currentTime) setAsked(null)
  const pending = asked !== null && asked.from === currentTime ? asked.time : null
  const gesture = useRef<Gesture | null>(null)

  const shown = dragTime ?? pending ?? currentTime
  const time = shown > 0 ? Math.min(shown, length) : 0
  // With a frame rate, the time read out is the frame showing.
  const spoken = fps === undefined ? time : framesToSeconds(frameAt(time, length, fps), fps)

  // A player left paused by a drag that never ended (the bar went away mid-drag) resumes.
  const endUnfinishedDrag = useEffectEvent(() => {
    if (gesture.current?.mode === "drag") onScrubEnd?.()
  })
  useEffect(
    () => () => {
      endUnfinishedDrag()
    },
    []
  )

  function seek(next: number) {
    setAsked({ time: next, from: currentTime })
    onSeek(next)
  }

  function pointAt(event: PointerEvent<HTMLElement>) {
    return pointerTime(event.clientX, event.currentTarget.getBoundingClientRect(), length, fps)
  }

  function dragTo(point: ScrubberPoint, current: Gesture) {
    current.time = point.time
    setDragTime(point.time)
    setHover(point)
    onSeek(point.time)
  }

  /** The gesture is over: a drag leaves its last time asked for. */
  function finish(nextHover: ScrubberPoint | null) {
    const current = gesture.current
    gesture.current = null
    if (current?.mode === "drag") {
      setAsked({ time: current.time, from: currentTime })
      setDragTime(null)
      onScrubEnd?.()
    }
    setHover(nextHover)
  }

  return {
    time,
    progress: known ? time / length : 0,
    buffered: bufferedFractions(buffered, length),
    hover,
    scrubbing: dragTime !== null,
    sliderProps: {
      role: "slider",
      tabIndex: 0,
      "aria-valuemin": 0,
      "aria-valuemax": ariaSeconds(length),
      "aria-valuenow": ariaSeconds(time),
      "aria-valuetext": known ? `${spokenTime(spoken, fps)} of ${spokenTime(length)}` : spokenTime(0),
      "aria-orientation": "horizontal",
      "aria-disabled": known ? undefined : true,
      onKeyDown: (event) => {
        // Leave the browser's and the system's shortcuts alone.
        if (!known || event.altKey || event.ctrlKey || event.metaKey) return
        const next = timeForKey(event.key, time, length, fps)
        if (next === null) return
        event.preventDefault()
        if (next !== time) seek(next)
      },
      onPointerDown: (event) => {
        if (!known || event.button !== 0 || gesture.current) return
        event.currentTarget.setPointerCapture(event.pointerId)
        // No text selection, and the keys work from here on.
        event.preventDefault()
        event.currentTarget.focus({ preventScroll: true })
        const point = pointAt(event)
        const current: Gesture = {
          pointerId: event.pointerId,
          // A mouse seeks at once. A touch may be the start of a page scroll: wait and see.
          mode: event.pointerType === "mouse" ? "drag" : "tap",
          startX: event.clientX,
          startY: event.clientY,
          time: point.time,
        }
        gesture.current = current
        if (current.mode === "drag") {
          onScrubStart?.()
          dragTo(point, current)
        }
      },
      onPointerMove: (event) => {
        if (!known) return
        const current = gesture.current
        if (current?.pointerId === event.pointerId) {
          if (current.mode === "tap") {
            if (Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < TAP_SLOP) return
            current.mode = "drag"
            onScrubStart?.()
          }
          dragTo(pointAt(event), current)
        } else if (event.pointerType !== "touch") {
          setHover(pointAt(event))
        }
      },
      onPointerUp: (event) => {
        const current = gesture.current
        if (current?.pointerId !== event.pointerId) return
        const point = pointAt(event)
        if (current.mode === "tap") seek(point.time)
        // A mouse is still over the bar; a finger has gone.
        finish(event.pointerType === "touch" ? null : point)
      },
      onPointerCancel: (event) => {
        if (gesture.current?.pointerId === event.pointerId) finish(null)
      },
      onPointerLeave: () => {
        if (gesture.current === null) setHover(null)
      },
      onLostPointerCapture: () => {
        // After a pointerup the gesture is over already; otherwise the bar lost its pointer.
        if (gesture.current !== null) finish(null)
      },
    },
  }
}

/** What useMediaElement reads from a media element, and how it seeks: spread it into useScrubber. */
export interface MediaElementState {
  duration: number
  currentTime: number
  buffered: TimeRange[]
  onSeek: (time: number) => void
  onScrubStart: () => void
  onScrubEnd: () => void
}

interface MediaTimes {
  duration: number
  currentTime: number
  buffered: TimeRange[]
}

/** A live TimeRanges (`video.buffered`) as a plain array. */
function rangesOf(ranges: TimeRanges): TimeRange[] {
  return Array.from({ length: ranges.length }, (_, index) => ({ start: ranges.start(index), end: ranges.end(index) }))
}

function sameTimes(a: MediaTimes, b: MediaTimes) {
  return (
    Object.is(a.duration, b.duration) &&
    Object.is(a.currentTime, b.currentTime) &&
    a.buffered.length === b.buffered.length &&
    a.buffered.every((range, index) => {
      const other = b.buffered[index]
      return other !== undefined && range.start === other.start && range.end === other.end
    })
  )
}

/** Starts playback: a promise in today's browsers, nothing in older ones and in jsdom (an app's tests). */
function startPlaying(media: HTMLMediaElement): Promise<void> | undefined {
  return media.play()
}

/**
 * Wires a <video> (or <audio>) to a scrubber: its duration, its time, frame by frame while it
 * plays, what it has buffered, and seeks that wait for the one before to land, so a drag shows
 * frames as it goes instead of starting a seek on every move. A drag pauses it, and it plays on
 * after if it was playing. Keep the element the same; change its `src` as you like.
 *
 *   const media = useMediaElement(videoRef)
 *   <VideoScrubber {...media} fps={24} />
 */
export function useMediaElement(ref: RefObject<HTMLMediaElement | null>): MediaElementState {
  const [times, setTimes] = useState<MediaTimes>({ duration: Number.NaN, currentTime: 0, buffered: [] })
  // A seek asked for while another was under way: it goes once that one lands.
  const queued = useRef<number | null>(null)
  // Whether the player was playing when a drag paused it.
  const resume = useRef(false)

  useEffect(() => {
    const media = ref.current
    if (media === null) return
    // While it plays: every frame it shows (requestVideoFrameCallback), or every animation frame.
    const video =
      media instanceof HTMLVideoElement &&
      typeof (media as Partial<HTMLVideoElement>).requestVideoFrameCallback === "function"
        ? media
        : null
    let handle: number | undefined

    const report = (time: number) => {
      const next = {
        duration: media.duration,
        currentTime: queued.current ?? time,
        buffered: rangesOf(media.buffered),
      }
      setTimes((previous) => (sameTimes(previous, next) ? previous : next))
    }
    const read = () => {
      report(media.currentTime)
    }
    const onFrame = (_now: number, metadata: VideoFrameCallbackMetadata) => {
      // The time of the frame on screen: currentTime can run ahead of it.
      report(metadata.mediaTime)
      handle = video?.requestVideoFrameCallback(onFrame)
    }
    const onAnimationFrame = () => {
      read()
      handle = requestAnimationFrame(onAnimationFrame)
    }
    const cancel = () => {
      if (handle === undefined) return
      if (video) video.cancelVideoFrameCallback(handle)
      else cancelAnimationFrame(handle)
      handle = undefined
    }
    const play = () => {
      if (handle !== undefined) return
      handle = video ? video.requestVideoFrameCallback(onFrame) : requestAnimationFrame(onAnimationFrame)
    }
    const stop = () => {
      cancel()
      read()
    }
    const timeUpdate = () => {
      // While frames are reported, the frame on screen is the time; currentTime would disagree.
      if (handle === undefined) read()
    }
    const seeked = () => {
      const next = queued.current
      queued.current = null
      if (next !== null && next !== media.currentTime) media.currentTime = next
      read()
    }
    const emptied = () => {
      queued.current = null
      stop()
    }

    const listeners = {
      loadedmetadata: read,
      durationchange: read,
      progress: read,
      seeking: read,
      seeked,
      timeupdate: timeUpdate,
      play,
      pause: stop,
      ended: stop,
      emptied,
    }
    for (const [type, listener] of Object.entries(listeners)) media.addEventListener(type, listener)
    if (media.paused) read()
    else play()
    return () => {
      for (const [type, listener] of Object.entries(listeners)) media.removeEventListener(type, listener)
      cancel()
    }
  }, [ref])

  return {
    ...times,
    onSeek: (time) => {
      const media = ref.current
      if (media === null) return
      if (media.seeking) queued.current = time
      else media.currentTime = time
      // Reported at once, so a scrubber shows it before the seek lands.
      setTimes((previous) => ({ ...previous, currentTime: time }))
    },
    onScrubStart: () => {
      const media = ref.current
      if (media === null) return
      resume.current = !media.paused
      media.pause()
    },
    onScrubEnd: () => {
      const media = ref.current
      if (media !== null && resume.current) startPlaying(media)?.catch(() => undefined)
      resume.current = false
    },
  }
}
