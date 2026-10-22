// Aspect-ratio arithmetic, kept pure so it's tested on its own. A ratio is written "16:9":
// width, a colon, height.

export const DEFAULT_RATIOS = ["1:1", "3:4", "4:3", "2:3", "3:2", "9:16", "16:9", "21:9"]

/** "16:9" → { width: 16, height: 9 }. Throws on anything that isn't two positive numbers. */
export function parseRatio(ratio: string) {
  const [width, height, extra] = ratio.split(":").map(Number)
  if (extra !== undefined || !(width && height && width > 0 && height > 0)) {
    throw new Error(`"${ratio}" isn't an aspect ratio: write it as width:height, like "16:9"`)
  }
  return { width, height }
}

/**
 * The ratio's shape inside a square: its longer side is 1, so 16:9 is 1 wide and 0.5625 high.
 * Frames scale a square by these, which keeps every ratio the same size at its longest.
 */
export function fitRatio(ratio: string) {
  const { width, height } = parseRatio(ratio)
  const longest = Math.max(width, height)
  return { width: width / longest, height: height / longest }
}

/** The ratio's orientation, which screen readers hear after it: "16:9, landscape". */
export function ratioShape(ratio: string) {
  const { width, height } = parseRatio(ratio)
  return width > height ? "landscape" : width < height ? "portrait" : "square"
}
