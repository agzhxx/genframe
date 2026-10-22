import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library only cleans up by itself when test functions are globals; here they're imported.
afterEach(cleanup);

// jsdom has no pointer capture, which components that track a drag call on every browser. (Tests
// in the node environment have no Element at all.)
if (typeof Element !== 'undefined') {
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  // Nor scrolling into view or resize observers, which cmdk's list and Radix's popover use.
  Element.prototype.scrollIntoView = () => undefined;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // Nor object URLs, which show the files dropped into the prompt composer; tests spy on these.
  URL.createObjectURL = () => 'blob:stub';
  URL.revokeObjectURL = () => undefined;
  // Nor decoding images, which DenoiseReveal waits for before it reveals one. (jsdom never loads
  // images either: tests fire their load events.)
  HTMLImageElement.prototype.decode = () => Promise.resolve();
}
