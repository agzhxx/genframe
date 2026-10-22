// The generation queue's state, as a pure reducer: the list of jobs, newest first, and the events
// that move them through their states. Nothing here knows about any API, timer or component.
//
//   queued ──start──▶ running ──succeed──▶ succeeded
//     │                  │└────fail──────▶ failed ───┐
//     └─────cancel───────┴────cancel─────▶ canceled ─┴─retry─▶ queued (the next attempt)
//
// Late events are the hard part. A driver's run can report after the job moved on: progress after a
// cancel, or the first attempt's success after a retry started a second one. So the reports from a
// run (start, progress, succeed, fail) name the attempt they belong to, and every event is checked
// before it applies: an event about a job that's gone, a report from another attempt than the job's
// current one, or an event its state doesn't take (a success for a canceled job) changes nothing,
// and the reducer returns the same array, so React skips the render.

export type GenerationKind = "image" | "video"

export type GenerationStatus = "queued" | "running" | "succeeded" | "failed" | "canceled"

/**
 * What to generate. Extend it with whatever your driver needs to run the job, like a model or a
 * duration: the queue carries the extra fields along untouched. Don't reuse the job's own field
 * names (`status`, `progress`…).
 */
export interface GenerationRequest {
  /** Whether it makes an image or a video. Jobs are named and numbered by kind: "Image 3". */
  kind: GenerationKind
  /** What to make, in words. The card shows it, and it's the result's alt text when the result has none. */
  prompt: string
  /** The aspect ratio asked for, width:height ("16:9"). The card keeps this shape from the start. */
  ratio: string
}

/** What a run made. A video's result is an image of it, like its poster: your app knows the rest. */
export interface GenerationResult {
  /** The image's URL. */
  src: string
  /** Its size in pixels. */
  width: number
  height: number
  /** A ThumbHash of it, base64: a blurred placeholder to show while the image loads. */
  thumbhash?: string
  /** Its alt text. Without it, the job's prompt is used. */
  alt?: string
}

/** What the queue keeps about each job, besides its request. */
export interface GenerationJobState {
  /** Unique in the queue. */
  id: string
  /** Its number among the jobs of its kind: the 3 in "Image 3". Never reused. */
  number: number
  status: GenerationStatus
  /** Which run this is: 1 at first, one more at every retry. Reports from other attempts are ignored. */
  attempt: number
  /** How long a run should take, in milliseconds, as the driver estimated it; null without one. */
  estimate: number | null
  /** When this attempt started, in milliseconds (`Date.now()`); null until it starts. */
  startedAt: number | null
  /** How far this attempt is, from 0 to 1; null while it's unknown. Never goes backwards. */
  progress: number | null
  /** When `progress` last moved. */
  progressAt: number | null
  /** What a succeeded job made. */
  result: GenerationResult | null
  /** Why a failed job failed, in words. */
  error: string | null
  /** Whether a canceled job's cost was given back: true when it was canceled before it started. */
  refunded: boolean
}

/** A job in the queue: its request and its state. */
export type GenerationJob<Request extends GenerationRequest = GenerationRequest> = Request &
  GenerationJobState

/**
 * What can happen to the queue. Commands come from the user and name a job: submit, cancel, retry,
 * remove. Reports come from a run of the driver and name the job and the attempt: start, progress,
 * succeed, fail. Times are in milliseconds, like `Date.now()`.
 */
export type GenerationEvent<Request extends GenerationRequest = GenerationRequest> =
  | {
      type: "submit"
      id: string
      number: number
      request: Request
      /** How long a run should take, in milliseconds. */
      estimate?: number
    }
  | { type: "start"; id: string; attempt: number; at: number }
  | { type: "progress"; id: string; attempt: number; progress: number | null; at: number }
  | { type: "succeed"; id: string; attempt: number; result: GenerationResult }
  | { type: "fail"; id: string; attempt: number; error: string }
  | { type: "cancel"; id: string }
  | { type: "retry"; id: string }
  | { type: "remove"; id: string }

type Change<Request extends GenerationRequest> = GenerationJob<Request> | "remove" | "ignore"

