// The curve behind the `--genframe-ease-spring` motion token: a damped spring's position over
// time, written as a CSS `linear()` easing. With it, a plain CSS transition moves like a spring
// (it overshoots its target a little and settles), so no item needs a JavaScript animation
// library for one. tests/motion-tokens.test.ts checks that the token in
// registry.json is this curve.
//
//   node scripts/spring-easing.ts
//
// How: the spring starts at 0 and is pulled to 1. Its position is sampled until it stays within
// `settle` of 1, so the transition's duration covers the whole movement; then the samples are
// thinned to the few points that keep the curve within `tolerance` (Ramer–Douglas–Peucker),
// since linear() draws straight lines between its points.

/** How the token's spring is made. Change these and run the script to retune it. */
export const springToken = {
  /** 1 doesn't overshoot; lower bounces more. 0.75 overshoots by 2.8%. */
  dampingRatio: 0.75,
  /** Where the movement counts as finished: within 0.1% of the target. */
  settle: 0.001,
  /** The most the drawn curve may stray from the spring. */
  tolerance: 0.004,
} as const;

/**
 * Position of an underdamped spring (damping ratio below 1) released at 0 towards 1, after `t`
 * in units of 1 / its natural frequency.
 */
export function springPosition(t: number, dampingRatio: number) {
  const damped = Math.sqrt(1 - dampingRatio ** 2);
  const decay = Math.exp(-dampingRatio * t);
  return 1 - decay * (Math.cos(damped * t) + (dampingRatio / damped) * Math.sin(damped * t));
}

/** When the spring's swings stay within `settle` of 1, in the same units. */
export function settlingTime(dampingRatio: number, settle: number) {
  // The swings never exceed e^(-ζt) / √(1 - ζ²).
  return Math.log(1 / (settle * Math.sqrt(1 - dampingRatio ** 2))) / dampingRatio;
}

interface Point {
  /** Progress through the transition, 0 to 1. */
  time: number;
  /** The eased value, 0 to 1 (above 1 while it overshoots). */
  value: number;
}

// Keeps the fewest points whose straight lines stay within `tolerance` of the samples.
function simplify(points: Point[], tolerance: number): Point[] {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last || points.length < 3) return points;
  let farthest = 0;
  let distance = 0;
  for (let index = 1; index < points.length - 1; index++) {
    const point = points[index];
    if (!point) continue;
    const along = (point.time - first.time) / (last.time - first.time);
    const gap = Math.abs(point.value - (first.value + along * (last.value - first.value)));
    if (gap > distance) {
      distance = gap;
      farthest = index;
    }
  }
  if (distance <= tolerance) return [first, last];
  return [
    ...simplify(points.slice(0, farthest + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(farthest), tolerance),
  ];
}

/** The spring's samples, from 0 to its settling time: what `springEasing` draws. */
export function springCurve(options: { dampingRatio: number; settle: number }, samples = 400): Point[] {
  const end = settlingTime(options.dampingRatio, options.settle);
  return Array.from({ length: samples + 1 }, (_, index) => {
    const time = index / samples;
    // The last sample is exactly 1: the transition ends at its target.
    return { time, value: index === samples ? 1 : springPosition(time * end, options.dampingRatio) };
  });
}

/** The spring as a CSS `linear()` easing: `linear(0, 0.31 9.5%, ..., 1)`. */
export function springEasing(options: { dampingRatio: number; settle: number; tolerance: number }) {
  const points = simplify(springCurve(options), options.tolerance);
  const stops = points.map(({ time, value }, index) => {
    const number = Number(value.toFixed(3)).toString();
    // linear() spreads the first and last stops over 0% and 100% by itself.
    return index === 0 || index === points.length - 1 ? number : `${number} ${Number((time * 100).toFixed(1)).toString()}%`;
  });
  return `linear(${stops.join(', ')})`;
}

if (import.meta.main) console.log(springEasing(springToken));
