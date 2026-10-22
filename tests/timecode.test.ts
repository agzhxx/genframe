// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  exactFps,
  formatTime,
  formatTimecode,
  frameCount,
  framesToSeconds,
  parseTime,
  parseTimecode,
  secondsToFrames,
  snapToFrame,
  spokenTime,
} from '@/registry/lib/timecode';

describe('exactFps', () => {
  it('reads rounded NTSC rates as the exact ones', () => {
    expect(exactFps(23.976)).toBe(24000 / 1001);
    expect(exactFps(23.98)).toBe(24000 / 1001);
    expect(exactFps(29.97)).toBe(30000 / 1001);
    expect(exactFps(47.952)).toBe(48000 / 1001);
    expect(exactFps(59.94)).toBe(60000 / 1001);
    expect(exactFps(119.88)).toBe(120000 / 1001);
    expect(exactFps(30000 / 1001)).toBe(30000 / 1001);
  });

  it('leaves every other rate alone', () => {
    for (const rate of [12, 15, 24, 25, 30, 50, 60, 12.5]) expect(exactFps(rate)).toBe(rate);
  });
});

describe('secondsToFrames', () => {
  it('gives the frame showing: the last one that starts at or before the time', () => {
    expect(secondsToFrames(0, 24)).toBe(0);
    expect(secondsToFrames(0.04, 24)).toBe(0);
    expect(secondsToFrames(4.5, 24)).toBe(108);
    expect(secondsToFrames(4.541, 24)).toBe(108);
    expect(secondsToFrames(4.542, 24)).toBe(109);
  });

  it('counts a frame’s start as that frame, through float error and whole microseconds', () => {
    for (let frame = 0; frame <= 2400; frame++) {
      expect(secondsToFrames(frame / 24, 24)).toBe(frame);
      expect(secondsToFrames(frame / 25, 25)).toBe(frame);
      expect(secondsToFrames(frame / 30, 30)).toBe(frame);
    }
    // Frame 1 at 24 fps starts at 41,666.67 µs; a player in whole microseconds says 41,666.
    expect(secondsToFrames(0.041666, 24)).toBe(1);
    // 1.16 × 25 is 28.999999999999996.
    expect(secondsToFrames(1.16, 25)).toBe(29);
    // More than a microsecond early is still the frame before.
    expect(secondsToFrames(0.041664, 24)).toBe(0);
  });

  it('counts frames at the exact NTSC rate when given the rounded one', () => {
    // Frame 1,800 at 29.97 fps starts at 60.06 s, not at 1800 / 29.97 = 60.06006 s.
    expect(secondsToFrames(60.06, 29.97)).toBe(1800);
    expect(secondsToFrames(60.0599, 29.97)).toBe(1799);
    for (let frame = 0; frame <= 108_000; frame += 997) {
      expect(secondsToFrames((frame * 1001) / 30000, 29.97)).toBe(frame);
      expect(secondsToFrames((frame * 1001) / 24000, 23.976)).toBe(frame);
    }
  });

  it('makes times before 0, and times that aren’t finite, frame 0', () => {
    expect(secondsToFrames(-1, 24)).toBe(0);
    expect(secondsToFrames(Number.NaN, 24)).toBe(0);
    expect(secondsToFrames(Number.POSITIVE_INFINITY, 24)).toBe(0);
  });
});

describe('framesToSeconds', () => {
  it('gives where a frame starts', () => {
    expect(framesToSeconds(0, 24)).toBe(0);
    expect(framesToSeconds(108, 24)).toBe(4.5);
    expect(framesToSeconds(24, 23.976)).toBeCloseTo(1.001, 12);
    expect(framesToSeconds(1800, 29.97)).toBeCloseTo(60.06, 12);
  });
});

describe('snapToFrame', () => {
  it('gives the middle of the frame showing', () => {
    expect(snapToFrame(0, 24)).toBe(0.5 / 24);
    expect(snapToFrame(4.5, 24)).toBe(108.5 / 24);
    expect(snapToFrame(4.54, 24)).toBe(108.5 / 24);
    expect(snapToFrame(1, 29.97)).toBeCloseTo((29.5 * 1001) / 30000, 12);
  });

  it('lands back on the same frame, and never on a neighbor', () => {
    for (const fps of [23.976, 24, 25, 29.97, 30, 59.94, 60]) {
      for (let frame = 0; frame < 5000; frame += 7) {
        const middle = snapToFrame(framesToSeconds(frame, fps), fps);
        expect(secondsToFrames(middle, fps)).toBe(frame);
        expect(snapToFrame(middle, fps)).toBe(middle);
      }
    }
  });
});

