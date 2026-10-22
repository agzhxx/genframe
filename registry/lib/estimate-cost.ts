// What a generation will cost, from a model's price and the run's settings. The arithmetic is
// exact: every number becomes an integer count of a power of ten (0.042 is 42 thousandths), so
// 5 × $0.042 is $0.21, not the floating-point $0.21000000000000002. The total is rounded once, at
// the end, to the currency's smallest unit. formatEstimate words an estimate for a UI.

/** What a price is for: a second of video, one image, or one whole video. */
export type PriceUnit = "second" | "image" | "video"

export interface ModelPrice {
  /** What one unit costs, in the currency's main unit: 0.042 is 4.2 cents. */
  amount: number
  /** What the amount buys: a second of video, one image, or one video. */
  unit: PriceUnit
  /**
   * The currency, as an ISO 4217 code.
   *
   * @defaultValue "USD"
   */
  currency?: string
  /** What each reference image adds to every image or video the run makes. */
  perReference?: number
}

export interface CostSettings {
  /** Seconds of video. Prices per second need it. */
  duration?: number
  /**
   * How many images or videos the run makes.
   *
   * @defaultValue 1
   */
  count?: number
  /**
   * How many reference images go with the run.
   *
   * @defaultValue 0
   */
  references?: number
}

/** One part of an estimate: so many units at a price. */
export interface CostLine {
  /** What's counted: seconds, images, videos, or reference images. */
  unit: PriceUnit | "reference"
  /** How many: two 5-second videos are 10 seconds. */
  quantity: number
  /** What one costs. */
  unitPrice: number
  /** `quantity` × `unitPrice`, exact. */
  amount: number
}

export interface CostEstimate {
  /** The parts of the total: the units, then the reference images when they cost anything. */
  lines: CostLine[]
  /** The lines added up, exact: 0.105. */
  subtotal: number
  /** The subtotal rounded once, half up, to the currency's smallest unit: 0.11 in dollars. */
  total: number
  /** The ISO 4217 code of both. */
  currency: string
}

// A decimal number as an integer and a power of ten: 0.042 is 42 × 10^-3, { units: 42n, scale: 3 }.
interface Decimal {
  units: bigint
  scale: number
}

function toDecimal(value: number, name: string): Decimal {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite number, 0 or more: got ${String(value)}`)
  }
  // String() gives the shortest digits that read back as the same number: 0.042 → "0.042",
  // 0.0000001 → "1e-7". Those digits are the decimal the number was written as.
  const [digits = "", exponent = "0"] = String(value).split("e")
  const [whole = "", fraction = ""] = digits.split(".")
  const scale = fraction.length - Number(exponent)
  const units = BigInt(whole + fraction)
  return scale < 0 ? { units: units * 10n ** BigInt(-scale), scale: 0 } : { units, scale }
}

function wholeNumber(value: number, name: string): Decimal {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a whole number, 0 or more: got ${String(value)}`)
  }
  return { units: BigInt(value), scale: 0 }
}

function multiply(a: Decimal, b: Decimal): Decimal {
  return { units: a.units * b.units, scale: a.scale + b.scale }
}

function add(a: Decimal, b: Decimal): Decimal {
  const scale = Math.max(a.scale, b.scale)
  const units = a.units * 10n ** BigInt(scale - a.scale) + b.units * 10n ** BigInt(scale - b.scale)
  return { units, scale }
}

// Half up: 0.105 → 0.11, 0.104 → 0.10. Amounts are never negative, so up is away from zero.
function round(value: Decimal, digits: number): Decimal {
  if (value.scale <= digits) return value
  const step = 10n ** BigInt(value.scale - digits)
  return { units: (value.units * 2n + step) / (step * 2n), scale: digits }
}

// Through the decimal's own digits, so the result is the number closest to the exact value.
function toNumber({ units, scale }: Decimal) {
  return Number(`${String(units)}e-${String(scale)}`)
}

/** How many decimals the currency's smallest unit has: 2 for USD (cents), 0 for JPY. */
function currencyDigits(currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions()
    .maximumFractionDigits ?? 2
}

