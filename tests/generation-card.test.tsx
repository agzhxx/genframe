import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { generationCardKeyboard } from '@/content/keyboard/generation-card';
import type { ReducedMotionSetting } from '@/registry/hooks/use-reduced-motion';
import type { GenerationJob, GenerationResult } from '@/registry/lib/generation-queue-reducer';
import { GenerationCard, jobName, type GenerationCardProps } from '@/registry/ui/generation-card/generation-card';
import { expectAriaState, expectRole } from './helpers/aria';
import { testKeyboardMap } from './helpers/keyboard';
import { renderWithReducedMotion } from './helpers/reduced-motion';

const result: GenerationResult = {
  src: 'ferry.webp',
  width: 1696,
  height: 960,
  thumbhash: 'ntcJJIZph3iNd3hwd3hncHMHNw==',
  alt: 'A cable ferry crossing a wide river at blue hour',
};

function job(state: Partial<GenerationJob> = {}): GenerationJob {
  return {
    kind: 'image',
    prompt: 'A cable ferry crossing a wide river, at blue hour',
    ratio: '16:9',
    id: 'a',
    number: 3,
    status: 'queued',
    attempt: 1,
    estimate: 8000,
    startedAt: null,
    progress: null,
    progressAt: null,
    result: null,
    error: null,
    refunded: false,
    ...state,
  };
}

const running = (progress: number | null) => job({ status: 'running', startedAt: 0, progress });
const succeeded = job({ status: 'succeeded', progress: 1, result });
const failed = job({ status: 'failed', error: 'Out of memory' });
const canceled = job({ status: 'canceled', refunded: true });

function renderCard(props: Partial<GenerationCardProps>, reducedMotion: ReducedMotionSetting = 'never') {
  const callbacks = { onCancel: vi.fn(), onRetry: vi.fn(), onRemove: vi.fn(), onOpen: vi.fn() };
  const all = { job: job(), ...callbacks, ...props };
  const view = renderWithReducedMotion(<GenerationCard {...all} />, reducedMotion);
  const card = screen.getByRole('article');
  const media = view.container.querySelector<HTMLElement>('[data-slot="generation-card-media"]');
  if (!media) throw new Error('No media');
  return {
    ...view,
    ...callbacks,
    card,
    media,
    status: () => view.container.querySelector('[data-slot="generation-card-status"]')?.textContent,
    rerenderCard: (next: Partial<GenerationCardProps>) => {
      view.rerender(<GenerationCard {...all} {...next} />);
    },
  };
}

function buttonNames() {
  return screen.queryAllByRole('button').map((button) => button.getAttribute('aria-label'));
}

