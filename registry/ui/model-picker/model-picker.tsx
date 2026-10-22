"use client"

import { Fragment, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/registry/hooks/use-reduced-motion"
import {
  estimateCost,
  formatEstimate,
  formatPrice,
  type CostSettings,
  type ModelPrice,
} from "@/registry/lib/estimate-cost"
import { badgesOf, filterModels, groupModels } from "./model-filter"

export interface ModelOption {
  /** Unique among the models: what `value` and `onValueChange` carry. */
  id: string
  /** The model's name, as people search for it. */
  name: string
  /** Whether it makes images or videos: the first badge. */
  kind: "image" | "video"
  /** What it costs. Every option shows its estimate for the current `settings`. */
  price: ModelPrice
  /** The resolutions it makes, shown as badges: `["720p", "1080p"]`. */
  resolutions?: string[]
  /**
   * The clip lengths it makes, in seconds, shown as badges. The first one is used for the
   * estimate when `settings` has no duration.
   */
  durations?: number[]
  /** How fast it is, shown as a badge: `"Fast"`. */
  speed?: string
  /** More words to find it by, like its maker. */
  keywords?: string[]
}

export interface ModelPickerProps {
  /** The models to choose from, in the order to list them. */
  models: ModelOption[]
  /** The chosen model's id, when you control it. */
  value?: string
  /**
   * The model chosen at first, when the picker keeps its own value.
   *
   * @defaultValue the first model
   */
  defaultValue?: string
  /** Called with the id of the model the user chooses. */
  onValueChange?: (value: string) => void
  /** The run's settings (duration, count, references), which every option's estimate is for. */
  settings?: CostSettings
  /** Groups the list under headings: return each model's group, like `"Video"`. */
  groupBy?: (model: ModelOption) => string
  /**
   * The locale prices are written in.
   *
   * @defaultValue "en-US"
   */
  locale?: string
  disabled?: boolean
  /**
   * The id of an element that names the picker. The button's name is that label and the chosen
   * model; without it, "Model" and the chosen model.
   */
  "aria-labelledby"?: string
  /** Classes for the button that opens the list. */
  className?: string
}

const TOKENS = ["--genframe-duration-fast", "--genframe-duration-base", "--genframe-ease-out"]

// The list opens in a portal at the end of the page, outside whatever retimed the motion tokens
// around the button (the docs' slow motion, an app's own). It takes the button's values along.
function motionTokensAt(element: Element) {
  const style = getComputedStyle(element)
  const tokens: Record<string, string> = {}
  for (const token of TOKENS) {
    const value = style.getPropertyValue(token).trim()
    if (value) tokens[token] = value
  }
  return tokens as CSSProperties
}

// cmdk 1.1.1 leaves the search box without aria-activedescendant when the list opens on the
// current model, and after the active model is filtered out (it looks for the active option
// before the options have re-rendered); and it says aria-expanded="true" with no option left.
// This keeps both in step with the list, whenever either changes.
function followActiveOption(root: HTMLDivElement) {
  const search = root.querySelector("[cmdk-input]")
  const list = root.querySelector("[cmdk-list]")
  if (!search || !list) return
  // Only real changes: a write would be a mutation, and wake the observer again.
  const set = (name: string, value: string | null) => {
    if (search.getAttribute(name) === value) return
    if (value === null) search.removeAttribute(name)
    else search.setAttribute(name, value)
  }
  const sync = () => {
    const active = list.querySelector('[role="option"][aria-selected="true"]')
    set("aria-activedescendant", active ? active.id : null)
    set("aria-expanded", String(list.querySelector('[role="option"]') !== null))
  }
  sync()
  const observer = new MutationObserver(sync)
  observer.observe(list, { subtree: true, childList: true, attributeFilter: ["aria-selected"] })
  observer.observe(search, { attributeFilter: ["aria-activedescendant", "aria-expanded"] })
  return () => {
    observer.disconnect()
  }
}

/**
 * A searchable list of models with their badges, prices and an estimate for the current
 * settings. A button opens a popover with a search box and the list: the combobox pattern, on
 * shadcn's popover and command.
 */
export function ModelPicker({
  models,
  value: controlledValue,
  defaultValue,
  onValueChange,
  settings,
  groupBy,
  locale = "en-US",
  disabled,
  "aria-labelledby": ariaLabelledby,
  className,
}: ModelPickerProps) {
  const reduced = useReducedMotion()
  const id = useId()
  const [ownValue, setOwnValue] = useState(() => defaultValue ?? models[0]?.id)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [tokens, setTokens] = useState<CSSProperties>()
  const trigger = useRef<HTMLButtonElement>(null)
  const value = controlledValue ?? ownValue
  const chosen = models.find((model) => model.id === value)
  const name = chosen?.name ?? "Choose a model"
  const matches = filterModels(models, query)

  function changeOpen(next: boolean) {
    if (next && trigger.current) setTokens(motionTokensAt(trigger.current))
    if (!next) setQuery("")
    setOpen(next)
  }

  function choose(modelId: string) {
    if (controlledValue === undefined) setOwnValue(modelId)
    onValueChange?.(modelId)
    changeOpen(false)
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    event.preventDefault()
    changeOpen(true)
  }

  function item(model: ModelOption) {
    return (
      <ModelItem
        key={model.id}
        model={model}
        chosen={model.id === value}
        settings={settings}
        locale={locale}
        onSelect={() => {
          choose(model.id)
        }}
      />
    )
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={trigger}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabelledby ? undefined : `Model: ${name}`}
          aria-labelledby={ariaLabelledby ? `${ariaLabelledby} ${id}-value` : undefined}
          data-slot="model-picker"
          className={cn("max-w-full justify-start gap-2", className)}
          onKeyDown={onTriggerKeyDown}
        >
          {chosen ? <KindIcon kind={chosen.kind} /> : null}
          <span id={`${id}-value`} className="truncate">
            {name}
          </span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="ml-auto size-4 shrink-0 opacity-50"
          >
            <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />
          </svg>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label="Models"
        data-motion={reduced ? "reduce" : undefined}
        data-slot="model-picker-content"
        style={tokens}
        className={cn(
          "w-96 max-w-[calc(100vw-2rem)] gap-0 p-0",
          // shadcn's own fade and zoom, on the motion tokens; with reduced motion, none.
          "duration-(--genframe-duration-fast) ease-(--genframe-ease-out) data-[motion=reduce]:animate-none!"
        )}
      >
        <Command
          ref={followActiveOption}
          shouldFilter={false}
          loop
          vimBindings={false}
          label="Search models"
          defaultValue={value}
        >
          <CommandInput value={query} onValueChange={setQuery} placeholder="Search models" />
          {/* A listbox must hold options. When none match, the list is hidden and the message shows
              beside it: cmdk's own empty message sits inside the list, which then holds no option
              (axe calls that critical). */}
          <CommandList label="Models" hidden={matches.length === 0}>
            {groupBy
              ? groupModels(matches, groupBy).map((group) => (
                  <CommandGroup key={group.name} heading={group.name}>
                    {group.models.map(item)}
                  </CommandGroup>
                ))
              : matches.map(item)}
          </CommandList>
          {matches.length === 0 ? (
            <p data-slot="model-picker-empty" className="py-6 text-center text-sm">
              {models.length === 0 ? "No models" : `No models match “${query}”`}
            </p>
          ) : null}
        </Command>
        {/* cmdk's empty message isn't announced. */}
        <p role="status" className="sr-only">
          {matches.length === 0 && query ? `No models match ${query}` : ""}
        </p>
      </PopoverContent>
    </Popover>
  )
}

