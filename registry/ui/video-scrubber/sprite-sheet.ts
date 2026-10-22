// The file starts with this declaration: shadcn's CLI drops the comments above a file's first
// statement when it installs it.
const TOLERANCE = 0.000001

/**
 * A video's thumbnails in one image: a grid of `columns` × `rows` tiles, read left to right and
 * top to bottom, one every `interval` seconds from 0. The format many players use for scrub
 * previews.
 */
export interface SpriteSheet {
  /** The image's address. */
  url: string
  /** Tiles in a row. */
  columns: number
  /** Rows of tiles. */
  rows: number
  /** Seconds between tiles: the first shows 0, the next `interval`, and so on. */
  interval: number
  /** A tile's width in the image, in pixels. */
  width: number
  /** A tile's height in the image, in pixels. */
  height: number
}

/** A thumbnail: an image, or a region of one, like a sprite sheet's tile, in the image's pixels. */
export interface Thumbnail {
  url: string
  /** The region's left edge. */
  x: number
  /** The region's top edge. */
  y: number
  width: number
  height: number
}

/** The tile showing `time`: the last one that starts at or before it, and at most the sheet's last. */
export function spriteThumbnail(sprite: SpriteSheet, time: number): Thumbnail {
  const tile = Math.floor((time + TOLERANCE) / sprite.interval)
  const index = Number.isFinite(tile) ? Math.max(0, Math.min(tile, sprite.columns * sprite.rows - 1)) : 0
  return {
    url: sprite.url,
    x: (index % sprite.columns) * sprite.width,
    y: Math.floor(index / sprite.columns) * sprite.height,
    width: sprite.width,
    height: sprite.height,
  }
}
