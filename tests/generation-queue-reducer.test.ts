// @vitest-environment node
// The generation queue's reducer and selectors (spec section 5): every event from every state,
// including the late ones (progress after a cancel, a success after a retry). These tests were
// written before the reducer, and use nothing but its exported API, so the reducer can be deleted
// and written again against them (registry/lib/generation-queue-reducer.ts).
//
// The rules they pin down:
// - The state is the list of jobs, newest first.
// - Reports from a run of the driver (start, progress, succeed, fail) name the job and the
//   attempt; commands (cancel, retry, remove) name the job.
// - An event about a job that's gone, a report from another attempt than the job's current one,
//   or an event that doesn't apply to the job's state changes nothing: the reducer returns the
//   very same array, so React skips the render.
import { describe, expect, it } from 'vitest';
import {
  generationQueueReducer as reduce,
  queuePosition,
  timeLeft,
  type GenerationEvent,
  type GenerationJob,
  type GenerationRequest,
  type GenerationResult,
  type GenerationStatus,
} from '@/registry/lib/generation-queue-reducer';

type Jobs = readonly GenerationJob[];

const request: GenerationRequest = { kind: 'image', prompt: 'A red car on a mountain road', ratio: '16:9' };
const result: GenerationResult = { src: 'car.webp', width: 1280, height: 720, thumbhash: 'YJqGPQw7sFlslqhFafSE+Q6oJ1h2iHB2Rw==' };

// Events about job "a" at attempt 1 unless told otherwise.
function submit(id = 'a', number = 1, estimate?: number): GenerationEvent {
  return { type: 'submit', id, number, request, ...(estimate === undefined ? {} : { estimate }) };
}
function start(attempt = 1, at = 1000, id = 'a'): GenerationEvent {
  return { type: 'start', id, attempt, at };
}
function progress(value: number | null, attempt = 1, at = 2000, id = 'a'): GenerationEvent {
  return { type: 'progress', id, attempt, progress: value, at };
}
function succeed(attempt = 1, id = 'a'): GenerationEvent {
  return { type: 'succeed', id, attempt, result };
}
function fail(attempt = 1, id = 'a', error = 'Out of memory'): GenerationEvent {
  return { type: 'fail', id, attempt, error };
}
function cancel(id = 'a'): GenerationEvent {
  return { type: 'cancel', id };
}
function retry(id = 'a'): GenerationEvent {
  return { type: 'retry', id };
}
function remove(id = 'a'): GenerationEvent {
  return { type: 'remove', id };
}

// Frozen all the way down: a reducer that changed its input would throw.
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** The queue after these events, from an empty one. */
function run(...events: GenerationEvent[]): Jobs {
  return events.reduce<Jobs>((jobs, event) => deepFreeze(reduce(jobs, event)), deepFreeze([]));
}

function jobIn(jobs: Jobs, id = 'a') {
  const job = jobs.find((entry) => entry.id === id);
  if (!job) throw new Error(`No job "${id}"`);
  return job;
}

// Job "a" in each state, the way the hook gets it there.
const states: Record<GenerationStatus, () => Jobs> = {
  queued: () => run(submit()),
  running: () => run(submit(), start()),
  succeeded: () => run(submit(), start(), succeed()),
  failed: () => run(submit(), start(), fail()),
  canceled: () => run(submit(), start(), cancel()),
};
const statuses = Object.keys(states) as GenerationStatus[];

// One of each event about job "a", attempt 1.
const events = {
  submit: submit('a', 2),
  start: start(1, 5000),
  progress: progress(0.5, 1, 6000),
  succeed: succeed(),
  fail: fail(1, 'a', 'Timed out'),
  cancel: cancel(),
  retry: retry(),
  remove: remove(),
} satisfies Record<GenerationEvent['type'], GenerationEvent>;
type EventName = keyof typeof events;

/** What an event does in a state: nothing, or a change that the function checks. */
type Outcome = 'ignored' | ((after: Jobs, before: Jobs) => void);

