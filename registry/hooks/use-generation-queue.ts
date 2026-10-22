"use client"

import { useEffect, useState, useSyncExternalStore } from "react"

import {
  generationQueueReducer,
  queuePosition,
  type GenerationEvent,
  type GenerationJob,
  type GenerationKind,
  type GenerationRequest,
  type GenerationResult,
} from "@/registry/lib/generation-queue-reducer"

/** What a run of the driver gets from the queue, besides the job. */
export interface GenerationRun {
  /**
   * Aborts when the job is canceled or removed, or the queue unmounts: stop the work then. Whatever
   * the run reports after that is ignored.
   */
  signal: AbortSignal
  /**
   * Reports how far the run is, from 0 to 1, or null when it can't tell. A few times a second at
   * most: the cards show every report.
   */
  progress: (progress: number | null) => void
}

/** Runs jobs: whatever generates, behind one function. The queue knows nothing else about it. */
export interface GenerationDriver<Request extends GenerationRequest = GenerationRequest> {
  /**
   * Runs one attempt of a job, once its turn comes. Resolve with what it made, or reject to fail
   * it: the error's message is shown. Stop when `run.signal` aborts.
   */
  run: (job: GenerationJob<Request>, run: GenerationRun) => Promise<GenerationResult>
  /**
   * How long a run of the request should take, in milliseconds: the time left shown before a job
   * has progress, and while it waits in line.
   */
  estimate?: (request: Request) => number | undefined
}

export interface UseGenerationQueueOptions<Request extends GenerationRequest = GenerationRequest> {
  /** Runs the jobs. A new driver takes the runs that start from then on. */
  driver: GenerationDriver<Request>
  /**
   * How many jobs run at once; the others wait in line, in the order they were submitted.
   *
   * @defaultValue 2
   */
  concurrency?: number
}

export interface UseGenerationQueueResult<Request extends GenerationRequest = GenerationRequest> {
  /** Every job, newest first. */
  jobs: readonly GenerationJob<Request>[]
  /** Adds a job to the queue, and returns its id. It starts as soon as there's room. */
  submit: (request: Request) => string
  /** Cancels a queued or running job; a job canceled before it started is refunded. */
  cancel: (id: string) => void
  /** Queues a failed or canceled job again, as its next attempt, in its old place in the line. */
  retry: (id: string) => void
  /** Takes a job out of the queue, and stops it if it's running. */
  remove: (id: string) => void
}

function messageOf(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : ""
  return message || "Something went wrong"
}

// The queue lives outside React, in a small store, so that what follows an event happens at once:
// a submitted job starts in the same tick when there's room, and a cancel stops its run before
// anything renders. React reads it through useSyncExternalStore.
function createQueue<Request extends GenerationRequest>() {
  let jobs: readonly GenerationJob<Request>[] = []
  let driver: GenerationDriver<Request> | null = null
  let concurrency = 2
  let submitted = 0
  const counts: Record<GenerationKind, number> = { image: 0, video: 0 }
  // The run of each running job: its attempt, and what stops it.
  const runs = new Map<string, { attempt: number; controller: AbortController }>()
  const listeners = new Set<() => void>()

  function launch(job: GenerationJob<Request>, using: GenerationDriver<Request>) {
    const { id, attempt } = job
    const controller = new AbortController()
    const { signal } = controller
    runs.set(id, { attempt, controller })
    // A stopped run can still report, if its driver doesn't listen to the signal, and the job may
    // run again at the same attempt (when React remounts the queue in development): drop it.
    const report = (event: GenerationEvent<Request>) => {
      if (!signal.aborted) dispatch(event)
    }
    // Inside a promise, so a driver that throws fails the job too.
    new Promise<GenerationResult>((resolve) => {
      resolve(
        using.run(job, {
          signal,
          progress: (progress) => {
            report({ type: "progress", id, attempt, progress, at: Date.now() })
          },
        })
      )
    }).then(
      (result) => {
        report({ type: "succeed", id, attempt, result })
      },
      (error: unknown) => {
        report({ type: "fail", id, attempt, error: messageOf(error) })
      }
    )
  }

  // Brings the runs in line with the jobs: stops the runs whose job stopped running (canceled,
  // removed, finished or retried), starts the next jobs in line while there's room, and runs them.
  // Nothing runs while nothing listens: before the queue mounts, and after it unmounts.
  function sync() {
    const active = driver !== null && listeners.size > 0
    for (const [id, run] of runs) {
      const job = jobs.find((entry) => entry.id === id)
      if (active && job?.status === "running" && job.attempt === run.attempt) continue
      runs.delete(id)
      run.controller.abort()
    }
    if (!driver || !active) return

    const free = concurrency - jobs.filter((job) => job.status === "running").length
    const next = jobs.filter((job) => {
      const position = queuePosition(jobs, job.id)
      return position !== null && position <= free
    })
    const at = Date.now()
    for (const job of next) {
      jobs = generationQueueReducer(jobs, { type: "start", id: job.id, attempt: job.attempt, at })
    }
    for (const job of jobs) {
      if (job.status === "running" && !runs.has(job.id)) launch(job, driver)
    }
  }

  // Syncs, and tells React when the jobs changed.
  function settle(before: readonly GenerationJob<Request>[]) {
    sync()
    if (jobs === before) return
    for (const listener of listeners) listener()
  }

  function dispatch(event: GenerationEvent<Request>) {
    const before = jobs
    jobs = generationQueueReducer(jobs, event)
    if (jobs !== before) settle(before)
  }

  return {
    getSnapshot: () => jobs,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      settle(jobs)
      return () => {
        listeners.delete(listener)
        settle(jobs)
      }
    },
    configure: (nextDriver: GenerationDriver<Request>, nextConcurrency: number) => {
      driver = nextDriver
      concurrency = nextConcurrency
      settle(jobs)
    },
    submit: (request: Request) => {
      submitted += 1
      counts[request.kind] += 1
      const id = String(submitted)
      const estimate = driver?.estimate?.(request)
      dispatch({ type: "submit", id, number: counts[request.kind], request, estimate })
      return id
    },
    cancel: (id: string) => {
      dispatch({ type: "cancel", id })
    },
    retry: (id: string) => {
      dispatch({ type: "retry", id })
    },
    remove: (id: string) => {
      dispatch({ type: "remove", id })
    },
  }
}

/**
 * A generation queue: jobs that wait in line, run on your driver a few at a time, and end as
 * succeeded, failed or canceled, through the queue's reducer. It knows nothing about any API: the
 * driver does the work. Everything stops when the component unmounts.
 */
export function useGenerationQueue<Request extends GenerationRequest>({
  driver,
  concurrency = 2,
}: UseGenerationQueueOptions<Request>): UseGenerationQueueResult<Request> {
  if (!(concurrency >= 1)) {
    throw new RangeError(`concurrency must be 1 or more: got ${String(concurrency)}`)
  }
  const [queue] = useState(() => createQueue<Request>())
  // Before the store's subscription below, so the first sync has the driver.
  useEffect(() => {
    queue.configure(driver, concurrency)
  }, [queue, driver, concurrency])
  const jobs = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot)
  return { jobs, submit: queue.submit, cancel: queue.cancel, retry: queue.retry, remove: queue.remove }
}