function ModelItem({
  model,
  chosen,
  settings,
  locale,
  onSelect,
}: {
  model: ModelOption
  chosen: boolean
  settings: CostSettings | undefined
  locale: string
  onSelect: () => void
}) {
  const id = useId()
  const estimate = estimateCost(model, {
    ...settings,
    duration: settings?.duration ?? model.durations?.[0],
  })
  const cost = estimate ? formatEstimate(estimate, locale) : null

  return (
    <CommandItem
      value={model.id}
      onSelect={onSelect}
      // shadcn's item shows its check mark for data-checked.
      data-checked={chosen}
      // Named by everything it shows, in order, so the name holds the visible text (WCAG's label
      // in name); then "(current)" for the chosen one.
      aria-labelledby={`${id}-name ${id}-badges ${id}-price${chosen ? ` ${id}-current` : ""}`}
      data-slot="model-picker-option"
      className="items-start gap-2.5 py-2"
    >
      {/* The spaces between the parts keep their words apart for screen readers and checkers;
          flex layout drops them. */}
      <KindIcon kind={model.kind} className="mt-0.5" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span id={`${id}-name`} className="truncate font-medium">
          {model.name}
        </span>{" "}
        <span id={`${id}-badges`} className="flex flex-wrap gap-1">
          {badgesOf(model).map((badge, index) => (
            <Fragment key={badge}>
              {index > 0 ? " " : null}
              <span className="rounded-sm border px-1 text-[0.6875rem] leading-4 text-muted-foreground">
                {badge}
              </span>
            </Fragment>
          ))}
        </span>
      </span>{" "}
      <span id={`${id}-price`} className="flex shrink-0 flex-col items-end gap-1 tabular-nums">
        <span className="font-medium">{cost ? cost.total : formatPrice(model.price, locale)}</span>
        {cost ? (
          <>
            {" "}
            <span className="text-xs text-muted-foreground">{cost.breakdown}</span>
          </>
        ) : null}
      </span>
      {chosen ? (
        <>
          {" "}
          <span id={`${id}-current`} className="sr-only">
            (current)
          </span>
        </>
      ) : null}
    </CommandItem>
  )
}

function KindIcon({ kind, className }: { kind: ModelOption["kind"]; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("size-4 shrink-0 text-muted-foreground", className)}
    >
      {kind === "image" ? (
        <>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
        </>
      ) : (
        <>
          <rect x="2" y="6" width="14" height="12" rx="2" />
          <path d="m16 13 5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 11" />
        </>
      )}
    </svg>
  )
}