/**
 * What a run of `model` with these settings costs: the units (seconds of video, images or
 * videos) at the model's price, plus its price per reference image for every image or video
 * made. `null` when the price is per second and the settings have no duration. Throws a
 * RangeError for negative or non-finite numbers, and for counts that aren't whole.
 */
export function estimateCost(
  model: { price: ModelPrice },
  settings: CostSettings = {}
): CostEstimate | null {
  const { unit, currency = "USD" } = model.price
  const amount = toDecimal(model.price.amount, "amount")
  const perReference = toDecimal(model.price.perReference ?? 0, "perReference")
  const count = wholeNumber(settings.count ?? 1, "count")
  const references = wholeNumber(settings.references ?? 0, "references")
  let quantity = count
  if (unit === "second") {
    if (settings.duration === undefined) return null
    quantity = multiply(count, toDecimal(settings.duration, "duration"))
  }

  const parts: { unit: CostLine["unit"]; quantity: Decimal; unitPrice: Decimal }[] = [
    { unit, quantity, unitPrice: amount },
  ]
  if (references.units > 0n && perReference.units > 0n) {
    parts.push({ unit: "reference", quantity: multiply(count, references), unitPrice: perReference })
  }

  const lines = parts.map((part) => ({ ...part, amount: multiply(part.quantity, part.unitPrice) }))
  const subtotal = lines.reduce((sum, line) => add(sum, line.amount), { units: 0n, scale: 0 })
  return {
    lines: lines.map((line) => ({
      unit: line.unit,
      quantity: toNumber(line.quantity),
      unitPrice: toNumber(line.unitPrice),
      amount: toNumber(line.amount),
    })),
    subtotal: toNumber(subtotal),
    total: toNumber(round(subtotal, currencyDigits(currency))),
    currency,
  }
}

// Money with every decimal the amount has, and at least the currency's own: $0.0057, $0.08, $5.00.
function formatMoney(value: number, currency: string, locale: string) {
  const digits = currencyDigits(currency)
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: Math.max(digits, toDecimal(value, "amount").scale),
  }).format(value)
}

const unitNames: Record<CostLine["unit"], [one: string, many: string]> = {
  second: ["s", "s"],
  image: ["image", "images"],
  video: ["video", "videos"],
  reference: ["ref", "refs"],
}

function formatQuantity(line: CostLine, locale: string) {
  const [one, many] = unitNames[line.unit]
  return `${new Intl.NumberFormat(locale).format(line.quantity)} ${line.quantity === 1 ? one : many}`
}

/**
 * An estimate in words, in English with the locale's numbers: the `breakdown`
 * ("5 s × $0.042", "1 image × $0.08 + 2 refs × $0.01") and the `total` ("≈ $0.21"; "< $0.01" when
 * it rounds to nothing; "$0.00" when it's free). Together: "5 s × $0.042 ≈ $0.21".
 */
export function formatEstimate(estimate: CostEstimate, locale = "en-US") {
  const { currency } = estimate
  const breakdown = estimate.lines
    .map((line) => `${formatQuantity(line, locale)} × ${formatMoney(line.unitPrice, currency, locale)}`)
    .join(" + ")
  let total = `≈ ${formatMoney(estimate.total, currency, locale)}`
  if (estimate.subtotal === 0) total = formatMoney(0, currency, locale)
  else if (estimate.total === 0) {
    total = `< ${formatMoney(10 ** -currencyDigits(currency), currency, locale)}`
  }
  return { breakdown, total }
}

const perUnit: Record<PriceUnit, string> = { second: "s", image: "image", video: "video" }

/** A price in words, for when there's nothing to estimate yet: "$0.042 / s", "$0.08 / image + $0.01 / ref". */
export function formatPrice(price: ModelPrice, locale = "en-US") {
  const currency = price.currency ?? "USD"
  const base = `${formatMoney(price.amount, currency, locale)} / ${perUnit[price.unit]}`
  return price.perReference
    ? `${base} + ${formatMoney(price.perReference, currency, locale)} / ref`
    : base
}