// What an event does to the job it's about, in the job's current state.
function change<Request extends GenerationRequest>(
  job: GenerationJob<Request>,
  event: Exclude<GenerationEvent<Request>, { type: "submit" }>
): Change<Request> {
  switch (event.type) {
    case "start":
      if (job.status !== "queued") return "ignore"
      return { ...job, status: "running", startedAt: event.at, progress: null, progressAt: null }
    case "progress": {
      if (job.status !== "running" || event.progress === null || !Number.isFinite(event.progress)) {
        return "ignore"
      }
      const progress = Math.min(1, Math.max(0, event.progress))
      if (job.progress !== null && progress <= job.progress) return "ignore"
      return { ...job, progress, progressAt: event.at }
    }
    case "succeed":
      if (job.status !== "running") return "ignore"
      return { ...job, status: "succeeded", result: event.result, progress: 1 }
    case "fail":
      if (job.status !== "running") return "ignore"
      return { ...job, status: "failed", error: event.error }
    case "cancel":
      if (job.status !== "queued" && job.status !== "running") return "ignore"
      // Nothing is spent before a job starts.
      return { ...job, status: "canceled", refunded: job.status === "queued" }
    case "retry":
      if (job.status !== "failed" && job.status !== "canceled") return "ignore"
      return {
        ...job,
        status: "queued",
        attempt: job.attempt + 1,
        startedAt: null,
        progress: null,
        progressAt: null,
        error: null,
        refunded: false,
      }
    case "remove":
      return "remove"
  }
}

/**
 * The queue after an event: the jobs, newest first. Returns the same array when the event changes
 * nothing, and only the job the event is about is a new object. Use it with `useReducer`, or
 * through `useGenerationQueue`, which runs the jobs on a driver.
 */
export function generationQueueReducer<Request extends GenerationRequest>(
  jobs: readonly GenerationJob<Request>[],
  event: GenerationEvent<Request>
): readonly GenerationJob<Request>[] {
  if (event.type === "submit") {
    if (jobs.some((job) => job.id === event.id)) return jobs
    const job: GenerationJob<Request> = {
      ...event.request,
      id: event.id,
      number: event.number,
      status: "queued",
      attempt: 1,
      estimate: event.estimate ?? null,
      startedAt: null,
      progress: null,
      progressAt: null,
      result: null,
      error: null,
      refunded: false,
    }
    return [job, ...jobs]
  }

  const job = jobs.find((entry) => entry.id === event.id)
  // A job that's gone: removed, or never there.
  if (!job) return jobs
  // A report from another attempt than the job's current one: a run that's over.
  if ("attempt" in event && event.attempt !== job.attempt) return jobs

  const next = change(job, event)
  if (next === "ignore") return jobs
  if (next === "remove") return jobs.filter((other) => other !== job)
  return jobs.map((other) => (other === job ? next : other))
}

/**
 * A queued job's place in the line: 1 for the next to start. The line is the order the jobs were
 * submitted in, so a retried job keeps its place. Null for a job that isn't queued, or isn't there.
 */
export function queuePosition(jobs: readonly GenerationJob[], id: string): number | null {
  let position = 0
  // Oldest first: the jobs are newest first.
  for (let index = jobs.length - 1; index >= 0; index--) {
    const job = jobs[index]
    if (job?.status !== "queued") continue
    position++
    if (job.id === id) return position
  }
  return null
}

// How long a running job has left at `now`, or null with nothing to go by.
function runningTimeLeft(job: GenerationJob, now: number) {
  const { startedAt, progress, progressAt, estimate } = job
  if (startedAt === null) return null
  // From the rate it has made progress at: 25% in 2 s leaves 6 s, counted down since that report.
  if (progress !== null && progress > 0 && progressAt !== null && progressAt > startedAt) {
    const rate = progress / (progressAt - startedAt)
    return Math.max(0, (1 - progress) / rate - Math.max(0, now - progressAt))
  }
  // Else from the driver's estimate, counted down since the start.
  if (estimate === null) return null
  return Math.max(0, estimate - Math.max(0, now - startedAt))
}

/**
 * How long until a job is done, in milliseconds, at `now`; null when there's nothing to go by, and
 * for jobs that are finished.
 *
 * - A running job goes by its progress rate, or by the driver's estimate while its progress is
 *   unknown.
 * - A queued job waits for a free slot: `concurrency` jobs run at once, each running job takes the
 *   time it has left and each job ahead of it in the line takes its estimate; then it takes its own.
 */
export function timeLeft(
  jobs: readonly GenerationJob[],
  id: string,
  { now, concurrency }: { now: number; concurrency: number }
): number | null {
  const job = jobs.find((entry) => entry.id === id)
  if (job?.status === "running") return runningTimeLeft(job, now)
  if (job?.status !== "queued") return null

  // When each slot's job will be done, from now.
  const ends: number[] = []
  for (const running of jobs) {
    if (running.status !== "running") continue
    const left = runningTimeLeft(running, now)
    if (left === null) return null
    ends.push(left)
  }
  // The line, oldest first, up to this job: each one starts once fewer than `concurrency` are busy.
  const line = jobs.filter((entry) => entry.status === "queued").reverse()
  let start = 0
  for (const ahead of line) {
    for (;;) {
      const busy = ends.filter((end) => end > start)
      if (busy.length < concurrency) break
      start = Math.min(...busy)
    }
    if (ahead.estimate === null) return null
    const end = start + ahead.estimate
    if (ahead.id === id) return end
    ends.push(end)
  }
  return null
}
