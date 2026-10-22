// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { settlingTime, springCurve, springEasing, springPosition, springToken } from '@/scripts/spring-easing';

// A linear() easing's stops as times and values; the first and last stops sit at 0% and 100%.
function parseLinear(easing: string) {
  const stops = /^linear\((.*)\)$/.exec(easing)?.[1]?.split(', ') ?? [];
  return stops.map((stop, index) => {
    const [value = '', percentage] = stop.split(' ');
    const time = percentage === undefined ? (index === 0 ? 0 : 1) : Number(percentage.slice(0, -1)) / 100;
    return { time, value: Number(value) };
  });
}

// What the browser draws: a straight line between the stops on either side.
function valueAt(stops: { time: number; value: number }[], time: number) {
  const after = stops.findIndex((stop) => stop.time >= time);
  const end = stops[after];
  const start = stops[after - 1] ?? end;
  if (!start || !end) throw new Error(`no stop at ${String(time)}`);
  if (end.time === start.time) return end.value;
  return start.value + ((time - start.time) / (end.time - start.time)) * (end.value - start.value);
}

const { dampingRatio, settle } = springToken;

describe('the spring easing', () => {
  it('follows a damped spring: from rest at 0, one overshoot of the textbook size, settled at 1', () => {
    expect(springPosition(0, dampingRatio)).toBeCloseTo(0, 12);
    // An underdamped spring peaks at π / ω_d and overshoots by e^(-πζ / √(1 - ζ²)).
    const damped = Math.sqrt(1 - dampingRatio ** 2);
    const overshoot = Math.exp((-Math.PI * dampingRatio) / damped);
    expect(springPosition(Math.PI / damped, dampingRatio) - 1).toBeCloseTo(overshoot, 9);
    expect(overshoot).toBeCloseTo(0.028, 3);

    const end = settlingTime(dampingRatio, settle);
    for (let time = end; time < 3 * end; time += 0.01) {
      expect(Math.abs(springPosition(time, dampingRatio) - 1)).toBeLessThanOrEqual(settle);
    }
  });

  it('draws the spring within its tolerance, rounding included', () => {
    const stops = parseLinear(springEasing(springToken));
    const gaps = springCurve(springToken).map(({ time, value }) => Math.abs(valueAt(stops, time) - value));
    // Values are written with 3 decimals and times with 0.1%, which can add a little.
    expect(Math.max(...gaps)).toBeLessThanOrEqual(springToken.tolerance + 0.002);
  });

  it('starts at 0 and ends exactly at the target', () => {
    const stops = parseLinear(springEasing(springToken));
    expect(stops.at(0)).toEqual({ time: 0, value: 0 });
    expect(stops.at(-1)).toEqual({ time: 1, value: 1 });
    expect(stops.map((stop) => stop.time)).toEqual(stops.map((stop) => stop.time).toSorted((a, b) => a - b));
  });
});