describe('GenerationCard', () => {
  it('is an article named after its job, by kind and number, and described by its state', () => {
    const { card, rerenderCard } = renderCard({ position: 2, timeLeft: 40_000 });
    expectRole(card, 'article', 'Image 3');
    expect(card).toHaveProperty('tabIndex', -1);
    const description = document.getElementById(card.getAttribute('aria-describedby') ?? '');
    expect(description?.textContent).toBe('2nd in line · done in about 40 s');
    rerenderCard({ job: job({ kind: 'video', number: 1 }) });
    expectRole(card, 'article', 'Video 1');
    expect(jobName({ kind: 'video', number: 12 })).toBe('Video 12');
  });

  it('shows the prompt and the requested ratio', () => {
    renderCard({});
    expect(screen.getByText('A cable ferry crossing a wide river, at blue hour')).toBeTruthy();
    expect(screen.getByText('16:9')).toBeTruthy();
  });

  describe('queued', () => {
    it('says its place in line and when it will be done', () => {
      const { status, rerenderCard } = renderCard({ position: 1, timeLeft: 7200 });
      expect(status()).toBe('Next in line · done in about 7 s');
      const places = [2, 3, 4, 11, 12, 13, 21, 22, 23, 101].map((position) => {
        rerenderCard({ position, timeLeft: null });
        return status();
      });
      expect(places).toEqual(
        ['2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st'].map((place) => `${place} in line`),
      );
      rerenderCard({ position: null, timeLeft: null });
      expect(status()).toBe('Queued');
    });

    it('can be canceled', async () => {
      const user = userEvent.setup();
      const { onCancel } = renderCard({});
      expect(buttonNames()).toEqual(['Cancel image 3']);
      await user.click(screen.getByRole('button', { name: 'Cancel image 3' }));
      expect(onCancel).toHaveBeenCalledWith(job());
    });
  });

  describe('running', () => {
    it('has a progress bar named after the job, with its value and time left in words', () => {
      const { container, status } = renderCard({ job: running(0.45), timeLeft: 12_000 });
      const bar = screen.getByRole('progressbar');
      expectRole(bar, 'progressbar', 'Image 3');
      expectAriaState(bar, { valuemin: 0, valuemax: 100, valuenow: 45, valuetext: '45%, about 10 seconds left' });
      // The progress bar says it to screen readers; the same words are on screen.
      expect(status()).toBe('45% · about 10 s left');
      expect(container.querySelector('[data-slot="generation-card-status"]')?.getAttribute('aria-hidden')).toBe('true');
      expect(buttonNames()).toEqual(['Cancel image 3']);
    });

    it('words the time left in seconds, steps of 5 and minutes', () => {
      const { rerenderCard } = renderCard({ job: running(0.5) });
      const texts = [0, 400, 7600, 12_400, 57_600, 90_000, 125_000].map((timeLeft) => {
        rerenderCard({ job: running(0.5), timeLeft });
        return screen.getByRole('progressbar').getAttribute('aria-valuetext');
      });
      expect(texts).toEqual([
        '50%, almost done',
        '50%, about 1 second left',
        '50%, about 8 seconds left',
        '50%, about 10 seconds left',
        '50%, about 1 minute left',
        '50%, about 2 minutes left',
        '50%, about 2 minutes left',
      ]);
    });

    it('moves its bar smoothly to each report, or jumps with reduced motion', () => {
      const { container, unmount } = renderCard({ job: running(0.45) });
      const fill = screen.getByRole('progressbar').firstElementChild as HTMLElement;
      expect(fill.style.transform).toBe('translateX(-55%)');
      expect(fill.className).toContain('transition-transform duration-(--genframe-duration-base)');
      expect(fill.className).toContain('in-data-[motion=reduce]:transition-none');
      expect(container.querySelector('[data-slot="generation-card"]')?.hasAttribute('data-motion')).toBe(false);
      unmount();
      renderCard({ job: running(0.45) }, 'always');
      expect(screen.getByRole('article').dataset.motion).toBe('reduce');
    });

    it('pulses calmly while its progress is unknown, and keeps still with reduced motion', () => {
      const { container, unmount } = renderCard({ job: running(null), timeLeft: 21_000 });
      const bar = screen.getByRole('progressbar');
      expectAriaState(bar, { valuenow: null, valuetext: 'Generating, about 20 seconds left' });
      const shimmer = container.querySelector('[data-slot="generation-card-shimmer"]');
      expect(shimmer?.className).toContain('animate-pulse');
      expect(shimmer?.className).toContain('in-data-[motion=reduce]:animate-none');
      unmount();
      const reduced = renderCard({ job: running(null) }, 'always');
      expect(reduced.card.dataset.motion).toBe('reduce');
      expect(screen.getByRole('progressbar').getAttribute('aria-valuetext')).toBe('Generating');
    });
  });

  describe('succeeded', () => {
    it('shows its result over its ThumbHash, and can be opened or removed', async () => {
      const user = userEvent.setup();
      const { media, onOpen, onRemove, status } = renderCard({ job: succeeded });
      expectRole(within(media).getByRole('img'), 'img', result.alt);
      expect(within(media).getByRole('img').getAttribute('src')).toBe('ferry.webp');
      expect(media.querySelector<HTMLElement>('[data-slot="denoise-reveal"]')?.style.backgroundImage).toMatch(
        /^url\("data:image\/png;base64,/,
      );
      expect(status()).toBe('Ready');
      expect(buttonNames()).toEqual(['Open image 3', 'Remove image 3']);
      await user.click(screen.getByRole('button', { name: 'Open image 3' }));
      expect(onOpen).toHaveBeenCalledWith(succeeded);
      await user.click(screen.getByRole('button', { name: 'Remove image 3' }));
      expect(onRemove).toHaveBeenCalledWith(succeeded);
    });

    it('takes its alt text from the prompt when the result has none', () => {
      const { media } = renderCard({ job: job({ status: 'succeeded', result: { ...result, alt: undefined } }) });
      expectRole(within(media).getByRole('img'), 'img', 'A cable ferry crossing a wide river, at blue hour');
    });

    it('reveals a result that arrives while it’s on screen, and just shows one that was there', () => {
      const { media, rerenderCard, unmount } = renderCard({ job: running(0.9) });
      rerenderCard({ job: succeeded });
      expect(media.querySelector<HTMLElement>('[data-slot="denoise-reveal"]')?.dataset.state).toBe('loading');
      unmount();
      const later = renderCard({ job: succeeded });
      expect(later.media.querySelector<HTMLElement>('[data-slot="denoise-reveal"]')?.dataset.state).toBe('revealed');
    });
  });

  describe('failed', () => {
    it('says why, and can be retried or removed', async () => {
      const user = userEvent.setup();
      const { container, onRetry, status } = renderCard({ job: failed });
      expect(status()).toBe('Failed: Out of memory');
      expect(container.querySelector('[data-slot="generation-card-status"]')?.className).toContain('text-destructive');
      expect(buttonNames()).toEqual(['Retry image 3', 'Remove image 3']);
      await user.click(screen.getByRole('button', { name: 'Retry image 3' }));
      expect(onRetry).toHaveBeenCalledWith(failed);
    });
  });

  describe('canceled', () => {
    it('says when it was refunded, and can be retried or removed', () => {
      const { status, rerenderCard } = renderCard({ job: canceled });
      expect(status()).toBe('Canceled · refunded');
      expect(buttonNames()).toEqual(['Retry image 3', 'Remove image 3']);
      rerenderCard({ job: job({ status: 'canceled', refunded: false }) });
      expect(status()).toBe('Canceled');
    });
  });

  it('has only the buttons it has callbacks for', () => {
    const { rerender, container } = renderWithReducedMotion(<GenerationCard job={succeeded} onOpen={vi.fn()} />, 'never');
    expect(buttonNames()).toEqual(['Open image 3']);
    rerender(<GenerationCard job={running(0.5)} onRetry={vi.fn()} onRemove={vi.fn()} />);
    expect(buttonNames()).toEqual([]);
    expect(container.querySelector('[data-slot="generation-card-actions"]')).toBeNull();
  });

  it('keeps the requested shape from the first state to the result, so nothing jumps', () => {
    const { media, rerenderCard } = renderCard({});
    const shapes = [job(), running(0.4), succeeded].map((state) => {
      rerenderCard({ job: state });
      return [media.style.aspectRatio, media.style.maxWidth];
    });
    expect(shapes).toEqual(Array.from({ length: 3 }, () => ['16 / 9', '32rem']));
    // A portrait narrows to stay 18rem tall at most.
    rerenderCard({ job: job({ ratio: '9:16' }) });
    expect([media.style.aspectRatio, media.style.maxWidth]).toEqual(['9 / 16', '10.125rem']);
    rerenderCard({ job: job({ ratio: 'wide' }) });
    expect(media.style.aspectRatio).toBe('1 / 1');
  });

  it('keeps focus on itself when the focused button goes with its state', () => {
    const { card, rerenderCard } = renderCard({ job: running(0.95) });
    act(() => {
      screen.getByRole('button', { name: 'Cancel image 3' }).focus();
    });
    rerenderCard({ job: succeeded });
    expect(document.activeElement).toBe(card);
  });

  it('leaves focus alone when it went elsewhere', () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    const { rerenderCard } = renderCard({ job: running(0.95) });
    act(() => {
      screen.getByRole('button', { name: 'Cancel image 3' }).focus();
      outside.focus();
    });
    rerenderCard({ job: succeeded });
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  describe('keyboard', () => {
    testKeyboardMap(generationCardKeyboard, {
      setup: () => {
        const view = renderCard({ job: failed });
        return { ...view, target: screen.getByRole('button', { name: 'Retry image 3' }) };
      },
      expectations: {
        press: ({ onRetry }) => {
          expect(onRetry).toHaveBeenCalledWith(failed);
        },
        next: () => {
          expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Remove image 3' }));
        },
      },
    });
  });

  it('fires nothing for keys on the card itself', () => {
    const { card, onRemove, onRetry } = renderCard({ job: failed });
    fireEvent.keyDown(card, { key: 'Delete' });
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(onRemove).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
  });
});
