// The file starts with this declaration: shadcn's CLI drops the comments above a file's first
// statement when it installs it.
const SECONDS_PER_MINUTE = 60

/**
 * A time this little before a boundary (a frame, a second) already counts as past it: one
 * microsecond. Players report times in whole microseconds, and frames at 24 or 30 fps start
 * between them (frame 1 at 24 fps starts at 41,666.67 µs), so a frame's own start can read a
 * fraction of a microsecond early; float math adds its own error (1.16 × 25 is
 * 28.999999999999996, not 29).
 */
const TOLERANCE = 0.000001

/**
 * Some containers (WebM among them) store a video's length rounded to the millisecond, so it can
 * reach half a millisecond past the last frame. Less than this past a frame's start isn't another
 * frame.
 */
const DURATION_TOLERANCE = 0.001

/** The NTSC rates, written rounded as 23.976, 29.97, 47.952, 59.94 and 119.88. */
const NTSC_RATES = [24, 30, 48, 60, 120]

/** A non-negative finite number of seconds, or 0. */
function seconds(time: number) {
  return Number.isFinite(time) && time > 0 ? time : 0
}

/**
 * The exact frame rate for a rate written rounded: 23.976 is 24000/1001, 29.97 is 30000/1001,
 * 59.94 is 60000/1001. Other rates come back as they are. Every helper here calls it, because a
 * rounded rate drifts: at 29.97, frame 1,800 would start 60 µs late, which is past the tolerance.
 */
export function exactFps(fps: number): number {
  const ntsc = NTSC_RATES.map((rate) => (rate * 1000) / 1001).find((rate) => Math.abs(fps - rate) < 0.005)
  return ntsc ?? fps
}

/**
 * The frame showing at a time: the last one that starts at or before it, counted from 0. A time a
 * microsecond before a frame starts is that frame already. Times before 0, and times that aren't
 * finite, are frame 0.
 */
export function secondsToFrames(time: number, fps: number): number {
  return Math.floor((seconds(time) + TOLERANCE) * exactFps(fps))
}

/** Where a frame starts, in seconds. */
export function framesToSeconds(frames: number, fps: number): number {
  return frames / exactFps(fps)
}

/**
 * The time to seek to for the frame showing at `time`: the middle of that frame. Browsers show the
 * frame whose span holds the time they're given, so the middle shows it whatever their rounding or
 * the container's, where the frame's start can show the one before.
 */
export function snapToFrame(time: number, fps: number): number {
  return (secondsToFrames(time, fps) + 0.5) / exactFps(fps)
}

/** How many frames a video of this length holds; the last one is `frameCount - 1`. */
export function frameCount(duration: number, fps: number): number {
  return Math.max(0, Math.ceil((seconds(duration) - DURATION_TOLERANCE) * exactFps(fps)))
}

/** Hours, minutes and seconds of a whole number of seconds. */
function clock(total: number) {
  return [
    Math.floor(total / 3600),
    Math.floor(total / SECONDS_PER_MINUTE) % SECONDS_PER_MINUTE,
    total % SECONDS_PER_MINUTE,
  ]
}

/** How many frames make a second of timecode: the rate rounded, so 24 at 23.976 and 30 at 29.97. */
function timecodeBase(fps: number) {
  return Math.max(1, Math.round(fps))
}

/** Hours, minutes, seconds and frames of timecode for a frame number. */
function timecodeParts(frames: number, fps: number) {
  const base = timecodeBase(fps)
  const whole = Number.isFinite(frames) && frames > 0 ? Math.floor(frames) : 0
  const ff = whole % base
  return [...clock((whole - ff) / base), ff]
}

function pad(part: number) {
  return String(part).padStart(2, "0")
}

/**
 * A time as a clock shows it, in whole seconds: `m:ss` (0:05, 1:04, 12:30), or `h:mm:ss` from an
 * hour on. `hours` always shows them, for a time on a video an hour or longer, so that the time
 * keeps its width.
 */
export function formatTime(time: number, { hours = false }: { hours?: boolean } = {}): string {
  const [h = 0, m = 0, s = 0] = clock(Math.floor(seconds(time) + TOLERANCE))
  return h > 0 || hours ? `${String(h)}:${pad(m)}:${pad(s)}` : `${String(m)}:${pad(s)}`
}

/** `s`, `m:ss` or `h:mm:ss`, seconds with an optional fraction: groups left out on the left are 0. */
const CLOCK = /^(?:(?:(\d+):)?(\d+):)?(\d+(?:\.\d+)?)$/

/**
 * Reads a time someone typed, like "1:04", "1:02:03", "90" or "1:04.5", in seconds. Null when it
 * isn't one: seconds after a colon, and minutes after hours, go up to 59.
 */
export function parseTime(text: string): number | null {
  const match = CLOCK.exec(text.trim())
  if (!match) return null
  const [, h, m, s = "0"] = match
  if ((m !== undefined && Number(s) >= SECONDS_PER_MINUTE) || (h !== undefined && Number(m) >= SECONDS_PER_MINUTE)) {
    return null
  }
  return (Number(h ?? 0) * SECONDS_PER_MINUTE + Number(m ?? 0)) * SECONDS_PER_MINUTE + Number(s)
}

/**
 * A frame number as SMPTE timecode, `HH:MM:SS:FF`: 108 at 24 fps is 00:00:04:12. Frames count up
 * to the rate rounded (23 at 23.976, 29 at 29.97). Non-drop-frame, so at 29.97 fps the timecode
 * falls 3.6 seconds an hour behind the clock. Hours grow past two digits if they must.
 */
export function formatTimecode(frames: number, fps: number): string {
  return timecodeParts(frames, fps).map(pad).join(":")
}

/** `[[[HH:]MM:]SS:]FF`: groups left out on the left are 0; hours can have any number of digits. */
const TIMECODE = /^(?:(?:(?:(\d+):)?(\d{1,2}):)?(\d{1,2}):)?(\d{1,2})$/

/**
 * Reads timecode someone typed, like "00:00:04:12", or the end of it ("04:12"), as a frame number.
 * Null when it isn't timecode at this rate: minutes and seconds go up to 59, frames to the rate
 * rounded, less one.
 */
export function parseTimecode(text: string, fps: number): number | null {
  const match = TIMECODE.exec(text.trim())
  if (!match) return null
  // A group that didn't take part in the match is undefined, whatever the array's type says.
  const [h = 0, m = 0, s = 0, f = 0] = match.slice(1).map((part: string | undefined) => Number(part ?? 0))
  const base = timecodeBase(fps)
  if (m >= SECONDS_PER_MINUTE || s >= SECONDS_PER_MINUTE || f >= base) return null
  return ((h * SECONDS_PER_MINUTE + m) * SECONDS_PER_MINUTE + s) * base + f
}

const UNITS = ["hour", "minute", "second", "frame"]

/**
 * A time in words, for screen readers (a slider's `aria-valuetext`): "1 minute 4 seconds". With
 * `fps`, it reads the timecode instead, frames and all: "4 seconds 12 frames". Parts that are 0
 * are left out, and no time at all is "0 seconds".
 */
export function spokenTime(time: number, fps?: number): string {
  const parts =
    fps === undefined
      ? clock(Math.floor(seconds(time) + TOLERANCE))
      : timecodeParts(secondsToFrames(time, fps), fps)
  const words = parts.flatMap((value, index) =>
    value > 0 ? [`${String(value)} ${UNITS[index] ?? ""}${value === 1 ? "" : "s"}`] : []
  )
  return words.length > 0 ? words.join(" ") : "0 seconds"
}
