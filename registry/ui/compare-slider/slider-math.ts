// The slider's arithmetic, kept pure so it's tested on its own.
//
// The position is how much of the `after` layer shows, from 0 (only `before`) to 100 (only
// `after`). Like the filled part of a range input, `after` grows from the slider's minimum end:
// from the left when it's horizontal, from the bottom when it's vertical. So → and ↑ show more of
// it, and the divider moves the way the arrow points.

export type CompareSliderOrientation = "horizontal" | "vertical"

export const DEFAULT_POSITION = 50
const STEP = 1
const BIG_STEP = 10

export function clampPosition(position: number) {
  return Math.min(100, Math.max(0, position))
}

/**
 * The position under a point (a pointer's clientX and clientY) in the slider's box. Outside the
 * box it goes below 0 or above 100: clamp it after taking off where the handle was grabbed, so a
 * drag past the end still reaches it.
 */
export function positionAt(
  point: { clientX: number; clientY: number },
  box: { left: number; top: number; width: number; height: number },
  orientation: CompareSliderOrientation
) {
  const fraction =
    orientation === "horizontal"
      ? (point.clientX - box.left) / box.width
      : (box.top + box.height - point.clientY) / box.height
  // A box with no size has no position under the pointer.
  return Number.isFinite(fraction) ? fraction * 100 : 0
}

/**
 * Where a key moves the slider from `position`, or null for a key it doesn't handle. Steps land on
 * whole percents, so a position set by dragging (57.4) steps to 58 and 56.
 */
export function positionForKey(key: string, shiftKey: boolean, position: number) {
  const step = (size: number) => clampPosition(Math.round(position + size))
  switch (key) {
    case "ArrowRight":
    case "ArrowUp":
      return step(shiftKey ? BIG_STEP : STEP)
    case "ArrowLeft":
    case "ArrowDown":
      return step(shiftKey ? -BIG_STEP : -STEP)
    case "PageUp":
      return step(BIG_STEP)
    case "PageDown":
      return step(-BIG_STEP)
    case "Home":
      return 0
    case "End":
      return 100
    default:
      return null
  }
}

/** What screen readers say for a position: "60% Final", or "60%" without labels. */
export function positionText(position: number, afterLabel?: string) {
  const percent = `${String(Math.round(position))}%`
  return afterLabel ? `${percent} ${afterLabel}` : percent
}

/**
 * The `after` layer's clip-path: it shows from the minimum end up to the divider. The layer keeps
 * its size and only its visible part changes, which the browser can do without laying out again.
 */
export function afterClipPath(position: number, orientation: CompareSliderOrientation) {
  const hidden = `${String(100 - position)}%`
  return orientation === "horizontal" ? `inset(0 ${hidden} 0 0)` : `inset(${hidden} 0 0 0)`
}

/**
 * The divider's transform. The divider is drawn on the left edge (the top edge when vertical) of
 * a box the size of the slider, so a translation in percent of its own size is a position in
 * percent of the slider.
 */
export function dividerTransform(position: number, orientation: CompareSliderOrientation) {
  return orientation === "horizontal"
    ? `translateX(${String(position)}%)`
    : `translateY(${String(100 - position)}%)`
}
