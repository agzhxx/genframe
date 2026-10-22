// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerationJob, GenerationRequest, GenerationResult } from '@/registry/lib/generation-queue-reducer';
import { createSimulatedGenerator, type SimulatedGeneratorOptions } from '@/registry/lib/simulated-generator';

const result: GenerationResult = { src: 'car.webp', width: 1280, height: 720 };

function job(id: string, attempt = 1, kind: GenerationRequest['kind'] = 'image'): GenerationJob {
  return {
    kind,
    prompt: 'A red car',
    ratio: '16:9',
    id,
    number: 1,
    status: 'running',
    attempt,
    estimate: null,
    startedAt: 0,
    progress: null,
    progressAt: null,
    result: null,
    error: null,
    refunded: false,
  };
}

interface Outcome {
  /** When it settled, in milliseconds from the start. */
  at: number;
  value?: GenerationResult;
  error?: unknown;
  /** Each progress report, with its time. */
  reports: [at: number, progress: number | null][];
}

// Runs one job on fake timers until it settles.
async function simulate(
  options: Partial<SimulatedGeneratorOptions> = {},
  target = job('a'),
  signal = new AbortController().signal,
) {
  const driver = createSimulatedGenerator({ result: () => result, ...options });
  const startedAt = Date.now();
  const outcome: Outcome = { at: -1, reports: [] };
  driver
    .run(target, {
      signal,
      progress: (progress) => {
        outcome.reports.push([Date.now() - startedAt, progress]);
      },
    })
    .then(
      (value) => {
        outcome.at = Date.now() - startedAt;
        outcome.value = value;
      },
      (error: unknown) => {
        outcome.at = Date.now() - startedAt;
        outcome.error = error;
      },
    );
  await vi.runAllTimersAsync();
  return outcome;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createSimulatedGenerator', () => {
  it('takes a time drawn from the kind’s durations, then makes the result', async () => {
    const image = await simulate();
    expect(image.value).toBe(result);
    expect(image.at).toBeGreaterThanOrEqual(3000);
    expect(image.at).toBeLessThanOrEqual(6000);
    const clip = await simulate({ durations: { video: [500, 700] } }, job('a', 1, 'video'));
    expect(clip.at).toBeGreaterThanOrEqual(500);
    expect(clip.at).toBeLessThanOrEqual(700);
  });

  it('reports its progress twice a second, never backwards and never 100% before the result', async () => {
    const { at, reports } = await simulate({ durations: { image: [4000, 4000] } });
    expect(at).toBe(4000);
    expect(reports.map(([time]) => time)).toEqual([500, 1000, 1500, 2000, 2500, 3000, 3500]);
    const values = reports.map(([, progress]) => progress ?? -1);
    expect(values).toEqual(values.toSorted((a, b) => a - b));
    expect(Math.min(...values)).toBeGreaterThan(0);
    expect(Math.max(...values)).toBeLessThan(1);
  });

  it('runs a job and attempt the same way every time, and a retry or another seed differently', async () => {
    const first = await simulate();
    expect(await simulate()).toEqual(first);
    expect(await simulate({}, job('a', 2))).not.toEqual(first);
    expect(await simulate({}, job('b'))).not.toEqual(first);
    expect(await simulate({ seed: 7 })).not.toEqual(first);
  });

  it('fails at its failure rate, partway through', async () => {
    const failed = await simulate({ failureRate: 1, durations: { image: [5000, 5000] } });
    expect(failed.error).toEqual(new Error('Simulated failure'));
    expect(failed.at).toBeGreaterThanOrEqual(1000);
    expect(failed.at).toBeLessThanOrEqual(4000);
    const outcomes = await Promise.all(
      Array.from({ length: 40 }, (_, index) => simulate({ failureRate: 0.25 }, job(String(index)))),
    );
    const failures = outcomes.filter((outcome) => outcome.error !== undefined).length;
    expect(failures).toBeGreaterThan(3);
    expect(failures).toBeLessThan(20);
  });

  it('reports no progress when its progress is unknown', async () => {
    const { value, reports } = await simulate({ unknownProgress: true });
    expect(value).toBe(result);
    expect(reports).toEqual([]);
  });

  it('stops when its signal aborts: no more reports, no timers left, an AbortError', async () => {
    const controller = new AbortController();
    const driver = createSimulatedGenerator({ result: () => result });
    const reports: (number | null)[] = [];
    const run = driver.run(job('a'), {
      signal: controller.signal,
      progress: (progress) => reports.push(progress),
    });
    await vi.advanceTimersByTimeAsync(1200);
    expect(reports).toHaveLength(2);
    controller.abort();
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(reports).toHaveLength(2);

    const stopped = await simulate({}, job('b'), AbortSignal.abort());
    expect(stopped).toMatchObject({ at: 0, reports: [], error: { name: 'AbortError' } });
  });

  it('estimates the middle of the kind’s durations', () => {
    const driver = createSimulatedGenerator({ result: () => result, durations: { video: [6000, 10_000] } });
    expect(driver.estimate?.({ kind: 'image', prompt: '', ratio: '1:1' })).toBe(4500);
    expect(driver.estimate?.({ kind: 'video', prompt: '', ratio: '1:1' })).toBe(8000);
  });

  it('makes the result for the job it ran', async () => {
    const results = await Promise.all(
      ['a', 'b'].map((id) => simulate({ result: (ran) => ({ ...result, src: `${ran.id}.webp` }) }, job(id))),
    );
    expect(results.map((outcome) => outcome.value?.src)).toEqual(['a.webp', 'b.webp']);
  });
});
