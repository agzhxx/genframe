import { act, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generationQueueKeyboard } from '@/content/keyboard/generation-queue';
import { useGenerationQueue } from '@/registry/hooks/use-generation-queue';
import type { ReducedMotionSetting } from '@/registry/hooks/use-reduced-motion';
import type { GenerationJob, GenerationResult } from '@/registry/lib/generation-queue-reducer';
import { createSimulatedGenerator } from '@/registry/lib/simulated-generator';
import { describeChanges } from '@/registry/ui/generation-queue/announcements';
import { GenerationQueue, type GenerationQueueProps } from '@/registry/ui/generation-queue/generation-queue';
import { slideToNewPlaces } from '@/registry/ui/generation-queue/slide';
import { recordAnnouncements } from './helpers/aria';
import { testKeyboardMap } from './helpers/keyboard';
import { renderWithReducedMotion } from './helpers/reduced-motion';

const result: GenerationResult = { src: 'ferry.webp', width: 1280, height: 720 };

function job(id: string, number: number, state: Partial<GenerationJob> = {}): GenerationJob {
  return {
    kind: 'image',
    prompt: `Prompt ${String(number)}`,
    ratio: '16:9',
    id,
    number,
    status: 'queued',
    attempt: 1,
    estimate: 4000,
    startedAt: null,
    progress: null,
    progressAt: null,
    result: null,
    error: null,
    refunded: false,
    ...state,
  };
}

const done = (id: string, number: number) => job(id, number, { status: 'succeeded', progress: 1, result });

function renderQueue(props: Partial<GenerationQueueProps>, reducedMotion: ReducedMotionSetting = 'never') {
  const callbacks = { onCancel: vi.fn(), onRetry: vi.fn(), onRemove: vi.fn(), onOpen: vi.fn() };
  const all = { jobs: [], ...callbacks, ...props };
  const view = renderWithReducedMotion(<GenerationQueue {...all} />, reducedMotion);
  return {
    ...view,
    ...callbacks,
    list: () => screen.getByRole('list'),
    update: (next: Partial<GenerationQueueProps>) => {
      view.rerender(<GenerationQueue {...all} {...next} />);
    },
  };
}

function cardOf(name: string) {
  return screen.getByRole('article', { name });
}

