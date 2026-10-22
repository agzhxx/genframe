"use client"

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/registry/hooks/use-reduced-motion"
import {
  activeMention,
  insertMention,
  matchReferences,
  mentionedReferences,
  referenceName,
} from "./mentions"

export interface PromptReference {
  /** Unique among the references. */
  id: string
  /** What mentions call it: `car` for `@car`. Letters, digits, "-" and "_"; unique, ignoring case. */
  name: string
  /** The image's URL, for references your app already has. */
  src?: string
  /**
   * The image file, for references the user added. The composer shows it through an object URL,
   * which it revokes when the reference is removed.
   */
  file?: File
  /**
   * The thumbnail's alt text.
   *
   * @defaultValue "" (the name is written under it)
   */
  alt?: string
}

export interface PresetGroup {
  /** The group's name, shown before its chips: "Camera". */
  label: string
  /** Its presets. Every `id` is unique across all the groups. */
  presets: { id: string; label: string }[]
}

export interface PromptSubmission {
  /** The prompt, mentions and all. */
  text: string
  /** Every reference image, mentioned or not. */
  references: PromptReference[]
  /** The ids of the presets that are on, in the order of `presets`. */
  presets: string[]
}

export interface PromptComposerProps {
  /** The prompt, when you control it. */
  value?: string
  /**
   * The prompt at first, when the composer keeps its own.
   *
   * @defaultValue ""
   */
  defaultValue?: string
  /** Called with the prompt as it changes. */
  onValueChange?: (value: string) => void
  placeholder?: string
  /**
   * A limit for the prompt's length (`value.length`). Past it, the count turns red and the prompt
   * can't be submitted; near it, screen readers hear how many characters are left.
   */
  maxLength?: number
  /** The reference images, when you control them. */
  references?: PromptReference[]
  /** The reference images at first, when the composer keeps its own. */
  defaultReferences?: PromptReference[]
  /**
   * Called with the reference images as the user adds and removes them. Nothing is uploaded: the
   * files stay in the browser until you send them.
   */
  onReferencesChange?: (references: PromptReference[]) => void
  /**
   * How many reference images fit; 0 leaves them out.
   *
   * @defaultValue no limit
   */
  maxReferences?: number
  /** Preset chips, in groups such as camera moves and styles. */
  presets?: PresetGroup[]
  /** The ids of the presets that are on, when you control them. */
  selectedPresets?: string[]
  /** The presets that are on at first, when the composer keeps its own. */
  defaultSelectedPresets?: string[]
  /** Called with the ids of the presets that are on, in the order of `presets`. */
  onSelectedPresetsChange?: (presets: string[]) => void
  /** Controls for the footer, like a model picker and an aspect-ratio picker. */
  toolbar?: ReactNode
  /** What a run costs, shown before the submit button, which it describes for screen readers. */
  costHint?: ReactNode
  /** Called with the prompt, its references and presets on Cmd/Ctrl+Enter or the submit button. */
  onSubmit?: (submission: PromptSubmission) => void
  /**
   * Enter submits and Shift+Enter adds a line, instead of Cmd/Ctrl+Enter submitting and Enter
   * adding a line.
   *
   * @defaultValue false
   */
  submitOnEnter?: boolean
  /**
   * The submit button's label.
   *
   * @defaultValue "Generate"
   */
  submitLabel?: string
  /** Disables everything inside, the toolbar's controls too. */
  disabled?: boolean
  /** A submission is on its way: the composer says it's busy and can't submit again. */
  loading?: boolean
  /**
   * The prompt box's accessible name.
   *
   * @defaultValue "Prompt"
   */
  "aria-label"?: string
  /** The id of an element that names the prompt box, instead of `aria-label`. */
  "aria-labelledby"?: string
  className?: string
}

// A value the parent controls (`value` given) or leaves to the component (`defaultValue`).
function useControllable<T>(
  value: T | undefined,
  defaultValue: T,
  onChange: ((value: T) => void) | undefined
) {
  const [own, setOwn] = useState(defaultValue)
  function set(next: T) {
    if (value === undefined) setOwn(next)
    onChange?.(next)
  }
  return [value ?? own, set] as const
}

function plural(count: number, one: string, many: string) {
  return `${String(count)} ${count === 1 ? one : many}`
}

/**
 * A prompt box built for generation: text that grows with the prompt, @-mentions of reference
 * images, preset chips, a character count, and a footer for the toolbar, the cost and the submit
 * button.
 */
