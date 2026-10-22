// @-mentions of a prompt's references, kept pure so they're tested on their own. A mention is
// plain text: "@" and a reference's name. Names are letters, digits, "-" and "_", so a mention
// ends at the first character that can't be in a name ("@car," mentions car). An "@" right after a
// letter, a digit or another "@" starts nothing, so "me@example.com" mentions no one.

const NAME = String.raw`[\p{L}\p{N}_-]`
const AT = String.raw`(?<![\p{L}\p{N}_@-])@`

const MENTION = new RegExp(`${AT}(${NAME}+)`, "gu")
const TYPING = new RegExp(`${AT}(${NAME}*)$`, "u")
const REST_OF_NAME = new RegExp(`^${NAME}*`, "u")

export interface Mention {
  /** Where its "@" is. */
  start: number
  /** Where it ends: just past the name. */
  end: number
  name: string
}

/** Every mention in the text, in order. */
export function findMentions(text: string): Mention[] {
  return Array.from(text.matchAll(MENTION), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
    name: match[1] ?? "",
  }))
}

/** The mention being typed at the caret. */
export interface ActiveMention {
  /** Where its "@" is. */
  start: number
  /** Where its word ends, which can be past the caret. */
  end: number
  /** What's typed between the "@" and the caret: what to look references up by. */
  query: string
}

/**
 * The mention the caret is in: an "@" before it with nothing but name characters between, like
 * "@ca|r". Null anywhere else, so the reference list shows only while a mention is typed.
 */
export function activeMention(text: string, caret: number): ActiveMention | null {
  const typed = TYPING.exec(text.slice(0, caret))
  if (!typed) return null
  const rest = REST_OF_NAME.exec(text.slice(caret))?.[0] ?? ""
  return { start: typed.index, end: caret + rest.length, query: typed[1] ?? "" }
}

/**
 * Replaces the mention being typed, the whole word, with "@name", and says where the caret goes:
 * after it, or after a space when the mention ends the text, so typing can go on.
 */
export function insertMention(text: string, mention: ActiveMention, name: string) {
  const inserted = mention.end === text.length ? `@${name} ` : `@${name}`
  return {
    text: text.slice(0, mention.start) + inserted + text.slice(mention.end),
    caret: mention.start + inserted.length,
  }
}

/** The references the text mentions, in the references' own order. Names match ignoring case. */
export function mentionedReferences<Reference extends { name: string }>(
  text: string,
  references: Reference[]
) {
  const names = new Set(findMentions(text).map((mention) => mention.name.toLowerCase()))
  return references.filter((reference) => names.has(reference.name.toLowerCase()))
}

/** The references to offer for a query: names that start with it, then names that contain it. */
export function matchReferences<Reference extends { name: string }>(
  references: Reference[],
  query: string
) {
  const lower = query.toLowerCase()
  const starts = references.filter((reference) => reference.name.toLowerCase().startsWith(lower))
  const contains = references.filter(
    (reference) => !starts.includes(reference) && reference.name.toLowerCase().includes(lower)
  )
  return [...starts, ...contains]
}

/**
 * A name for a reference made from a file: the file's name without its extension, lowercased,
 * with every run of characters that can't be in a name turned into one "-" and none at the ends,
 * and at most 32 characters: "Red Car (2).PNG" is "red-car-2". "image" when nothing is left; "-2",
 * "-3"… when the name is taken, ignoring case.
 */
export function referenceName(fileName: string, taken: string[]) {
  const name =
    fileName
      .replace(/\.[^.]*$/, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_]+/gu, "-")
      .slice(0, 32)
      .replace(/^-+|-+$/g, "") || "image"
  const names = new Set(taken.map((other) => other.toLowerCase()))
  if (!names.has(name)) return name
  let number = 2
  while (names.has(`${name}-${String(number)}`)) number++
  return `${name}-${String(number)}`
}