function statusOf(name: string) {
  return cardOf(name).querySelector('[data-slot="generation-card-status"]')?.textContent;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(10_000);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('GenerationQueue', () => {
  it('is a list named "Generations", one card per job, in the order given', () => {
    const { list, unmount } = renderQueue({ jobs: [job('b', 2), done('a', 1)] });
    expect(list().getAttribute('aria-label')).toBe('Generations');
    expect(within(list()).getAllByRole('listitem')).toHaveLength(2);
    const names = screen
      .getAllByRole('article')
      .map((card) => document.getElementById(card.getAttribute('aria-labelledby') ?? '')?.textContent);
    expect(names).toEqual(['Image 2', 'Image 1']);
    unmount();
    renderQueue({ jobs: [], 'aria-label': 'Your takes' });
    expect(screen.getByRole('list', { name: 'Your takes' })).toBeTruthy();
  });

  it('passes each card its place in line and the time it has left', () => {
    const jobs = [
      job('c', 3),
      job('b', 2),
      job('a', 1, { status: 'running', startedAt: 0, progress: 0.5, progressAt: 10_000 }),
    ];
    renderQueue({ jobs, concurrency: 1 });
    // "a" has 10 s left at its rate; "b" waits for it, "c" for both.
    expect(statusOf('Image 2')).toBe('Next in line · done in about 15 s');
    expect(statusOf('Image 3')).toBe('2nd in line · done in about 20 s');
    expect(statusOf('Image 1')).toBe('50% · about 10 s left');
  });

  it('counts the time down once a second while jobs are queued or running, and stops after', async () => {
    const jobs = [job('a', 1, { status: 'running', startedAt: 10_000, estimate: 30_000 })];
    const { update } = renderQueue({ jobs });
    expect(statusOf('Image 1')).toBe('Generating · about 30 s left');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(statusOf('Image 1')).toBe('Generating · about 25 s left');
    expect(vi.getTimerCount()).toBe(1);
    update({ jobs: [done('a', 1)] });
    expect(vi.getTimerCount()).toBe(0);
  });

  describe('announcements', () => {
    it('says each change of state politely, never progress, and nothing about the jobs it starts with', async () => {
      const { update } = renderQueue({ jobs: [job('a', 1)] });
      const status = screen.getByRole('status');
      expect(status.textContent).toBe('');
      const announcements = recordAnnouncements(status);
      const steps: GenerationJob[][] = [
        [job('a', 1, { status: 'running', startedAt: 10_000 })],
        [job('a', 1, { status: 'running', startedAt: 10_000, progress: 0.4 })],
        [job('a', 1, { status: 'running', startedAt: 10_000, progress: 0.8 })],
        [done('a', 1)],
        [job('b', 2), done('a', 1)],
        [job('b', 2, { status: 'canceled', refunded: true }), done('a', 1)],
        [job('b', 2, { status: 'canceled', refunded: true })],
        [job('v', 1, { kind: 'video', status: 'running', startedAt: 10_000 }), job('b', 2, { status: 'canceled', refunded: true })],
        [job('v', 1, { kind: 'video', status: 'failed', error: 'Out of memory' }), job('b', 2, { status: 'canceled', refunded: true })],
      ];
      for (const jobs of steps) {
        update({ jobs });
        await act(async () => {
          await Promise.resolve();
        });
      }
      expect(announcements.messages).toEqual([
        'Image 1 is ready',
        'Image 2 queued',
        'Image 2 canceled, refunded',
        'Image 1 removed',
        'Video 1 started',
        'Video 1 failed: Out of memory',
      ]);
      announcements.stop();
    });

    it('reads the same words again when they come again', async () => {
      const { update } = renderQueue({ jobs: [job('a', 1, { status: 'failed', error: 'Busy' })] });
      const announcements = recordAnnouncements(screen.getByRole('status'));
      // Retried, then canceled and retried again before the next render: "queued" twice.
      for (const jobs of [[job('a', 1, { attempt: 2 })], [job('a', 1, { attempt: 3 })]]) {
        update({ jobs });
        await act(async () => {
          await Promise.resolve();
        });
      }
      expect(announcements.messages).toEqual(['Image 1 queued', 'Image 1 queued']);
      announcements.stop();
    });
  });

  describe('describeChanges', () => {
    it('puts several changes in one message, oldest job first', () => {
      const before = [job('b', 2), job('a', 1, { status: 'running', startedAt: 0 })];
      const after = [job('c', 3, { status: 'running', startedAt: 0 }), job('b', 2, { status: 'running', startedAt: 0 }), done('a', 1)];
      expect(describeChanges(before, after)).toBe('Image 1 is ready. Image 3 started');
    });

    it('says a retried job queued or started again', () => {
      const failed = [job('a', 1, { status: 'failed', error: 'Busy' })];
      expect(describeChanges(failed, [job('a', 1, { attempt: 2 })])).toBe('Image 1 queued');
      expect(describeChanges(failed, [job('a', 1, { attempt: 2, status: 'running', startedAt: 0 })])).toBe('Image 1 started');
      expect(describeChanges(failed, [job('a', 1, { status: 'failed', error: null })])).toBe('');
      expect(describeChanges([job('a', 1, { status: 'running' })], [job('a', 1, { status: 'failed', error: null })])).toBe(
        'Image 1 failed: something went wrong',
      );
    });
  });

  describe('focus', () => {
    it('moves to the next card when the one that had it is removed, or the one before, or the list', async () => {
      const user = userEvent.setup();
      const { update } = renderQueue({ jobs: [done('c', 3), done('b', 2), done('a', 1)] });
      await user.click(screen.getByRole('button', { name: 'Remove image 2' }));
      update({ jobs: [done('c', 3), done('a', 1)] });
      expect(document.activeElement).toBe(cardOf('Image 1'));

      await user.click(screen.getByRole('button', { name: 'Remove image 1' }));
      update({ jobs: [done('c', 3)] });
      expect(document.activeElement).toBe(cardOf('Image 3'));

      await user.click(screen.getByRole('button', { name: 'Remove image 3' }));
      update({ jobs: [] });
      expect(document.activeElement).toBe(screen.getByRole('list'));
    });

    it('stays where it is when a card it isn’t in goes', async () => {
      const user = userEvent.setup();
      const { update } = renderQueue({ jobs: [done('b', 2), done('a', 1)] });
      const open = screen.getByRole('button', { name: 'Open image 2' });
      await user.click(open);
      update({ jobs: [done('b', 2)] });
      expect(document.activeElement).toBe(open);
    });

    it('stays on a card that’s still there when its button goes', async () => {
      const user = userEvent.setup();
      const { update } = renderQueue({ jobs: [job('a', 1)] });
      await user.click(screen.getByRole('button', { name: 'Cancel image 1' }));
      update({ jobs: [job('a', 1, { status: 'canceled', refunded: true })] });
      expect(document.activeElement).toBe(cardOf('Image 1'));
    });
  });

  describe('motion', () => {
    // jsdom lays nothing out: each item's offset is its place in a column of 100 px rows.
    function layOutInRows() {
      vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
        return this.parentElement ? [...this.parentElement.children].indexOf(this) * 100 : 0;
      });
      vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockReturnValue(0);
    }

    // The transforms set on the list's items, in order (the progress bars' are left out).
    function recordTransforms() {
      const style = Object.getPrototypeOf(document.body.style) as object;
      const setter = vi.spyOn(style as { transform: string }, 'transform', 'set');
      return () => {
        const items = new Set<unknown>([...document.querySelectorAll('li')].map((item) => item.style));
        return setter.mock.calls.filter((_, index) => items.has(setter.mock.contexts[index])).map(([value]) => value);
      };
    }

    it('slides the cards to their new places when one joins: from where they were, by a transform', () => {
      layOutInRows();
      const { update } = renderQueue({ jobs: [done('b', 2), done('a', 1)] });
      const transforms = recordTransforms();
      update({ jobs: [job('c', 3), done('b', 2), done('a', 1)] });
      // Each card moved down a row: put back where it was, then let go.
      expect(transforms()).toEqual(['translate(0px, -100px)', 'translate(0px, -100px)', '', '']);
      const items = screen.getAllByRole('listitem');
      expect(items[1]?.className).toContain('transition-[transform,translate,opacity] duration-(--genframe-duration-base) ease-(--genframe-ease-out)');
    });

    it('lets a new card rise into place, but not the ones it started with', () => {
      const { update } = renderQueue({ jobs: [done('a', 1)] });
      update({ jobs: [job('b', 2), done('a', 1)] });
      const [joined, first] = screen.getAllByRole('listitem');
      expect(joined?.className).toContain('starting:translate-y-2 starting:opacity-0');
      expect(first?.className).not.toContain('starting:');
    });

    it('slides from where a card shows, while it’s still sliding', () => {
      layOutInRows();
      const { update } = renderQueue({ jobs: [done('b', 2), done('a', 1)] });
      // "a" is halfway back up from a slide down: it shows 50 px above its place.
      const a = screen.getAllByRole('listitem')[1];
      if (a) a.style.transform = 'matrix(1, 0, 0, 1, 0, -50)';
      const transforms = recordTransforms();
      update({ jobs: [job('c', 3), done('b', 2), done('a', 1)] });
      expect(transforms()).toEqual(['translate(0px, -100px)', 'translate(0px, -150px)', '', '']);
    });

    it('slides nothing when the order stays, as when a job makes progress', () => {
      layOutInRows();
      const { update } = renderQueue({ jobs: [job('a', 1, { status: 'running', startedAt: 0, progress: 0.2 })] });
      const transforms = recordTransforms();
      update({ jobs: [job('a', 1, { status: 'running', startedAt: 0, progress: 0.4 })] });
      expect(transforms()).toEqual([]);
    });

    it('moves the cards at once with reduced motion; a new one only fades in', () => {
      layOutInRows();
      const { container, update } = renderQueue({ jobs: [done('b', 2), done('a', 1)] }, 'always');
      const transforms = recordTransforms();
      update({ jobs: [job('c', 3), done('b', 2), done('a', 1)] });
      expect(transforms()).toEqual([]);
      expect(container.querySelector('[data-slot="generation-queue"]')?.getAttribute('data-motion')).toBe('reduce');
      expect(screen.getAllByRole('listitem')[0]?.className).toContain('in-data-[motion=reduce]:transition-opacity');
    });

    it('reads a 3D matrix too, and leaves cards that didn’t move alone', () => {
      const element = document.createElement('li');
      document.body.append(element);
      element.style.transform = 'matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 30, -20, 0, 1)';
      const items = new Map([['a', element]]);
      const places = slideToNewPlaces(items, new Map([['a', { x: 0, y: 0 }]]), true, null);
      expect(places.get('a')).toEqual({ x: 0, y: 0 });
      expect(element.style.transform).toBe('');
      element.style.transform = '';
      const transforms = recordTransforms();
      slideToNewPlaces(items, new Map([['a', { x: 0, y: 0 }]]), true, null);
      expect(transforms()).toEqual([]);
      element.remove();
    });
  });

  it('hands the job to each callback', async () => {
    const user = userEvent.setup();
    const jobs = [job('b', 2), done('a', 1)];
    const { onCancel, onOpen } = renderQueue({ jobs });
    await user.click(screen.getByRole('button', { name: 'Cancel image 2' }));
    await user.click(screen.getByRole('button', { name: 'Open image 1' }));
    expect(onCancel).toHaveBeenCalledWith(jobs[0]);
    expect(onOpen).toHaveBeenCalledWith(jobs[1]);
  });

  it('shows useGenerationQueue’s jobs from submit to result, on the simulated generator', async () => {
    const driver = createSimulatedGenerator({ result: () => result, durations: { image: [2000, 2000] } });
    const { result: queue } = renderHook(() => useGenerationQueue({ driver, concurrency: 1 }));
    const view = renderQueue({ jobs: queue.current.jobs, concurrency: 1 });
    const announcements = recordAnnouncements(screen.getByRole('status'));
    act(() => {
      queue.current.submit({ kind: 'image', prompt: 'A red car', ratio: '16:9' });
      queue.current.submit({ kind: 'image', prompt: 'A blue car', ratio: '1:1' });
    });
    view.update({ jobs: queue.current.jobs, concurrency: 1 });
    expect(statusOf('Image 2')).toBe('Next in line · done in about 4 s');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    view.update({ jobs: queue.current.jobs, concurrency: 1 });
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    view.update({ jobs: queue.current.jobs, concurrency: 1 });
    expect(cardOf('Image 1').dataset.status).toBe('succeeded');
    expect(cardOf('Image 2').dataset.status).toBe('running');
    await act(async () => {
      await Promise.resolve();
    });
    expect(announcements.messages).toEqual(['Image 1 started. Image 2 queued', 'Image 1 is ready']);
    announcements.stop();
  });

  describe('keyboard', () => {
    testKeyboardMap(generationQueueKeyboard, {
      setup: () => {
        const view = renderQueue({ jobs: [done('b', 2), done('a', 1)] });
        return { ...view, target: screen.getByRole('button', { name: 'Remove image 2' }) };
      },
      expectations: {
        press: ({ onRemove }) => {
          expect(onRemove).toHaveBeenCalledWith(done('b', 2));
        },
        next: () => {
          expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open image 1' }));
        },
      },
    });
  });
});