export function PromptComposer({
  value,
  defaultValue,
  onValueChange,
  placeholder,
  maxLength,
  references: controlledReferences,
  defaultReferences,
  onReferencesChange,
  maxReferences,
  presets = [],
  selectedPresets,
  defaultSelectedPresets,
  onSelectedPresetsChange,
  toolbar,
  costHint,
  onSubmit,
  submitOnEnter = false,
  submitLabel = "Generate",
  disabled = false,
  loading = false,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  className,
}: PromptComposerProps) {
  const reduced = useReducedMotion()
  const id = useId()
  const [text, setText] = useControllable(value, defaultValue ?? "", onValueChange)
  const [references, setReferences] = useControllable(
    controlledReferences,
    defaultReferences ?? [],
    onReferencesChange
  )
  const [selected, setSelected] = useControllable(
    selectedPresets,
    defaultSelectedPresets ?? [],
    onSelectedPresetsChange
  )
  // Where the caret is while the box has focus and nothing is selected; null otherwise.
  const [caret, setCaret] = useState<number | null>(null)
  // The mention ("start:query") whose list Esc closed, or that was just inserted.
  const [dismissed, setDismissed] = useState("")
  const [active, setActive] = useState({ mention: "", index: 0 })
  // References the user added here, which grow into place; the first ones don't.
  const [added, setAdded] = useState<ReadonlySet<string>>(() => new Set())
  const [dragging, setDragging] = useState(false)
  const [message, setMessage] = useState("")
  const box = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const removeButtons = useRef(new Map<string, HTMLButtonElement>())
  const nextCaret = useRef<number | null>(null)
  const nextFocus = useRef<(() => HTMLElement | null | undefined) | null>(null)
  const addedCount = useRef(0)

  const referencesOn = maxReferences !== 0
  const room = maxReferences === undefined ? Infinity : maxReferences - references.length
  const canAdd = referencesOn && !disabled && room > 0
  const mentionable = referencesOn && references.length > 0
  const mention = mentionable && caret !== null ? activeMention(text, caret) : null
  const mentionKey = mention ? `${String(mention.start)}:${mention.query}` : ""
  const matches = mention ? matchReferences(references, mention.query) : []
  const open = matches.length > 0 && dismissed !== mentionKey
  const activeIndex = active.mention === mentionKey ? Math.min(active.index, matches.length - 1) : 0
  const mentioned = new Set(mentionedReferences(text, references).map((reference) => reference.id))
  const presetIds = presets.flatMap((group) => group.presets.map((preset) => preset.id))
  const over = maxLength !== undefined && text.length > maxLength
  const canSubmit = !disabled && !loading && !over && text.trim() !== ""

  // Near the limit (the last tenth), screen readers hear how many characters are left, once
  // typing pauses rather than at every key.
  const left = maxLength === undefined ? null : maxLength - text.length
  const countNote =
    maxLength === undefined || left === null || left > Math.ceil(maxLength / 10)
      ? ""
      : left < 0
        ? `${plural(-left, "character", "characters")} too many`
        : `${plural(left, "character", "characters")} left`
  useEffect(() => {
    if (!countNote) return
    const timer = setTimeout(() => {
      setMessage(countNote)
    }, 1000)
    return () => {
      clearTimeout(timer)
    }
  }, [countNote])

  // Where the caret goes after a mention is inserted, and where focus goes after a removal.
  useLayoutEffect(() => {
    if (nextCaret.current !== null) {
      box.current?.setSelectionRange(nextCaret.current, nextCaret.current)
      nextCaret.current = null
    }
    if (nextFocus.current) {
      nextFocus.current()?.focus()
      nextFocus.current = null
    }
  })

  // Browsers without CSS field-sizing grow the box from JavaScript.
  useLayoutEffect(() => {
    const element = box.current
    if (!element || CSS.supports("field-sizing", "content")) return
    element.style.height = "auto"
    element.style.height = `${String(element.scrollHeight)}px`
  }, [text])

  function track(event: SyntheticEvent<HTMLTextAreaElement>) {
    const { value: current, selectionStart, selectionEnd } = event.currentTarget
    const next = selectionStart === selectionEnd ? selectionStart : null
    setCaret(next)
    if (next === null || !activeMention(current, next)) setDismissed("")
  }

  function onChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setText(event.currentTarget.value)
    track(event)
  }

  function insert(index: number) {
    const reference = matches[index]
    if (!mention || !reference) return
    const next = insertMention(text, mention, reference.name)
    setText(next.text)
    setCaret(next.caret)
    nextCaret.current = next.caret
    // The caret may still be in the mention, which needs no list now.
    setDismissed(`${String(mention.start)}:${reference.name}`)
  }

  function submit() {
    if (!canSubmit) return
    onSubmit?.({
      text,
      references,
      presets: presetIds.filter((presetId) => selected.includes(presetId)),
    })
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Keys that pick characters in an input method (IME) are its own. Safari ends the composition
    // before the Enter's keydown, which then says isComposing: false; only its legacy keyCode,
    // 229, gives it away.
    const { isComposing, keyCode } = event.nativeEvent as { isComposing: boolean; keyCode: number }
    if (isComposing || keyCode === 229) return
    const modified = event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
    if (open && !modified) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        const step = event.key === "ArrowDown" ? 1 : matches.length - 1
        setActive({ mention: mentionKey, index: (activeIndex + step) % matches.length })
        return
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault()
        insert(activeIndex)
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        setDismissed(mentionKey)
        return
      }
    }
    if (event.key !== "Enter") return
    if (submitOnEnter ? event.shiftKey : !(event.metaKey || event.ctrlKey)) return
    event.preventDefault()
    submit()
  }

  function addFiles(files: File[]) {
    const images = files.filter((file) => file.type.startsWith("image/"))
    const names = references.map((reference) => reference.name)
    const fresh = images.slice(0, Math.max(0, room)).map((file) => {
      const name = referenceName(file.name, names)
      names.push(name)
      addedCount.current += 1
      return { id: `${id}-${String(addedCount.current)}`, name, file }
    })
    if (fresh.length > 0) {
      setReferences([...references, ...fresh])
      setAdded(new Set([...added, ...fresh.map((reference) => reference.id)]))
    }
    const notes = []
    if (fresh.length > 0) notes.push(`Added ${fresh.map((reference) => `@${reference.name}`).join(", ")}`)
    if (images.length > fresh.length) {
      notes.push(`No room for ${plural(images.length - fresh.length, "more image", "more images")}`)
    }
    if (files.length > images.length) {
      notes.push(`Skipped ${plural(files.length - images.length, "file", "files")}: not an image`)
    }
    setMessage(notes.join(". "))
  }

  function remove(reference: PromptReference) {
    const index = references.indexOf(reference)
    const rest = references.filter((other) => other !== reference)
    const neighbour = rest[index] ?? rest[index - 1]
    // Focus goes to the next reference, or the previous one, or the add button, or the prompt.
    nextFocus.current = () =>
      (neighbour && removeButtons.current.get(neighbour.id)) ?? addButton.current ?? box.current
    setReferences(rest)
    setMessage(`Removed @${reference.name}`)
  }

  function togglePreset(presetId: string) {
    const next = selected.includes(presetId)
      ? selected.filter((other) => other !== presetId)
      : [...selected, presetId]
    setSelected(presetIds.filter((other) => next.includes(other)))
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files)
    if (!referencesOn || files.length === 0) return
    event.preventDefault()
    addFiles(files)
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!referencesOn || disabled || !event.dataTransfer.types.includes("Files")) return
    event.preventDefault()
    setDragging(true)
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    // Moving onto a child isn't leaving.
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
    setDragging(false)
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    if (!referencesOn || disabled || !event.dataTransfer.types.includes("Files")) return
    event.preventDefault()
    setDragging(false)
    addFiles(Array.from(event.dataTransfer.files))
  }

  return (
    <fieldset
      data-slot="prompt-composer"
      data-motion={reduced ? "reduce" : undefined}
      disabled={disabled}
      aria-busy={loading || undefined}
      className={cn("min-w-0", className)}
    >
      <div
        data-slot="prompt-composer-box"
        className={cn(
          "relative rounded-xl border bg-background shadow-xs",
          "has-[textarea:focus-visible]:border-ring has-[textarea:focus-visible]:ring-[3px] has-[textarea:focus-visible]:ring-ring/50",
          over && "border-destructive",
          disabled && "opacity-60"
        )}
        onDragEnter={onDragOver}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className="relative">
          <textarea
            ref={box}
            value={text}
            placeholder={placeholder}
            aria-label={ariaLabelledby ? undefined : (ariaLabel ?? "Prompt")}
            aria-labelledby={ariaLabelledby}
            aria-describedby={maxLength === undefined ? undefined : `${id}-count`}
            aria-invalid={over || undefined}
            // A textarea can't take role="combobox", nor aria-expanded; it keeps its own role and
            // points at the reference list the same way.
            aria-autocomplete={mentionable ? "list" : undefined}
            aria-haspopup={mentionable ? "listbox" : undefined}
            aria-controls={mentionable ? `${id}-mentions` : undefined}
            aria-activedescendant={open ? `${id}-mention-${String(activeIndex)}` : undefined}
            data-slot="prompt-composer-text"
            className="block field-sizing-content max-h-64 min-h-20 w-full resize-none bg-transparent px-3 pt-3 pb-2 text-base outline-none placeholder:text-muted-foreground md:text-sm"
            onChange={onChange}
            onSelect={track}
            onFocus={track}
            onBlur={() => {
              setCaret(null)
            }}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
          />
          {mentionable ? (
            <div
              id={`${id}-mentions`}
              role="listbox"
              aria-label="References"
              hidden={!open}
              data-slot="prompt-composer-mentions"
              className={cn(
                "absolute top-full left-2 z-20 mt-1 w-64 max-w-[calc(100%-1rem)] rounded-lg border bg-popover p-1 text-popover-foreground shadow-md",
                // It drops into place; with reduced motion, it only fades in.
                "transition-[opacity,transform] duration-(--genframe-duration-fast) ease-(--genframe-ease-out) starting:-translate-y-1 starting:opacity-0",
                "in-data-[motion=reduce]:transition-opacity"
              )}
              // Focus stays in the prompt.
              onPointerDown={(event) => {
                event.preventDefault()
              }}
            >
              {matches.map((reference, index) => (
                <div
                  key={reference.id}
                  id={`${id}-mention-${String(index)}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-muted"
                  onPointerMove={() => {
                    if (index !== activeIndex) setActive({ mention: mentionKey, index })
                  }}
                  onClick={() => {
                    insert(index)
                  }}
                >
                  {/* The option's name is the mention: its image is decoration here. */}
                  <Thumbnail reference={reference} alt="" className="size-6 rounded-sm object-cover" />
                  <span>@{reference.name}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {referencesOn && (references.length > 0 || canAdd) ? (
          <ul
            aria-label="References"
            data-slot="prompt-composer-references"
            className="flex flex-wrap gap-3 px-3 pb-3"
          >
            {references.map((reference) => {
              const isMentioned = mentioned.has(reference.id)
              return (
                <li
                  key={reference.id}
                  data-mentioned={isMentioned ? "" : undefined}
                  className={cn(
                    "group/slot relative w-14",
                    // A new reference grows into place; with reduced motion, it fades in.
                    added.has(reference.id) &&
                      "transition-[opacity,transform] duration-(--genframe-duration-base) ease-(--genframe-ease-out) starting:scale-90 starting:opacity-0 in-data-[motion=reduce]:transition-opacity"
                  )}
                >
                  <div className="relative size-14 overflow-hidden rounded-md border bg-muted">
                    <Thumbnail reference={reference} className="size-full object-cover" />
                    {/* Mentioned references are ringed; the ring fades in, or appears with reduced motion. */}
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 rounded-md opacity-0 ring-2 ring-primary ring-inset transition-opacity duration-(--genframe-duration-fast) ease-(--genframe-ease-out) group-data-mentioned/slot:opacity-100 in-data-[motion=reduce]:transition-none"
                    />
                  </div>
                  <span className="mt-1 block truncate text-center text-[0.6875rem] leading-4 text-muted-foreground group-data-mentioned/slot:text-primary">
                    @{reference.name}
                    {isMentioned ? <span className="sr-only">, mentioned</span> : null}
                  </span>
                  <button
                    type="button"
                    ref={(button) => {
                      if (!button) return
                      removeButtons.current.set(reference.id, button)
                      return () => {
                        removeButtons.current.delete(reference.id)
                      }
                    }}
                    aria-label={`Remove @${reference.name}`}
                    data-slot="prompt-composer-remove"
                    className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full border bg-background text-muted-foreground shadow-xs outline-none hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    onClick={() => {
                      remove(reference)
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Delete" && event.key !== "Backspace") return
                      event.preventDefault()
                      remove(reference)
                    }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      aria-hidden="true"
                      className="size-3"
                    >
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </li>
              )
            })}
            {canAdd ? (
              <li>
                <button
                  ref={addButton}
                  type="button"
                  aria-label="Add reference images"
                  title="Add reference images, or drop or paste them"
                  data-slot="prompt-composer-add"
                  className="grid size-14 place-items-center rounded-md border border-dashed text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  onClick={() => fileInput.current?.click()}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    aria-hidden="true"
                    className="size-5"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(event) => {
                    addFiles(Array.from(event.currentTarget.files ?? []))
                    // The same file can be picked again.
                    event.currentTarget.value = ""
                  }}
                />
              </li>
            ) : null}
          </ul>
        ) : null}

        {presets.length > 0 ? (
          <div data-slot="prompt-composer-presets" className="flex flex-col gap-2 px-3 pb-3">
            {presets.map((group, groupIndex) => (
              <div
                key={group.label}
                role="group"
                aria-labelledby={`${id}-presets-${String(groupIndex)}`}
                className="flex flex-wrap items-center gap-1.5"
              >
                <span
                  id={`${id}-presets-${String(groupIndex)}`}
                  className="mr-1 text-xs text-muted-foreground"
                >
                  {group.label}
                </span>
                {group.presets.map((preset) => (
                  <label
                    key={preset.id}
                    data-slot="prompt-composer-preset"
                    className={cn(
                      "group/chip relative inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs text-muted-foreground",
                      "hover:bg-accent hover:text-accent-foreground",
                      "has-checked:border-primary has-checked:bg-primary/15 has-checked:text-foreground"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(preset.id)}
                      onChange={() => {
                        togglePreset(preset.id)
                      }}
                      className="absolute inset-0 cursor-pointer appearance-none rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-default"
                    />
                    {/* A check mark too, so it isn't told by color alone. */}
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className="hidden size-3 group-has-checked/chip:block"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    {preset.label}
                  </label>
                ))}
              </div>
            ))}
          </div>
        ) : null}

        <div
          data-slot="prompt-composer-footer"
          className="flex flex-wrap items-center gap-2 border-t px-2 py-2"
        >
          {toolbar ? (
            <div data-slot="prompt-composer-toolbar" className="flex flex-wrap items-center gap-2">
              {toolbar}
            </div>
          ) : null}
          <div className="ml-auto flex items-center gap-3">
            {maxLength === undefined ? null : (
              <span
                id={`${id}-count`}
                data-slot="prompt-composer-count"
                className={cn("text-xs text-muted-foreground tabular-nums", over && "text-destructive")}
              >
                <span aria-hidden="true">
                  {text.length}/{maxLength}
                </span>
                <span className="sr-only">
                  {text.length} of {maxLength} characters
                </span>
              </span>
            )}
            {costHint === undefined ? null : (
              <span
                id={`${id}-cost`}
                data-slot="prompt-composer-cost"
                className="text-xs text-muted-foreground tabular-nums"
              >
                {costHint}
              </span>
            )}
            <Button
              type="button"
              size="sm"
              disabled={!canSubmit}
              aria-describedby={costHint === undefined ? undefined : `${id}-cost`}
              aria-keyshortcuts={submitOnEnter ? "Enter" : "Control+Enter Meta+Enter"}
              data-slot="prompt-composer-submit"
              onClick={submit}
            >
              {loading ? (
                // It turns while busy; with reduced motion, it stays still.
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                  className="size-3.5 animate-spin in-data-[motion=reduce]:animate-none"
                >
                  <path d="M21 12a9 9 0 1 1-6.2-8.56" />
                </svg>
              ) : null}
              {submitLabel}
            </Button>
          </div>
        </div>

        {dragging ? (
          <div
            aria-hidden="true"
            data-slot="prompt-composer-drop"
            className="pointer-events-none absolute inset-0 z-30 grid place-items-center rounded-xl border-2 border-dashed border-primary bg-background/85 p-4 text-center text-sm font-medium transition-opacity duration-(--genframe-duration-fast) ease-(--genframe-ease-out) starting:opacity-0 in-data-[motion=reduce]:transition-none"
          >
            {canAdd ? "Drop images to add them as references" : "No room for more references"}
          </div>
        ) : null}
      </div>

      <div role="status" className="sr-only">
        {open
          ? `${plural(matches.length, "reference matches", "references match")}: up and down arrows to choose, Enter to insert`
          : ""}
      </div>
      <div role="status" className="sr-only">
        {message}
      </div>
    </fieldset>
  )
}

function Thumbnail({
  reference,
  alt = reference.alt ?? "",
  className,
}: {
  reference: PromptReference
  alt?: string
  className?: string
}) {
  const { file } = reference
  // A file shows through an object URL that lives as long as this image does.
  const showFile = useCallback(
    (image: HTMLImageElement | null) => {
      if (!image || !file) return
      const url = URL.createObjectURL(file)
      image.src = url
      return () => {
        URL.revokeObjectURL(url)
      }
    },
    [file]
  )
  return reference.src ? (
    <img src={reference.src} alt={alt} draggable={false} className={className} />
  ) : (
    <img ref={showFile} alt={alt} draggable={false} className={className} />
  )
}