describe('frameCount', () => {
  it('counts the frames a video holds, its last one partial or whole', () => {
    // The Feed's story clips: 121 frames at 24 fps.
    expect(frameCount(121 / 24, 24)).toBe(121);
    expect(frameCount(5.041667, 24)).toBe(121);
    expect(frameCount(5, 24)).toBe(120);
    expect(frameCount(5.03, 24)).toBe(121);
    expect(frameCount(1 / 24, 24)).toBe(1);
  });

  it('allows a length rounded up to the millisecond, as WebM stores it', () => {
    expect(frameCount(5.042, 24)).toBe(121);
    expect(frameCount(4.0, 29.97)).toBe(120);
    expect(frameCount((120 * 1001) / 30000, 29.97)).toBe(120);
  });

  it('has no frames without a length', () => {
    for (const duration of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(frameCount(duration, 24)).toBe(0);
  });
});

describe('formatTime', () => {
  it('shows m:ss in whole seconds, rounded down like a clock', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(5.99)).toBe('0:05');
    expect(formatTime(64)).toBe('1:04');
    expect(formatTime(599.999)).toBe('9:59');
    expect(formatTime(600)).toBe('10:00');
    expect(formatTime(3599)).toBe('59:59');
  });

  it('shows hours from an hour on, or always when asked', () => {
    expect(formatTime(3600)).toBe('1:00:00');
    expect(formatTime(3723)).toBe('1:02:03');
    expect(formatTime(36_000)).toBe('10:00:00');
    expect(formatTime(64, { hours: true })).toBe('0:01:04');
  });

  it('counts a second’s start as that second through float error', () => {
    // 1.16 × 25 is 28.999999999999996.
    expect(formatTime(1.16 * 25)).toBe('0:29');
  });

  it('shows 0:00 for times before 0 and times that aren’t finite', () => {
    for (const time of [-5, Number.NaN, Number.POSITIVE_INFINITY]) expect(formatTime(time)).toBe('0:00');
  });
});

describe('parseTime', () => {
  it('reads s, m:ss and h:mm:ss, with a fraction of a second', () => {
    expect(parseTime('45')).toBe(45);
    expect(parseTime('90')).toBe(90);
    expect(parseTime('1:04')).toBe(64);
    expect(parseTime(' 1:04 ')).toBe(64);
    expect(parseTime('0:05')).toBe(5);
    expect(parseTime('100:00')).toBe(6000);
    expect(parseTime('1:02:03')).toBe(3723);
    expect(parseTime('1:04.5')).toBe(64.5);
  });

  it('reads back what formatTime writes', () => {
    for (let time = 0; time < 40_000; time += 17) {
      expect(parseTime(formatTime(time))).toBe(time);
      expect(parseTime(formatTime(time, { hours: true }))).toBe(time);
    }
  });

  it('rejects anything else', () => {
    for (const text of ['', 'abc', '-1', '1:60', '1:60:00', '1:2:3:4', '1:04.', '.5', '1::04', '1:04 pm']) {
      expect(parseTime(text), text).toBeNull();
    }
  });
});

