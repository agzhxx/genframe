import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Studio } from '@/components/studio/studio';
import { installMediaStubs, removeMediaStubs } from './helpers/media';
import { mockSystemReducedMotion } from './helpers/reduced-motion';

// The Studio wires the components together: these tests follow a prompt from the composer
// through the queue to the stage, and check that the results follow the settings.

type User = ReturnType<typeof userEvent.setup>;

function setup() {
  const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
  render(<Studio />);
  return user;
}

async function generate(user: User, prompt = 'A wreck on the sea floor') {
  await user.click(screen.getByRole('textbox', { name: 'Prompt' }));
  await user.keyboard(prompt);
  await user.keyboard('{Control>}{Enter}{/Control}');
}

// Lets the simulated generator finish everything that's running (videos take up to 14 s).
async function finish() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20_000);
  });
}

async function chooseModel(user: User, search: string) {
  await user.click(screen.getByRole('button', { name: /^Model: / }));
  await user.keyboard(search);
  await user.keyboard('{Enter}');
}

function stage() {
  const element = document.querySelector<HTMLElement>('[data-slot="studio-stage"]');
  if (!element) throw new Error('No stage');
  return element;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  installMediaStubs();
});

afterEach(() => {
  // Unmounted first: the camera moves' tiles give their videos back, with the stubs still there.
  cleanup();
  removeMediaStubs();
  vi.useRealTimers();
});