const matrix: Record<EventName, Record<GenerationStatus, Outcome>> = {
  // A job's id is taken for good: a second submit with it adds nothing.
  submit: { queued: 'ignored', running: 'ignored', succeeded: 'ignored', failed: 'ignored', canceled: 'ignored' },
  start: {
    queued: (after) => {
      expect(jobIn(after)).toMatchObject({ status: 'running', attempt: 1, startedAt: 5000, progress: null });
    },
    running: 'ignored',
    succeeded: 'ignored',
    failed: 'ignored',
    canceled: 'ignored',
  },
  progress: {
    queued: 'ignored',
    running: (after) => {
      expect(jobIn(after)).toMatchObject({ status: 'running', progress: 0.5, progressAt: 6000 });
    },
    succeeded: 'ignored',
    failed: 'ignored',
    canceled: 'ignored',
  },
  succeed: {
    queued: 'ignored',
    running: (after) => {
      expect(jobIn(after)).toMatchObject({ status: 'succeeded', result, progress: 1, error: null });
    },
    succeeded: 'ignored',
    failed: 'ignored',
    canceled: 'ignored',
  },
  fail: {
    queued: 'ignored',
    running: (after) => {
      expect(jobIn(after)).toMatchObject({ status: 'failed', error: 'Timed out', result: null });
    },
    succeeded: 'ignored',
    failed: 'ignored',
    canceled: 'ignored',
  },
  cancel: {
    // Canceled before it started: nothing was spent, so it's refunded.
    queued: (after) => {
      expect(jobIn(after)).toMatchObject({ status: 'canceled', refunded: true });
    },
    // Once it runs, its cost is spent.
    running: (after) => {
      expect(jobIn(after)).toMatchObject({ status: 'canceled', refunded: false });
    },
    succeeded: 'ignored',
    failed: 'ignored',
    canceled: 'ignored',
  },
  retry: {
    queued: 'ignored',
    running: 'ignored',
    succeeded: 'ignored',
    failed: (after, before) => {
      expect(jobIn(after)).toEqual({
        ...jobIn(before),
        status: 'queued',
        attempt: 2,
        startedAt: null,
        progress: null,
        progressAt: null,
        error: null,
      });
    },
    canceled: (after, before) => {
      expect(jobIn(after)).toEqual({
        ...jobIn(before),
        status: 'queued',
        attempt: 2,
        startedAt: null,
        progress: null,
        progressAt: null,
        refunded: false,
      });
    },
  },
  remove: {
    queued: (after) => {
      expect(after).toEqual([]);
    },
    running: (after) => {
      expect(after).toEqual([]);
    },
    succeeded: (after) => {
      expect(after).toEqual([]);
    },
    failed: (after) => {
      expect(after).toEqual([]);
    },
    canceled: (after) => {
      expect(after).toEqual([]);
    },
  },
};