describe('formatTimecode', () => {
  it('writes HH:MM:SS:FF', () => {
    expect(formatTimecode(0, 24)).toBe('00:00:00:00');
    expect(formatTimecode(108, 24)).toBe('00:00:04:12');
    expect(formatTimecode(120, 24)).toBe('00:00:05:00');
    expect(formatTimecode(121, 24)).toBe('00:00:05:01');
    expect(formatTimecode(24 * 3723 + 5, 24)).toBe('01:02:03:05');
    expect(formatTimecode(25 * 60 - 1, 25)).toBe('00:00:59:24');
    expect(formatTimecode(24 * 360_000, 24)).toBe('100:00:00:00');
  });

  it('counts frames to the rate rounded at fractional rates, without dropping any', () => {
    expect(formatTimecode(23, 23.976)).toBe('00:00:00:23');
    expect(formatTimecode(24, 23.976)).toBe('00:00:01:00');
    expect(formatTimecode(29, 29.97)).toBe('00:00:00:29');
    expect(formatTimecode(30, 29.97)).toBe('00:00:01:00');
    expect(formatTimecode(1799, 29.97)).toBe('00:00:59:29');
    expect(formatTimecode(1800, 29.97)).toBe('00:01:00:00');
    // An hour of 29.97 video holds 107,892 frames: 3.6 s short of an hour of timecode.
    expect(formatTimecode(secondsToFrames(3600, 29.97), 29.97)).toBe('00:59:56:12');
  });

  it('writes whole, non-negative frames', () => {
    expect(formatTimecode(-3, 24)).toBe('00:00:00:00');
    expect(formatTimecode(12.9, 24)).toBe('00:00:00:12');
    expect(formatTimecode(Number.NaN, 24)).toBe('00:00:00:00');
  });
});

describe('parseTimecode', () => {
  it('reads HH:MM:SS:FF, or the end of it', () => {
    expect(parseTimecode('00:00:04:12', 24)).toBe(108);
    expect(parseTimecode('04:12', 24)).toBe(108);
    expect(parseTimecode('4:12', 24)).toBe(108);
    expect(parseTimecode('12', 24)).toBe(12);
    expect(parseTimecode('01:00:00', 24)).toBe(60 * 24);
    expect(parseTimecode('100:00:00:00', 24)).toBe(24 * 360_000);
    expect(parseTimecode('00:01:00:00', 29.97)).toBe(1800);
  });

  it('reads back what formatTimecode writes', () => {
    for (const fps of [23.976, 24, 25, 29.97, 30, 59.94]) {
      for (let frame = 0; frame < 300_000; frame += 4999) {
        expect(parseTimecode(formatTimecode(frame, fps), fps)).toBe(frame);
      }
    }
  });

  it('rejects frames past the rate, minutes and seconds past 59, and anything else', () => {
    expect(parseTimecode('00:00:04:24', 24)).toBeNull();
    expect(parseTimecode('00:00:04:24', 25)).toBe(124);
    expect(parseTimecode('00:00:00:30', 29.97)).toBeNull();
    expect(parseTimecode('00:00:60:00', 24)).toBeNull();
    expect(parseTimecode('00:60:00:00', 24)).toBeNull();
    for (const text of ['', '1:2:3:4:5', '00:00:04;12', 'ab', '-1', '123']) {
      expect(parseTimecode(text, 24), text).toBeNull();
    }
  });
});

describe('spokenTime', () => {
  it('says hours, minutes and seconds, leaving out the ones that are 0', () => {
    expect(spokenTime(0)).toBe('0 seconds');
    expect(spokenTime(1)).toBe('1 second');
    expect(spokenTime(5.9)).toBe('5 seconds');
    expect(spokenTime(60)).toBe('1 minute');
    expect(spokenTime(64)).toBe('1 minute 4 seconds');
    expect(spokenTime(120)).toBe('2 minutes');
    expect(spokenTime(3600)).toBe('1 hour');
    expect(spokenTime(3723)).toBe('1 hour 2 minutes 3 seconds');
    expect(spokenTime(7322)).toBe('2 hours 2 minutes 2 seconds');
  });

  it('says the timecode’s frames too, with a frame rate', () => {
    expect(spokenTime(4.5, 24)).toBe('4 seconds 12 frames');
    expect(spokenTime(108.5 / 24, 24)).toBe('4 seconds 12 frames');
    expect(spokenTime(4, 24)).toBe('4 seconds');
    expect(spokenTime(1 / 24, 24)).toBe('1 frame');
    expect(spokenTime(0, 24)).toBe('0 seconds');
    expect(spokenTime(60.06, 29.97)).toBe('1 minute');
  });

  it('says 0 seconds for times before 0 and times that aren’t finite', () => {
    expect(spokenTime(-2)).toBe('0 seconds');
    expect(spokenTime(Number.NaN, 24)).toBe('0 seconds');
  });
});
