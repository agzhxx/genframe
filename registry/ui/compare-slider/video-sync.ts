// Keeps two videos in step, for a compare slider with a video in each layer.
//
// One video is the clock and the other follows it. Play, pause and seek act on both, whichever
// video they started on. While they play, the follower keeps to the clock: within a frame it plays
// at the clock's speed; a little behind or ahead, it plays a bit faster or slower until it has
// caught up, which looks smooth; far off (after a stall), it jumps to the clock's time. Paused,
// the follower shows exactly the clock's frame.

/** The members of a media element that syncing uses (an HTMLVideoElement has them all). */
export type SyncedMedia = Pick<
  HTMLMediaElement,
  | "currentTime"
  | "duration"
  | "paused"
  | "playbackRate"
  | "seeking"
  | "loop"
  | "play"
  | "pause"
  | "addEventListener"
  | "removeEventListener"
>

/** A video's state at one moment, as followClock reads it. */
export interface Playback {
  time: number
  duration: number
  paused: boolean
  rate: number
  seeking: boolean
  loop: boolean
}

/** How long a frame is when the frame rate isn't known: 30 frames per second. */
export const FRAME = 1 / 30
/** Paused videos count as showing the same frame within this, in seconds. */
const SAME_TIME = 0.001
/** Further apart than this, in seconds, the follower jumps instead of catching up. */
const JUMP_AFTER = 0.25
/** How long the follower takes to catch up by speeding up or slowing down, in seconds. */
const CATCH_UP = 1

/**
 * How far the follower is ahead of the clock (behind when negative), in seconds. Videos that
 * both loop run in circles: 4.9 s and 0.1 s into a 5 s loop are 0.2 s apart, not 4.8 s.
 */
export function driftOf(clock: Playback, follower: Playback) {
  const drift = follower.time - clock.time
  const length = clock.duration
  if (!clock.loop || !follower.loop || !Number.isFinite(length) || length <= 0) return drift
  return ((((drift + length / 2) % length) + length) % length) - length / 2
}

/**
 * What the follower should change to keep to the clock: jump to a time, play at a rate, or
 * nothing (an empty object). It waits while either video is seeking.
 */
export function followClock(
  clock: Playback,
  follower: Playback,
  frame = FRAME
): { seekTo?: number; rate?: number } {
  if (clock.seeking || follower.seeking) return {}
  const drift = driftOf(clock, follower)
  if (clock.paused) {
    return Math.abs(drift) > SAME_TIME ? { seekTo: clock.time } : {}
  }
  if (Math.abs(drift) >= JUMP_AFTER) {
    return { seekTo: clock.time, ...(follower.rate === clock.rate ? {} : { rate: clock.rate }) }
  }
  // In steps of 5%, so the rate changes a few times while it catches up, not every frame.
  const nudge = Math.abs(drift) <= frame ? 0 : Math.round(-drift / CATCH_UP / 0.05) * 0.05
  const rate = clock.rate * (1 + nudge)
  return rate === follower.rate ? {} : { rate }
}

function playbackOf(media: SyncedMedia): Playback {
  return {
    time: media.currentTime,
    duration: media.duration,
    paused: media.paused,
    rate: media.playbackRate,
    seeking: media.seeking,
    loop: media.loop,
  }
}

/**
 * Keeps `follower` in step with `clock` until the returned function is called. Play, pause and
 * seeks on either video act on both. Only the clock's playback rate counts: set it there.
 */
export function syncVideos(clock: SyncedMedia, follower: SyncedMedia, frame = FRAME) {
  // Seeks this function started, whose events it mustn't pass on.
  const ownSeeks = new Map<SyncedMedia, number>()
  const listeners: [SyncedMedia, string, () => void][] = []
  let frameRequest = 0

  function on(media: SyncedMedia, type: string, listener: () => void) {
    media.addEventListener(type, listener)
    listeners.push([media, type, listener])
  }

  function seek(media: SyncedMedia, time: number) {
    ownSeeks.set(media, (ownSeeks.get(media) ?? 0) + 1)
    media.currentTime = time
  }

  function correct() {
    const { seekTo, rate } = followClock(playbackOf(clock), playbackOf(follower), frame)
    if (rate !== undefined) follower.playbackRate = rate
    if (seekTo !== undefined) seek(follower, seekTo)
  }

  // While the clock plays, check the follower every animation frame.
  function tick() {
    correct()
    frameRequest = clock.paused ? 0 : requestAnimationFrame(tick)
  }

  for (const [media, other] of [
    [clock, follower],
    [follower, clock],
  ] as const) {
    on(media, "play", () => {
      // play() is refused when the page may not autoplay; the other video then stays paused.
      if (other.paused) other.play().catch(() => undefined)
    })
    on(media, "pause", () => {
      if (!other.paused) other.pause()
    })
    on(media, "seeking", () => {
      const own = ownSeeks.get(media) ?? 0
      if (own > 0) {
        ownSeeks.set(media, own - 1)
        return
      }
      if (Math.abs(other.currentTime - media.currentTime) > SAME_TIME) seek(other, media.currentTime)
    })
    // Once a seek or a pause has settled, line the frames up.
    on(media, "seeked", correct)
    on(media, "pause", correct)
  }
  on(clock, "playing", () => {
    if (frameRequest === 0) frameRequest = requestAnimationFrame(tick)
  })

  correct()
  if (!clock.paused) frameRequest = requestAnimationFrame(tick)

  return () => {
    cancelAnimationFrame(frameRequest)
    for (const [media, type, listener] of listeners) media.removeEventListener(type, listener)
  }
}