describe('generationQueueReducer', () => {
  describe('every event from every state', () => {
    for (const name of Object.keys(events) as EventName[]) {
      for (const status of statuses) {
        const outcome = matrix[name][status];
        it(`${name} on a ${status} job: ${outcome === 'ignored' ? 'changes nothing' : 'applies'}`, () => {
          const before = states[status]();
          const after = reduce(before, events[name]);
          if (outcome === 'ignored') expect(after).toBe(before);
          else {
            expect(after).not.toBe(before);
            outcome(after, before);
          }
        });
      }
    }

    // A job that isn't there: never submitted, or removed. Only a submit can bring it in.
    for (const name of Object.keys(events) as EventName[]) {
      if (name === 'submit') continue;
      it(`${name} for a job that isn't there: changes nothing`, () => {
        const before = run(submit('b'));
        expect(reduce(before, events[name])).toBe(before);
        const removed = run(submit(), start(), remove());
        expect(reduce(removed, events[name])).toBe(removed);
      });
    }
  });

  describe('reports from another attempt change nothing, in every state', () => {
    const reports = {
      start: start(2, 5000),
      progress: progress(0.5, 2, 6000),
      succeed: succeed(2),
      fail: fail(2),
    } satisfies Partial<Record<EventName, GenerationEvent>>;
    for (const [name, report] of Object.entries(reports)) {
      for (const status of statuses) {
        it(`${name} for attempt 2 of a ${status} job at attempt 1`, () => {
          const before = states[status]();
          expect(reduce(before, report)).toBe(before);
        });
      }
    }
  });

  describe('late events', () => {
    it('ignores progress that arrives after a cancel', () => {
      const canceled = run(submit(), start(), progress(0.3), cancel());
      expect(reduce(canceled, progress(0.6, 1, 3000))).toBe(canceled);
      expect(jobIn(canceled)).toMatchObject({ status: 'canceled', progress: 0.3 });
    });

    it('ignores a success or a failure that arrives after a cancel', () => {
      const canceled = run(submit(), start(), cancel());
      expect(reduce(canceled, succeed())).toBe(canceled);
      expect(reduce(canceled, fail())).toBe(canceled);
    });

    it('ignores the old attempt’s success after a retry, while the new one waits and while it runs', () => {
      const waiting = run(submit(), start(), fail(), retry());
      expect(reduce(waiting, succeed(1))).toBe(waiting);
      const running = reduce(waiting, start(2, 4000));
      expect(reduce(running, succeed(1))).toBe(running);
      expect(jobIn(reduce(running, succeed(2)))).toMatchObject({ status: 'succeeded', attempt: 2, result });
    });

    it('ignores the old attempt’s progress, failure and start after a retry', () => {
      const running = run(submit(), start(), cancel(), retry(), start(2, 4000), progress(0.2, 2, 4500));
      expect(reduce(running, progress(0.9, 1, 4600))).toBe(running);
      expect(reduce(running, fail(1))).toBe(running);
      const waiting = run(submit(), start(), cancel(), retry());
      expect(reduce(waiting, start(1, 4000))).toBe(waiting);
    });

    it('takes only the first outcome of a run', () => {
      const succeeded = run(submit(), start(), succeed());
      expect(reduce(succeeded, fail())).toBe(succeeded);
      const failed = run(submit(), start(), fail());
      expect(reduce(failed, succeed())).toBe(failed);
    });

    it('ignores everything about a job once it is removed, and keeps the others', () => {
      const jobs = run(submit('a', 1), submit('b', 2), start(1, 1000, 'a'), remove('a'));
      for (const event of [start(), progress(0.5), succeed(), fail(), cancel(), retry(), remove()]) {
        expect(reduce(jobs, event)).toBe(jobs);
      }
      expect(jobs.map((job) => job.id)).toEqual(['b']);
    });
  });

  describe('submit', () => {
    it('queues a job at attempt 1, with nothing run yet', () => {
      expect(run(submit('a', 3))).toEqual([
        {
          ...request,
          id: 'a',
          number: 3,
          status: 'queued',
          attempt: 1,
          estimate: null,
          startedAt: null,
          progress: null,
          progressAt: null,
          result: null,
          error: null,
          refunded: false,
        },
      ]);
    });

    it('puts new jobs first', () => {
      expect(run(submit('a', 1), submit('b', 2), submit('c', 3)).map((job) => job.id)).toEqual(['c', 'b', 'a']);
    });

    it('keeps the driver’s estimate of how long a run takes', () => {
      expect(jobIn(run(submit('a', 1, 8000))).estimate).toBe(8000);
    });

    it('carries the request’s own fields, for the driver', () => {
      const event: GenerationEvent<GenerationRequest & { model: string }> = {
        type: 'submit',
        id: 'a',
        number: 1,
        request: { ...request, model: 'kling-2.5' },
      };
      expect(reduce([], event)[0]).toMatchObject({ model: 'kling-2.5', prompt: request.prompt });
    });
  });

  describe('start', () => {
    it('records when the attempt started, and has no progress yet', () => {
      expect(jobIn(run(submit(), start(1, 1234)))).toMatchObject({ status: 'running', startedAt: 1234, progress: null, progressAt: null });
    });
  });

  describe('progress', () => {
    it('runs from 0 to 1: numbers outside are clamped', () => {
      expect(jobIn(run(submit(), start(), progress(1.4))).progress).toBe(1);
      expect(jobIn(run(submit(), start(), progress(-0.2))).progress).toBe(0);
    });

    it('never goes backwards', () => {
      const jobs = run(submit(), start(), progress(0.6, 1, 2000));
      expect(reduce(jobs, progress(0.4, 1, 3000))).toBe(jobs);
      expect(reduce(jobs, progress(0.6, 1, 3000))).toBe(jobs);
      expect(jobIn(reduce(jobs, progress(0.7, 1, 3000)))).toMatchObject({ progress: 0.7, progressAt: 3000 });
    });

    it('can be unknown: null leaves it unknown, or keeps what is known', () => {
      const unknown = run(submit(), start());
      expect(jobIn(unknown).progress).toBeNull();
      expect(reduce(unknown, progress(null))).toBe(unknown);
      const known = run(submit(), start(), progress(0.4));
      expect(reduce(known, progress(null, 1, 3000))).toBe(known);
    });

    it('ignores numbers that aren’t finite', () => {
      const jobs = run(submit(), start(), progress(0.4));
      expect(reduce(jobs, progress(Number.NaN, 1, 3000))).toBe(jobs);
      expect(reduce(jobs, progress(Number.POSITIVE_INFINITY, 1, 3000))).toBe(jobs);
    });
  });

  describe('cancel', () => {
    it('refunds a job canceled before it started, not one canceled while it ran', () => {
      expect(jobIn(run(submit(), cancel()))).toMatchObject({ status: 'canceled', refunded: true });
      expect(jobIn(run(submit(), start(), progress(0.3), cancel()))).toMatchObject({
        status: 'canceled',
        refunded: false,
        progress: 0.3,
      });
    });
  });

  describe('retry', () => {
    it('counts the attempts, and keeps the job where it is in the list', () => {
      const jobs = run(submit('a', 1), submit('b', 2), submit('c', 3), start(1, 1000, 'b'), fail(1, 'b'), retry('b'));
      expect(jobs.map((job) => job.id)).toEqual(['c', 'b', 'a']);
      expect(jobIn(jobs, 'b')).toMatchObject({ status: 'queued', attempt: 2, error: null });
      const again = run(submit(), start(), fail(), retry(), start(2), fail(2), retry());
      expect(jobIn(again).attempt).toBe(3);
    });

    it('keeps the estimate for the next attempt', () => {
      expect(jobIn(run(submit('a', 1, 8000), start(), fail(), retry())).estimate).toBe(8000);
    });
  });

  describe('remove', () => {
    it('takes the job out and leaves the others in order', () => {
      const jobs = run(submit('a', 1), submit('b', 2), submit('c', 3), remove('b'));
      expect(jobs.map((job) => job.id)).toEqual(['c', 'a']);
    });
  });

  it('changes only the job an event is about: the others stay the same objects', () => {
    const before = run(submit('a', 1), submit('b', 2));
    const after = reduce(before, start(1, 1000, 'a'));
    expect(after[0]).toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
  });
});

