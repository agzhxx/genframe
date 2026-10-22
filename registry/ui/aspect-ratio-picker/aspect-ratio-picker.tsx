"use client"

import { useId, useState } from "react"

import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/registry/hooks/use-reduced-motion"
import { DEFAULT_RATIOS, fitRatio, ratioShape } from "./ratio-math"

export interface AspectRatioPickerProps {
  /**
   * The ratios to pick from, written width:height.
   *
   * @defaultValue ["1:1", "3:4", "4:3", "2:3", "3:2", "9:16", "16:9", "21:9"]
   */
  ratios?: string[]
  /** The picked ratio, when you control it. */
  value?: string
  /**
   * The ratio picked at first, when the picker keeps its own value.
   *
   * @defaultValue the first ratio that isn't disabled
   */
  defaultValue?: string
  /** Called with the ratio the user picks. */
  onValueChange?: (value: string) => void
  /** Ratios that can't be picked, each with the reason: `{ "21:9": "This model only makes 16:9" }`. */
  disabled?: Partial<Record<string, string>>
  /** The name the picked ratio is sent under when the picker is inside a form. */
  name?: string
  /**
   * The group's accessible name.
   *
   * @defaultValue "Aspect ratio"
   */
  "aria-label"?: string
  /** The id of an element that names the group, instead of `aria-label`. */
  "aria-labelledby"?: string
  /**
   * Leaves out the preview frame and lays the ratios out in one row, to fit a toolbar.
   *
   * @defaultValue false
   */
  compact?: boolean
  className?: string
}

// Ratios are drawn in a 100 × 100 box centered on 0, so scaling about the origin keeps them
// centered. A frame's longest side is 80.
const VIEW_BOX = "-50 -50 100 100"
const FRAME = 80

/**
 * Pick an aspect ratio from a row of frames, each drawn in its shape, with a larger preview that
 * changes shape as the pick changes. A radio group of native radio buttons.
 */
export function AspectRatioPicker({
  ratios = DEFAULT_RATIOS,
  value: controlledValue,
  defaultValue,
  onValueChange,
  disabled = {},
  name,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  compact = false,
  className,
}: AspectRatioPickerProps) {
  const reduced = useReducedMotion()
  const id = useId()
  const [ownValue, setOwnValue] = useState(
    () => defaultValue ?? ratios.find((ratio) => disabled[ratio] === undefined)
  )
  const value = controlledValue ?? ownValue
  const unavailable = ratios.flatMap((ratio) => {
    const reason = disabled[ratio]
    return reason === undefined ? [] : [{ ratio, reason }]
  })
  const preview = value === undefined ? null : fitRatio(value)

  function pick(ratio: string) {
    if (controlledValue === undefined) setOwnValue(ratio)
    onValueChange?.(ratio)
  }

  return (
    <div
      data-slot="aspect-ratio-picker"
      data-motion={reduced ? "reduce" : undefined}
      className={cn("group/picker relative flex flex-wrap items-center gap-4", className)}
    >
      {compact ? null : (
        <svg
          viewBox={VIEW_BOX}
          aria-hidden="true"
          data-slot="aspect-ratio-picker-preview"
          className="size-24 shrink-0 overflow-visible"
        >
          {preview ? (
            <>
              <rect
                x={-FRAME / 2}
                y={-FRAME / 2}
                width={FRAME}
                height={FRAME}
                vectorEffect="non-scaling-stroke"
                className={cn(
                  "fill-primary/10 stroke-primary stroke-[1.5]",
                  "transition-transform duration-(--genframe-duration-base) ease-(--genframe-ease-out)",
                  "in-data-[motion=reduce]:transition-none"
                )}
                style={{ transform: `scale(${String(preview.width)}, ${String(preview.height)})` }}
              />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-foreground text-[13px] font-medium"
              >
                {value}
              </text>
            </>
          ) : null}
        </svg>
      )}
      <div
        role="radiogroup"
        aria-label={ariaLabelledby ? undefined : (ariaLabel ?? "Aspect ratio")}
        aria-labelledby={ariaLabelledby}
        aria-describedby={unavailable.length > 0 ? `${id}-unavailable` : undefined}
        className={compact ? "flex gap-0.5" : "grid grid-cols-4 gap-1"}
      >
        {ratios.map((ratio) => {
          const reason = disabled[ratio]
          const shape = fitRatio(ratio)
          return (
            <label
              key={ratio}
              // A tap on a disabled ratio focuses its label, which shows the reason.
              tabIndex={reason === undefined ? undefined : -1}
              data-slot="aspect-ratio-picker-option"
              className={cn(
                "group/option relative flex flex-col items-center gap-1 rounded-md border border-transparent text-xs text-muted-foreground outline-none",
                compact ? "px-1.5 pt-1.5 pb-1" : "px-2 pt-2 pb-1.5",
                "hover:bg-accent hover:text-accent-foreground",
                "has-checked:border-primary has-checked:bg-primary/10 has-checked:text-foreground",
                "has-disabled:hover:bg-transparent has-disabled:hover:text-muted-foreground"
              )}
            >
              <input
                type="radio"
                name={name ?? id}
                value={ratio}
                // Its name says the shape too: "16:9, landscape".
                aria-label={`${ratio}, ${ratioShape(ratio)}`}
                checked={ratio === value}
                disabled={reason !== undefined}
                aria-describedby={reason === undefined ? undefined : `${id}-${ratio}`}
                onChange={() => {
                  pick(ratio)
                }}
                className={cn(
                  "absolute inset-0 cursor-pointer appearance-none rounded-md outline-none",
                  "focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  "disabled:pointer-events-none"
                )}
              />
              {/* A disabled ratio's frame and name are dimmed, not its reason. */}
              <svg
                viewBox={VIEW_BOX}
                aria-hidden="true"
                className={cn(compact ? "size-5" : "size-6", "group-has-disabled/option:opacity-50")}
              >
                <rect
                  x={(-shape.width * FRAME) / 2}
                  y={(-shape.height * FRAME) / 2}
                  width={shape.width * FRAME}
                  height={shape.height * FRAME}
                  rx={6}
                  className="fill-none stroke-current stroke-[8]"
                />
              </svg>
              <span className="group-has-disabled/option:opacity-50">{ratio}</span>
              {reason === undefined ? null : (
                <span
                  id={`${id}-${ratio}`}
                  data-slot="aspect-ratio-picker-reason"
                  className={cn(
                    "pointer-events-none invisible absolute bottom-full left-1/2 z-10 mb-1.5 w-max max-w-48 -translate-x-1/2 rounded-md bg-popover px-2 py-1 text-center text-xs text-popover-foreground shadow-md",
                    "group-hover/option:visible group-focus/option:visible"
                  )}
                >
                  {reason}
                </span>
              )}
            </label>
          )
        })}
      </div>
      {unavailable.length > 0 ? (
        // Keyboard users can't reach disabled ratios, so their reasons show while the group has
        // keyboard focus; screen readers hear them as the group's description.
        <div
          id={`${id}-unavailable`}
          data-slot="aspect-ratio-picker-unavailable"
          className={cn(
            "pointer-events-none invisible absolute top-full left-0 z-10 mt-1.5 max-w-80 rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md",
            "group-has-focus-visible/picker:visible"
          )}
        >
          {unavailable.map(({ ratio, reason }) => (
            <p key={ratio}>
              <span className="font-medium">{ratio}</span> can’t be picked: {reason}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  )
}
