// The cards' slide to their new places when the order changes, as FLIP: First, Last, Invert, Play.

/** Where a card is laid out in its list: its offset, which transforms don't change. */
export interface Place {
  x: number
  y: number
}

// The translation in a computed transform: what's left of a slide still under way.
function translation(transform: string) {
  if (!transform.startsWith("matrix")) return { x: 0, y: 0 }
  const values = transform.slice(transform.indexOf("(") + 1, -1).split(",").map(Number)
  const [x, y] = transform.startsWith("matrix3d") ? [values[12], values[13]] : [values[4], values[5]]
  return { x: x ?? 0, y: y ?? 0 }
}

/**
 * Slides each card that moved from where it showed to its new place. First: its place after the
 * last render, from `before`. Last: its place now. Invert: a transform puts it back where it
 * showed, with no transition (a slide still under way is taken into account). Play: the transform
 * is let go, and the card's own CSS transition takes it to its new place. Only transforms move, so
 * nothing is laid out again. Returns the places now, for next time.
 */
export function slideToNewPlaces(
  items: ReadonlyMap<string, HTMLElement>,
  before: ReadonlyMap<string, Place>,
  animate: boolean,
  container: HTMLElement | null
) {
  const after = new Map<string, Place>()
  const slides: { element: HTMLElement; x: number; y: number }[] = []
  for (const [id, element] of items) {
    const place = { x: element.offsetLeft, y: element.offsetTop }
    after.set(id, place)
    const first = before.get(id)
    if (!animate || !first) continue
    const shown = translation(getComputedStyle(element).transform)
    const x = first.x + shown.x - place.x
    const y = first.y + shown.y - place.y
    if (x !== 0 || y !== 0) slides.push({ element, x, y })
  }
  if (slides.length === 0) return after

  for (const { element, x, y } of slides) {
    element.style.transition = "none"
    element.style.transform = `translate(${String(x)}px, ${String(y)}px)`
  }
  // The cards' old places have to be computed before the transforms go, or nothing would slide.
  container?.getBoundingClientRect()
  for (const { element } of slides) {
    element.style.transition = ""
    element.style.transform = ""
  }
  return after
}
