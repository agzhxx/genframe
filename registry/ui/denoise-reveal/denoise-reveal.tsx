"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"

import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/registry/hooks/use-reduced-motion"

export interface DenoiseRevealProps {
  /** The image's URL. */
  src: string
  /** What the image shows. */
  alt: string
  /** The image's width in pixels: with `height`, the box keeps its shape before it loads. */
  width?: number
  /** The image's height in pixels. */
  height?: number
  /** The image in several widths, as `<img srcset>` takes them. */
  srcSet?: string
  /** The width it's shown at, as `<img sizes>` takes it. */
  sizes?: string
  /**
   * An image to show until `src` has loaded, under the grain: a ThumbHash's data URL from
   * useThumbHash, or a small preview.
   */
  placeholder?: string
  /**
   * Grows the image out of grain and blur once it has loaded. Turn it off for images that were
   * there already, like results loaded with the page: they show as they load. Read when it mounts.
   *
   * @defaultValue true
   */
  denoise?: boolean
  /** Classes for the box, which the image fills: size it here, or let `width` and `height` shape it. */
  className?: string
}

type Phase = "loading" | "revealing" | "revealed"

/**
 * An image that sharpens out of noise, the way a diffusion model makes one: until it has loaded,
 * a grain covers its placeholder; then the grain fades out while the image's blur drops to
 * nothing. The grain is an SVG feTurbulence, drawn once; only opacity and filter animate.
 */
export function DenoiseReveal({
  src,
  alt,
  width,
  height,
  srcSet,
  sizes,
  placeholder,
  denoise = true,
  className,
}: DenoiseRevealProps) {
  const reduced = useReducedMotion()
  const [phase, setPhase] = useState<Phase>(denoise ? "loading" : "revealed")
  const image = useRef<HTMLImageElement>(null)

  const reveal = useCallback(() => {
    const element = image.current
    if (!element) return
    // Decoded first, so the reveal doesn't start on an image that isn't ready to paint; a broken
    // image shows too, rather than grain forever.
    element
      .decode()
      .catch(() => undefined)
      .finally(() => {
        // The hidden style has to be computed for the transition to start from it, also for an
        // image that came from the cache at once.
        element.getBoundingClientRect()
        setPhase((current) => (current === "loading" ? "revealing" : current))
      })
  }, [])

  // An image that loaded before this ran, from the cache or before hydration, fires no load event
  // that React sees.
  useEffect(() => {
    if (image.current?.complete) reveal()
  }, [reveal])

  return (
    <div
      data-slot="denoise-reveal"
      data-state={phase}
      data-motion={reduced ? "reduce" : undefined}
      className={cn("relative isolate overflow-hidden bg-muted bg-cover bg-center", className)}
      style={placeholder ? { backgroundImage: `url("${placeholder}")` } : undefined}
    >
      <img
        ref={image}
        src={src}
        srcSet={srcSet}
        sizes={sizes}
        width={width}
        height={height}
        alt={alt}
        decoding="async"
        draggable={false}
        onLoad={reveal}
        onError={reveal}
        onTransitionEnd={(event) => {
          if (event.propertyName === "opacity") setPhase("revealed")
        }}
        className={cn(
          "block size-full object-cover",
          denoise &&
            "transition-[opacity,filter] duration-(--genframe-duration-reveal) ease-(--genframe-ease-out) in-data-[motion=reduce]:transition-opacity in-data-[motion=reduce]:duration-(--genframe-duration-fast)",
          phase === "loading" && "opacity-0 blur-xl in-data-[motion=reduce]:filter-none"
        )}
      />
      {denoise && !reduced && phase !== "revealed" ? <Grain fading={phase === "revealing"} /> : null}
    </div>
  )
}

// Colored noise, like the noise a diffusion model starts from: feTurbulence's four channels of
// fractal noise, stretched for contrast, made opaque, and blended in hard light, so the colors
// underneath show through it. Drawn once; it only fades, and goes once the image's fade has ended.
function Grain({ fading }: { fading: boolean }) {
  const id = useId()
  return (
    <svg
      aria-hidden="true"
      data-slot="denoise-reveal-grain"
      className={cn(
        "pointer-events-none absolute inset-0 size-full mix-blend-hard-light transition-opacity duration-(--genframe-duration-reveal) ease-(--genframe-ease-out)",
        fading && "opacity-0"
      )}
    >
      <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.45" numOctaves={2} seed={4} stitchTiles="stitch" />
        <feColorMatrix
          type="matrix"
          values="1.8 0 0 0 -0.4  0 1.8 0 0 -0.4  0 0 1.8 0 -0.4  0 0 0 0 1"
        />
      </filter>
      <rect width="100%" height="100%" filter={`url(#${id})`} />
    </svg>
  )
}