describe('queuePosition', () => {
  it('numbers the queued jobs from 1, in the order they were submitted', () => {
    const jobs = run(submit('a', 1), submit('b', 2), submit('c', 3));
    expect(['a', 'b', 'c'].map((id) => queuePosition(jobs, id))).toEqual([1, 2, 3]);
  });

  it('counts only the jobs that are queued', () => {
    const jobs = run(submit('a', 1), submit('b', 2), submit('c', 3), submit('d', 4), start(1, 1000, 'a'), cancel('c'));
    expect(['a', 'b', 'c', 'd'].map((id) => queuePosition(jobs, id))).toEqual([null, 1, null, 2]);
  });

  it('keeps a retried job’s place in the line', () => {
    const jobs = run(submit('a', 1), start(1, 1000, 'a'), fail(1, 'a'), submit('b', 2), submit('c', 3), retry('a'));
    expect(['a', 'b', 'c'].map((id) => queuePosition(jobs, id))).toEqual([1, 2, 3]);
  });

  it('has no position for a job that isn’t there', () => {
    expect(queuePosition(run(submit()), 'b')).toBeNull();
  });
});

describe('timeLeft', () => {
  const clock = (now: number, concurrency = 1) => ({ now, concurrency });

  describe('for a running job', () => {
    it('goes by its progress rate: 25% in 2 s leaves 6 s', () => {
      const jobs = run(submit(), start(1, 1000), progress(0.25, 1, 3000));
      expect(timeLeft(jobs, 'a', clock(3000))).toBe(6000);
      expect(timeLeft(jobs, 'a', clock(4500))).toBe(4500);
    });

    it('counts down the driver’s estimate while its progress is unknown, or 0', () => {
      const jobs = run(submit('a', 1, 8000), start(1, 1000));
      expect(timeLeft(jobs, 'a', clock(4000))).toBe(5000);
      const stalled = run(submit('a', 1, 8000), start(1, 1000), progress(0, 1, 2000));
      expect(timeLeft(stalled, 'a', clock(4000))).toBe(5000);
    });

    it('prefers the progress rate to the estimate', () => {
      const jobs = run(submit('a', 1, 60_000), start(1, 0), progress(0.5, 1, 5000));
      expect(timeLeft(jobs, 'a', clock(5000))).toBe(5000);
    });

    it('never goes below 0', () => {
      const overdue = run(submit('a', 1, 8000), start(1, 1000));
      expect(timeLeft(overdue, 'a', clock(20_000))).toBe(0);
      const finishing = run(submit(), start(1, 1000), progress(1, 1, 3000));
      expect(timeLeft(finishing, 'a', clock(3000))).toBe(0);
      const late = run(submit(), start(1, 1000), progress(0.5, 1, 3000));
      expect(timeLeft(late, 'a', clock(10_000))).toBe(0);
    });

    it('counts a clock that reads earlier than the start as no time passed', () => {
      const jobs = run(submit('a', 1, 8000), start(1, 5000));
      expect(timeLeft(jobs, 'a', clock(4000))).toBe(8000);
    });

    it('has nothing to go by without progress or an estimate', () => {
      expect(timeLeft(run(submit(), start(1, 1000)), 'a', clock(2000))).toBeNull();
    });
  });

  describe('for a queued job', () => {
    // "a" runs with 5 s to go (50% in 5 s); "b" and "c" wait behind it, 4 s each.
    const jobs = run(
      submit('a', 1),
      submit('b', 2, 4000),
      submit('c', 3, 4000),
      start(1, 0, 'a'),
      progress(0.5, 1, 5000, 'a'),
    );

    it('waits for the jobs ahead of it, one at a time', () => {
      expect(timeLeft(jobs, 'b', clock(5000, 1))).toBe(9000);
      expect(timeLeft(jobs, 'c', clock(5000, 1))).toBe(13_000);
    });

    it('starts as soon as a slot is free, with more at once', () => {
      expect(timeLeft(run(submit('a', 1, 4000)), 'a', clock(0))).toBe(4000);
      expect(timeLeft(jobs, 'b', clock(5000, 2))).toBe(4000);
      expect(timeLeft(jobs, 'c', clock(5000, 2))).toBe(8000);
      expect(timeLeft(jobs, 'c', clock(5000, Number.POSITIVE_INFINITY))).toBe(4000);
    });

    it('waits for every running job past the limit, when the limit went down', () => {
      const crowded = run(
        submit('a', 1, 3000),
        submit('b', 2, 5000),
        submit('c', 3, 2000),
        start(1, 0, 'a'),
        start(1, 0, 'b'),
      );
      expect(timeLeft(crowded, 'c', clock(0, 1))).toBe(7000);
    });

    it('has no time when it, or a job ahead of it, has nothing to go by', () => {
      const unknownAhead = run(submit('a', 1), submit('b', 2, 4000), start(1, 0, 'a'));
      expect(timeLeft(unknownAhead, 'b', clock(1000))).toBeNull();
      const unknownSelf = run(submit('a', 1, 4000), submit('b', 2));
      expect(timeLeft(unknownSelf, 'b', clock(0))).toBeNull();
    });
  });

  it('has no time for finished jobs, or a job that isn’t there', () => {
    for (const status of ['succeeded', 'failed', 'canceled'] as const) {
      expect(timeLeft(states[status](), 'a', clock(9000)), status).toBeNull();
    }
    expect(timeLeft(run(submit()), 'b', clock(0))).toBeNull();
  });
});
