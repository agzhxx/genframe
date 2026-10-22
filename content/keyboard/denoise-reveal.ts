import type { KeyboardMap } from '@/lib/keyboard';

// DenoiseReveal's keys: none. It's an image, with nothing to press. Its docs page says so, and
// tests/denoise-reveal.test.tsx checks the map stays empty.
export const denoiseRevealKeyboard = {} satisfies KeyboardMap;
