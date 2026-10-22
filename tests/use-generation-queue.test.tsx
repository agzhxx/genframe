import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGenerationQueue, type GenerationDriver, type GenerationRun } from '@/registry/hooks/use-generation-queue';
import type { GenerationJob, GenerationRequest, GenerationResult } from '@/registry/lib/generation-queue-reducer';

const image: GenerationRequest = { kind: 'image', prompt: 'A red car', ratio: '16:9' };
const video: GenerationRequest = { kind: 'video', prompt: 'A ferry crossing a bay', ratio: '9:16' };
const result: GenerationResult = { src: 'car.webp', width: 1280, height: 720 };

interface ManualRun extends GenerationRun {
  job: GenerationJob;
  resolve: (result: GenerationResult) => void;
  reject: (reason: unknown) => void;
}

// A driver the test runs by hand: every run waits until the test resolves or rejects it. Like a
// careless real one, it doesn't stop when its signal aborts.
function manualDriver(estimate = 4000) {
  const runs: ManualRun[] = [];
  const driver: GenerationDriver = {
    run: (job, run) =>
      new Promise((resolve, reject) => {
        runs.push({ ...run, job, resolve, reject });
      }),
    estimate: () => estimate,
  };
  return { driver, runs };
}

function lastRun(runs: ManualRun[]) {
  const run = runs.at(-1);
  if (!run) throw new Error('Nothing ran');
  return run;
}

function render(driver: GenerationDriver, concurrency?: number) {
  return renderHook((props: { driver: GenerationDriver; concurrency?: number }) => useGenerationQueue(props), {
    initialProps: { driver, concurrency },
  });
}

function statuses(jobs: readonly GenerationJob[]) {
  return jobs.map((job) => `${job.id}:${job.status}`);
}