describe('Studio', () => {
  it('says plainly that generation is simulated, and where the results come from', () => {
    setup();
    const note = document.querySelector('[data-slot="studio-note"]')?.textContent ?? '';
    expect(note).toMatch(/^Generation is simulated: nothing is sent anywhere or made from your prompt\./);
    expect(note).toContain('AI-generated image or clip from Generation Feed, picked to match your settings');
    expect(note).toContain('Example prices: Higgsfield’s API prices, checked on 2026-10-16.');
  });

  it('submits the prompt to the queue, which names the job and shows it running, with the cost of the run', async () => {
    const user = setup();
    expect(document.querySelector('[data-slot="prompt-composer-cost"]')?.textContent).toBe('1 image × $0.08 ≈ $0.08');
    await generate(user, 'A wreck on the sea floor');
    const card = screen.getByRole('article', { name: 'Image 1' });
    expect(card.getAttribute('data-status')).toBe('running');
    expect(within(card).getByText('A wreck on the sea floor')).toBeTruthy();
    expect(within(card).getByText('16:9')).toBeTruthy();
  });

  it('opens a finished image’s draft and final in the compare slider, then goes back to Open on Close', async () => {
    const user = setup();
    await generate(user);
    await finish();
    const open = screen.getByRole('button', { name: 'Open image 1' });
    await user.click(open);

    expect(document.activeElement).toBe(within(stage()).getByRole('heading', { name: 'Image 1' }));
    expect(within(stage()).getByRole('slider', { name: 'Draft and Final' })).toBeTruthy();
    const alts = within(stage())
      .getAllByRole('img')
      .map((image) => image.getAttribute('alt'));
    expect(alts).toEqual([
      'Draft: A sunken airplane wreck on white sand, with sun rays from the surface',
      'Final: A sunken airplane wreck on white sand, with sun rays from the surface',
    ]);
    expect(stage().textContent).toContain('The draft was made with Soul 2, and the final from it with Grok Imagine 2.0');

    await user.click(within(stage()).getByRole('button', { name: 'Close image 1' }));
    expect(document.querySelector('[data-slot="studio-stage"]')).toBeNull();
    expect(document.activeElement).toBe(open);
  });

  it('picks results by the settings: two jobs alike make different images, and a 1:1 image has no draft', async () => {
    const user = setup();
    await generate(user);
    await user.keyboard('{Control>}{Enter}{/Control}');
    await user.click(screen.getByRole('radio', { name: '1:1, square' }));
    await user.click(screen.getByRole('textbox', { name: 'Prompt' }));
    await user.keyboard('{Control>}{Enter}{/Control}');
    await finish();

    await user.click(screen.getByRole('button', { name: 'Open image 2' }));
    expect(within(stage()).getAllByRole('img')[1]?.getAttribute('alt')).toBe(
      'Final: A stray cat sitting in a dry doorway on a wet street, at blue hour',
    );
    await user.click(screen.getByRole('button', { name: 'Open image 3' }));
    expect(within(stage()).queryByRole('slider')).toBeNull();
    expect(within(stage()).getByRole('img').getAttribute('alt')).toBe(
      'An adult in a yellow coat at the end of a wooden pier on a misty lake, seen from behind',
    );
    expect(stage().textContent).toContain('which has drafts and finals in 16:9 and 3:4 only');
  });

  it('shows the camera moves for a video model, and makes a clip of the move picked, which plays with a scrubber', async () => {
    const user = setup();
    expect(screen.queryByRole('radiogroup', { name: 'Camera move' })).toBeNull();
    await chooseModel(user, 'cinema');
    const moves = screen.getByRole('radiogroup', { name: 'Camera move' });
    expect(within(moves).getAllByRole('radio')).toHaveLength(8);
    expect(document.querySelector('[data-slot="prompt-composer-cost"]')?.textContent).toBe('5 s × $0.2057 ≈ $1.03');

    await user.click(within(moves).getByRole('radio', { name: 'Orbit' }));
    await generate(user);
    await finish();
    await user.click(screen.getByRole('button', { name: 'Open video 1' }));

    const video = stage().querySelector('video');
    expect(video?.getAttribute('aria-label')).toBe('A small red vintage car on a winding mountain road far below: orbit');
    expect(video?.autoplay).toBe(true);
    expect(within(stage()).getByRole('slider', { name: 'Seek' })).toBeTruthy();
    expect(stage().textContent).toContain('Made with Cinema Studio 4.0');
  });

  it('clears the camera move, and moves focus to the moves', async () => {
    const user = setup();
    await chooseModel(user, 'kling 2.5 pro');
    const moves = screen.getByRole('radiogroup', { name: 'Camera move' });
    await user.click(within(moves).getByRole('radio', { name: 'Dolly in' }));
    await user.click(screen.getByRole('button', { name: 'Clear the camera move' }));
    expect(within(moves).getAllByRole('radio').some((radio) => (radio as HTMLInputElement).checked)).toBe(false);
    expect(document.activeElement).toBe(within(moves).getAllByRole('radio')[0]);
  });

  it('says when the Feed has no clip of the move in the shape asked for', async () => {
    const user = setup();
    await chooseModel(user, 'kling 2.5');
    await user.click(screen.getByRole('radio', { name: 'Orbit' }));
    await user.click(screen.getByRole('radio', { name: '9:16, portrait' }));
    await generate(user);
    await finish();
    await user.click(screen.getByRole('button', { name: 'Open video 1' }));
    expect(stage().textContent).toContain('The Feed’s camera moves are all 16:9, so this one has none.');
  });

  it('with reduced motion, an opened clip waits for Play', async () => {
    mockSystemReducedMotion(true);
    const user = setup();
    await chooseModel(user, 'kling 2.5 pro');
    await generate(user);
    await finish();
    await user.click(screen.getByRole('button', { name: 'Open video 1' }));
    expect(stage().querySelector('video')?.autoplay).toBe(false);
    expect(within(stage()).getByRole('button', { name: 'Play' })).toBeTruthy();
  });

  it('closes the stage when its job is removed', async () => {
    const user = setup();
    await generate(user);
    await finish();
    await user.click(screen.getByRole('button', { name: 'Open image 1' }));
    await user.click(screen.getByRole('button', { name: 'Remove image 1' }));
    expect(document.querySelector('[data-slot="studio-stage"]')).toBeNull();
  });
});
