import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { denoiseRevealKeyboard } from '@/content/keyboard/denoise-reveal';
import type { ReducedMotionSetting } from '@/registry/hooks/use-reduced-motion';
import { DenoiseReveal, type DenoiseRevealProps } from '@/registry/ui/denoise-reveal/denoise-reveal';
import { expectRole } from './helpers/aria';
import { testKeyboardMap } from './helpers/keyboard';
import { mockSystemReducedMotion, renderWithReducedMotion } from './helpers/reduced-motion';

const props: DenoiseRevealProps = {
  src: 'city.webp',
  alt: 'A floating island city tethered by cables, under twin moons',
  width: 2048,
  height: 2048,
};

function renderReveal(extra: Partial<DenoiseRevealProps> = {}, reducedMotion: ReducedMotionSetting = 'never') {
  const view = renderWithReducedMotion(<DenoiseReveal {...props} {...extra} />, reducedMotion);
  const root = view.container.querySelector<HTMLElement>('[data-slot="denoise-reveal"]');
  if (!root) throw new Error('No reveal');
  return { ...view, root, image: screen.getByRole<HTMLImageElement>('img', { hidden: true }) };
}

function grain(root: HTMLElement) {
  return root.querySelector('[data-slot="denoise-reveal-grain"]');
}

// The image has loaded and decoded: the reveal starts.
async function load(image: HTMLImageElement, root: HTMLElement) {
  fireEvent.load(image);
  await waitFor(() => {
    expect(root.dataset.state).not.toBe('loading');
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DenoiseReveal', () => {
  it('is an image named by its alt text, with the grain hidden from assistive technology', () => {
    const { image, root } = renderReveal({ srcSet: 'city-480.webp 480w, city-960.webp 960w', sizes: '50vw' });
    expectRole(image, 'img', props.alt);
    expect(image).toMatchObject({ width: 2048, height: 2048, srcset: 'city-480.webp 480w, city-960.webp 960w', sizes: '50vw' });
    expect(image.getAttribute('src')).toBe('city.webp');
    expect(grain(root)?.getAttribute('aria-hidden')).toBe('true');
  });

  it('waits under grain until the image loads, hidden and blurred', () => {
    const { image, root } = renderReveal();
    expect(root.dataset.state).toBe('loading');
    expect(image.className).toContain('opacity-0');
    expect(image.className).toContain('blur-xl');
    expect(grain(root)?.getAttribute('class')).not.toContain('opacity-0');
  });

  it('shows its placeholder under the grain until then', () => {
    const { root } = renderReveal({ placeholder: 'data:image/png;base64,iVBORw0KGgo=' });
    expect(root.style.backgroundImage).toBe('url("data:image/png;base64,iVBORw0KGgo=")');
  });

  describe('full motion', () => {
    it('fades the grain out while the blur drops, over the reveal’s duration, then drops the grain', async () => {
      const { image, root } = renderReveal();
      await load(image, root);
      expect(root.dataset.state).toBe('revealing');
      expect(image.className).not.toContain('opacity-0');
      expect(image.className).not.toContain('blur-xl');
      expect(image.className).toContain('transition-[opacity,filter] duration-(--genframe-duration-reveal)');
      const fading = grain(root);
      expect(fading?.getAttribute('class')).toContain('opacity-0');
      expect(fading?.getAttribute('class')).toContain('transition-opacity duration-(--genframe-duration-reveal)');

      fireEvent.transitionEnd(image, { propertyName: 'filter' });
      expect(grain(root)).not.toBeNull();
      fireEvent.transitionEnd(image, { propertyName: 'opacity' });
      expect(root.dataset.state).toBe('revealed');
      expect(grain(root)).toBeNull();
    });

    it('waits for the image to decode before it starts', async () => {
      let decoded: () => void = () => undefined;
      vi.spyOn(HTMLImageElement.prototype, 'decode').mockReturnValue(
        new Promise((resolve) => {
          decoded = resolve;
        }),
      );
      const { image, root } = renderReveal();
      fireEvent.load(image);
      await act(async () => {
        await Promise.resolve();
      });
      expect(root.dataset.state).toBe('loading');
      decoded();
      await waitFor(() => {
        expect(root.dataset.state).toBe('revealing');
      });
    });

    it('reveals an image that had loaded before it mounted, from the cache, with no load event', async () => {
      vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
      const { root } = renderReveal();
      await waitFor(() => {
        expect(root.dataset.state).toBe('revealing');
      });
    });

    it('shows a broken image rather than grain forever', async () => {
      vi.spyOn(HTMLImageElement.prototype, 'decode').mockRejectedValue(new DOMException('Broken', 'EncodingError'));
      const { image, root } = renderReveal();
      fireEvent.error(image);
      await waitFor(() => {
        expect(root.dataset.state).toBe('revealing');
      });
    });
  });

  describe('reduced motion', () => {
    it('has no grain or blur: the image only fades in, quickly', async () => {
      const { image, root } = renderReveal({}, 'always');
      expect(root.dataset.motion).toBe('reduce');
      expect(grain(root)).toBeNull();
      expect(image.className).toContain('in-data-[motion=reduce]:transition-opacity');
      expect(image.className).toContain('in-data-[motion=reduce]:duration-(--genframe-duration-fast)');
      expect(image.className).toContain('in-data-[motion=reduce]:filter-none');
      await load(image, root);
      expect(root.dataset.state).toBe('revealing');
      expect(image.className).not.toContain('opacity-0');
      fireEvent.transitionEnd(image, { propertyName: 'opacity' });
      expect(root.dataset.state).toBe('revealed');
    });

    it('follows the system setting', () => {
      mockSystemReducedMotion(true);
      const { root } = renderReveal({}, 'user');
      expect(root.dataset.motion).toBe('reduce');
      expect(grain(root)).toBeNull();
    });
  });

  it('shows images that were there already as they load, without denoising them', () => {
    const { image, root } = renderReveal({ denoise: false, placeholder: 'data:image/png;base64,iVBORw0KGgo=' });
    expect(root.dataset.state).toBe('revealed');
    expect(grain(root)).toBeNull();
    expect(image.className).not.toContain('opacity-0');
    expect(image.className).not.toContain('transition');
    expect(root.style.backgroundImage).toContain('data:image/png');
  });

  describe('keyboard', () => {
    // It takes no input: the map is empty, and stays so.
    testKeyboardMap(denoiseRevealKeyboard, {
      setup: () => ({ target: renderReveal().root }),
      expectations: {},
    });
  });
});