// Lets the promises settle: a run's outcome reaches the queue in a microtask.
async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(10_000);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useGenerationQueue', () => {
  it('starts jobs while there’s room, in the order they were submitted', () => {
    const { driver, runs } = manualDriver();
    const { result: queue } = render(driver, 2);
    act(() => {
      queue.current.submit(image);
      queue.current.submit(video);
      queue.current.submit(image);
    });
    expect(statuses(queue.current.jobs)).toEqual(['3:queued', '2:running', '1:running']);
    expect(runs.map((run) => run.job.id)).toEqual(['1', '2']);
    expect(queue.current.jobs[1]).toMatchObject({ startedAt: 10_000, attempt: 1 });
  });

  it('starts the next job when one finishes', async () => {
    const { driver, runs } = manualDriver();
    const { result: queue } = render(driver, 1);
    act(() => {
      queue.current.submit(image);
      queue.current.submit(image);
    });
    lastRun(runs).resolve(result);
    await settle();
    expect(statuses(queue.current.jobs)).toEqual(['2:running', '1:succeeded']);
    expect(queue.current.jobs[1]?.result).toEqual(result);
    expect(runs.map((run) => run.job.id)).toEqual(['1', '2']);
  });

  it('runs two at once unless told otherwise', () => {
    const { driver, runs } = manualDriver();
    const { result: queue } = render(driver);
    act(() => {
      for (let count = 0; count < 3; count++) queue.current.submit(image);
    });
    expect(runs).toHaveLength(2);
  });

  it('returns each job’s id, and numbers the jobs by kind', () => {
    const { driver } = manualDriver(8000);
    const { result: queue } = render(driver);
    const ids: string[] = [];
    act(() => {
      ids.push(queue.current.submit(image), queue.current.submit(video), queue.current.submit(image));
    });
    expect(ids).toEqual(['1', '2', '3']);
    expect(queue.current.jobs.map((job) => [job.kind, job.number, job.estimate])).toEqual([
      ['image', 2, 8000],
      ['video', 1, 8000],
      ['image', 1, 8000],
    ]);
  });

  it('records the driver’s progress reports with their time', () => {
    const { driver, runs } = manualDriver();
    const { result: queue } = render(driver);
    act(() => {
      queue.current.submit(image);
    });
    vi.setSystemTime(12_000);
    act(() => {
      lastRun(runs).progress(0.4);
    });
    expect(queue.current.jobs[0]).toMatchObject({ progress: 0.4, progressAt: 12_000 });
  });

  it('fails a job with its error’s message, whatever the driver throws', async () => {
    const { driver, runs } = manualDriver();
    const { result: queue } = render(driver, 3);
    act(() => {
      for (let count = 0; count < 3; count++) queue.current.submit(image);
    });
    runs[0]?.reject(new Error('Out of memory'));
    runs[1]?.reject('Rate limited');
    runs[2]?.reject(undefined);
    await settle();
    expect(queue.current.jobs.map((job) => job.error)).toEqual(['Something went wrong', 'Rate limited', 'Out of memory']);

    const throwing: GenerationDriver = {
      run: () => {
        throw new Error('No API key');
      },
    };
    const { result: other } = render(throwing);
    act(() => {
      other.current.submit(image);
    });
    await settle();
    expect(other.current.jobs[0]).toMatchObject({ status: 'failed', error: 'No API key' });
  });

  it('cancels a queued job before it runs, refunded', () => {
    const { driver, runs } = manualDriver();
    const { result: queue } = render(driver, 1);
    act(() => {
      queue.current.submit(image);
      queue.current.submit(image);
    });
    act(() => {
      queue.current.cancel('2');
    });
    expect(queue.current.jobs[0]).toMatchObject({ status: 'canceled', refunded: true });
    expect(runs).toHaveLength(1);
  });

  it('cancels a running job: its run is told to stop, and the next one starts', () => {
    const { driver, runs } = manualDriver();
    const { result: queue } = render(driver, 1);
    act(() => {
      queue.current.submit(image);
      queue.current.submit(image);
    });
    const first = lastRun(runs);
    act(() => {
      queue.current.cancel('1');
    });
    expect(first.signal.aborted).toBe(true);
    expect(statuses(queue.current.jobs)).toEqual(['2:running', '1:canceled']);
    expect(queue.current.jobs[1]?.refunded).toBe(false);
    expect(lastRun(runs).job.id).toBe('2');
  });

  it('retries with a new run; what the stopped run reports late changes nothing', async () => {
    const { driver, runs } = manualDriver();
    const { result: queue } = render(driver, 1);
    act(() => {
      queue.current.submit(image);
    });
    const first = lastRun(runs);
    act(() => {
      queue.current.cancel('1');
      queue.current.retry('1');
    });
    const second = lastRun(runs);
    expect(second).not.toBe(first);
    expect(second.job.attempt).toBe(2);
    expect(second.signal.aborted).toBe(false);

    // The first run didn't listen to its signal: its progress and result arrive late.
    act(() => {
      first.progress(0.9);
    });
    first.resolve({ ...result, src: 'old.webp' });
    await settle();
    expect(queue.current.jobs[0]).toMatchObject({ status: 'running', attempt: 2, progress: null });

    second.resolve(result);
    await settle();
    expect(queue.current.jobs[0]).toMatchObject({ status: 'succeeded', attempt: 2, result });
  });

  it('removes a job, and stops it if it runs', () => {
    const { driver, runs } = manualDriver();
    const { result: queue } = render(driver);
    act(() => {
      queue.current.submit(image);
      queue.current.submit(image);
    });
    act(() => {
      queue.current.remove('1');
    });
    expect(statuses(queue.current.jobs)).toEqual(['2:running']);
    expect(runs[0]?.signal.aborted).toBe(true);
    expect(runs[1]?.signal.aborted).toBe(false);
  });

  it('stops every run when it unmounts, and ignores what they report after', async () => {
    const { driver, runs } = manualDriver();
    const { result: queue, unmount } = render(driver);
    act(() => {
      queue.current.submit(image);
      queue.current.submit(image);
    });
    unmount();
    expect(runs.map((run) => run.signal.aborted)).toEqual([true, true]);
    runs[0]?.progress(0.5);
    runs[1]?.resolve(result);
    await settle();
    expect(statuses(queue.current.jobs)).toEqual(['2:running', '1:running']);
  });

  it('starts more jobs when the concurrency goes up, and lets running ones finish when it goes down', async () => {
    const { driver, runs } = manualDriver();
    const { result: queue, rerender } = render(driver, 1);
    act(() => {
      for (let count = 0; count < 4; count++) queue.current.submit(image);
    });
    expect(runs).toHaveLength(1);
    rerender({ driver, concurrency: 3 });
    expect(runs).toHaveLength(3);
    rerender({ driver, concurrency: 1 });
    expect(statuses(queue.current.jobs)).toEqual(['4:queued', '3:running', '2:running', '1:running']);
    runs[0]?.resolve(result);
    runs[1]?.resolve(result);
    await settle();
    expect(runs).toHaveLength(3);
    runs[2]?.resolve(result);
    await settle();
    expect(runs).toHaveLength(4);
  });

  it('runs the jobs that start from then on with a new driver', async () => {
    const first = manualDriver();
    const second = manualDriver(2000);
    const { result: queue, rerender } = render(first.driver, 1);
    act(() => {
      queue.current.submit(image);
      queue.current.submit(image);
    });
    rerender({ driver: second.driver, concurrency: 1 });
    act(() => {
      queue.current.submit(image);
    });
    expect(queue.current.jobs[0]?.estimate).toBe(2000);
    lastRun(first.runs).resolve(result);
    await settle();
    expect(first.runs).toHaveLength(1);
    expect(second.runs.map((run) => run.job.id)).toEqual(['2']);
  });

  it('runs every job at once with no limit', async () => {
    const { driver, runs } = manualDriver();
    const { result: queue } = render(driver, Number.POSITIVE_INFINITY);
    act(() => {
      for (let count = 0; count < 5; count++) queue.current.submit(image);
    });
    expect(runs).toHaveLength(5);
    runs[0]?.resolve(result);
    await settle();
    expect(statuses(queue.current.jobs)).toEqual(['5:running', '4:running', '3:running', '2:running', '1:succeeded']);
    expect(runs).toHaveLength(5);
  });

  it('refuses a concurrency below 1', () => {
    const { driver } = manualDriver();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(driver, 0)).toThrow(RangeError);
    expect(() => render(driver, Number.NaN)).toThrow('concurrency must be 1 or more');
  });
});
