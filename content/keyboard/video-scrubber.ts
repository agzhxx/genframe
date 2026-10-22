import type { KeyboardMap } from '@/lib/keyboard';

// VideoScrubber's keys, the WAI-ARIA slider pattern's with frame steps: its docs page shows this
// table and tests/video-scrubber.test.tsx runs every row.
export const videoScrubberKeyboard = {
  forward: { keys: ['ArrowRight', 'ArrowUp'], action: 'Goes 5 seconds on' },
  back: { keys: ['ArrowLeft', 'ArrowDown'], action: 'Goes 5 seconds back' },
  start: { keys: ['Home'], action: 'Goes to the start' },
  end: { keys: ['End'], action: 'Goes to the end' },
  nextFrame: { keys: ['.'], action: 'Steps a frame on, when it has the frame rate (fps)' },
  previousFrame: { keys: [','], action: 'Steps a frame back, when it has the frame rate (fps)' },
} satisfies KeyboardMap;
