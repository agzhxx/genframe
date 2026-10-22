// The model picker's search and grouping, kept pure so they're tested on their own.

import type { ModelOption } from "./model-picker"

/** A model's badges, in the order they're shown: its kind, resolutions, clip lengths and speed. */
export function badgesOf(model: ModelOption) {
  return [
    model.kind === "image" ? "Image" : "Video",
    ...(model.resolutions ?? []),
    ...(model.durations ?? []).map((seconds) => `${String(seconds)} s`),
    ...(model.speed ? [model.speed] : []),
  ]
}

// Everything a model is found by, lowercased, with clip lengths written "5s".
function searchText(model: ModelOption) {
  const durations = (model.durations ?? []).map((seconds) => `${String(seconds)}s`)
  return [model.name, ...badgesOf(model), ...durations, ...(model.keywords ?? [])]
    .join(" ")
    .toLowerCase()
}

/**
 * The models with every word of the query somewhere in their name, badges or keywords, ignoring
 * case: "kling 1080p" finds Kling at 1080p. In their own order; all of them for an empty query.
 * "10 s" is one word, "10s", or its "s" would find every model with an s in its name.
 */
export function filterModels(models: ModelOption[], query: string) {
  const words = query
    .toLowerCase()
    .replace(/(\d)\s+s\b/g, "$1s")
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return models
  return models.filter((model) => {
    const text = searchText(model)
    return words.every((word) => text.includes(word))
  })
}

export interface ModelGroup {
  /** The group's heading; "" for the one group of an ungrouped list. */
  name: string
  models: ModelOption[]
}

/** The models in groups, in the order each group first appears; one group without `groupBy`. */
export function groupModels(
  models: ModelOption[],
  groupBy?: (model: ModelOption) => string
): ModelGroup[] {
  const groups = new Map<string, ModelOption[]>()
  for (const model of models) {
    const name = groupBy ? groupBy(model) : ""
    groups.set(name, [...(groups.get(name) ?? []), model])
  }
  return Array.from(groups, ([name, members]) => ({ name, models: members }))
}
