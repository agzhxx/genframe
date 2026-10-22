// A pretend generator for demos and tests: a driver for useGenerationQueue that takes a while,
// reports progress at a calm pace, and sometimes fails, without calling any API. Its randomness is
// seeded by the job and the attempt, so the same jobs run the same way every time, and its timing
// is plain setTimeout, so fake timers drive it in tests.

import type { GenerationDriver } from "@/registry/hooks/use-generation-queue"
import type {
  GenerationJob,
  GenerationKind,
  GenerationRequest,
  GenerationResult,
} from "@/registry/lib/generation-queue-reducer"

export interface SimulatedGeneratorOptions<Request extends GenerationRequest = GenerationRequest> {
  /** What a successful run makes: the result for the job, like an image you have already. */
  result: (job: GenerationJob<Request>) => GenerationResult
  /**
   * How long a run takes, in milliseconds, by kind: each run draws a time between the two.
   *
   * @defaultValue { image: [3000, 6000], video: [8000, 14000] }
   */
  durations?: Partial<Record<GenerationKind, readonly [min: number, max: number]>>
  /**
   * The share of runs that fail, from 0 to 1. A run fails somewhere between a fifth and four
   * fifths of the way through.
   *
   * @defaultValue 0
   */
  failureRate?: number
  /**
   * Runs report no progress, only their result, as some models do. The queue then counts down the
   * driver's estimate instead.
   *
   * @defaultValue false
   */
  unknownProgress?: boolean
  /**
   * Seeds the random numbers: with the same seed, the same jobs take the same time and fail the same
   * way.
   *
   * @defaultValue 1
   */
  seed?: number
}

const DEFAULT_DURATIONS: Record<GenerationKind, readonly [number, number]> = {
  image: [3000, 6000],
  video: [8000, 14000],
}

// How often a run reports its progress: twice a second, not every frame.
const INTERVAL = 500

// FNV-1a: a string to a 32-bit number, to seed a run.
function hash(text: string) {
  let value = 0x811c9dc5
  for (let index = 0; index < text.length; index++) {
    value = Math.imul(value ^ text.charCodeAt(index), 0x01000193)
  }
  return value >>> 0
}

// Mulberry32: a small, fast seeded generator of numbers from 0 to 1.
function seeded(seed: number) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A driver that pretends to generate: each run takes a time drawn from `durations`, reports its
 * progress twice a second (unless `unknownProgress`), and then resolves with `result(job)`, or
 * fails at the `failureRate`. Its estimate is the middle of the kind's durations.
 */
export function createSimulatedGenerator<Request extends GenerationRequest = GenerationRequest>({
  result,
  durations,
  failureRate = 0,
  unknownProgress = false,
  seed = 1,
}: SimulatedGeneratorOptions<Request>): GenerationDriver<Request> {
  function range(kind: GenerationKind) {
    return durations?.[kind] ?? DEFAULT_DURATIONS[kind]
  }

  return {
    estimate(request) {
      const [min, max] = range(request.kind)
      return (min + max) / 2
    },
    run(job, { signal, progress }) {
      // The same job and attempt always draw the same numbers; a retry draws new ones.
      const random = seeded(hash(`${String(seed)}:${job.id}:${String(job.attempt)}`))
      const [min, max] = range(job.kind)
      const duration = Math.round(min + (max - min) * random())
      const fails = random() < failureRate
      const end = fails ? Math.round(duration * (0.2 + 0.6 * random())) : duration

      return new Promise((resolve, reject) => {
        let elapsed = 0
        let reported = 0
        let timer: ReturnType<typeof setTimeout> | undefined

        function stop() {
          clearTimeout(timer)
          reject(new DOMException("The run was stopped", "AbortError"))
        }

        function finish() {
          signal.removeEventListener("abort", stop)
          if (fails) reject(new Error("Simulated failure"))
          else resolve(result(job))
        }

        function schedule() {
          const last = end - elapsed <= INTERVAL
          timer = setTimeout(
            () => {
              if (last) {
                finish()
                return
              }
              elapsed += INTERVAL
              if (!unknownProgress) {
                // A little faster or slower each time, as real steps are, but never backwards
                // and never 100% before the result.
                const target = (elapsed / duration) * (0.85 + 0.3 * random())
                reported = Math.min(0.99, Math.max(reported, target))
                progress(Math.round(reported * 100) / 100)
              }
              schedule()
            },
            last ? end - elapsed : INTERVAL
          )
        }

        if (signal.aborted) {
          stop()
          return
        }
        signal.addEventListener("abort", stop, { once: true })
        schedule()
      })
    },
  }
}
