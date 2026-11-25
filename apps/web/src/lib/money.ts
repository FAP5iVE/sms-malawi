/**
 * apps/web/src/lib/money.ts
 *
 * [CHANGE TYPE]: NEW FILE. Finance Hardening Plan task P1-01 (D-11; fixes X-11, X-15, X-40).
 * Justification for a new file (plan Part 6 §1 rule 3): six services each re-implemented
 * `Math.round(n * 100) / 100` on JavaScript floats. One module replaces them.
 *
 * All money arithmetic uses Prisma's runtime `Decimal` (decimal.js), 2 decimal places,
 * rounding HALF-UP (a tie rounds away from zero, so 2.675 becomes 2.68). OQ-03 (half-up versus
 * bankers rounding, and whether tambala are ever collected) is still open: half-up at 2 dp is the
 * default the plan states. Change `ROUNDING` here, and only here, if the owner decides otherwise.
 *
 * Two levels of strictness, on purpose:
 *   - `money(x)` is the GATE for values that arrive from outside (a form, a request body, a CSV).
 *     A number must already have at most 2 decimal places, so `0.1 + 0.2` is rejected instead of
 *     being silently rounded. A malformed amount is a bug to be seen, not repaired.
 *   - `add`, `sub`, `mul`, `sum`, `round2`, `compare` and the rest accept any finite value. They are
 *     for arithmetic inside a service, where an intermediate result (a pro-rata share, a percentage)
 *     legitimately has more than 2 decimal places until `round2` is applied.
 *
 * `toNumber` belongs only at the API or display boundary. Keep values as `Decimal` between
 * services and into Prisma (Prisma accepts a `Decimal` for a `Decimal` column).
 */
import { Decimal } from '@prisma/client/runtime/library'

export type MoneyLike = string | number | Decimal

/** Raised for a value that is not a valid amount of money. */
export class MoneyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MoneyError'
  }
}

/** The one place the rounding rule lives (D-11, OQ-03). */
const ROUNDING = Decimal.ROUND_HALF_UP

/** Largest value a `Decimal(12,2)` operational column holds. */
export const MONEY_MAX = 9_999_999_999.99

export const ZERO: Decimal = new Decimal(0)

/** An optional minus sign, digits, and at most two decimal places. No exponent, no spaces. */
const TWO_DP = /^-?\d+(\.\d{1,2})?$/

// ─────────────────────────────────────────────────────────────────────────────
// CONVERSION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lenient conversion used by the arithmetic helpers. Accepts any finite value.
 * A number is read through its shortest decimal text, so `0.1` is exactly 0.1 (not the nearest
 * binary fraction) and `0.1 + 0.2` is 0.30000000000000004, which `round2` then brings to 0.30.
 */
function d(x: MoneyLike): Decimal {
  let v: Decimal
  try {
    v = Decimal.isDecimal(x) ? (x as Decimal) : new Decimal(x as string | number)
  } catch {
    throw new MoneyError(`Not a valid amount: ${String(x)}`)
  }
  if (!v.isFinite()) throw new MoneyError(`Not a valid amount: ${String(x)}`)
  return v
}

/**
 * Strict gate for money that arrives from outside. A number or string must have at most 2 decimal
 * places. A `Decimal` (already inside the system) only has to be finite.
 */
export function money(x: MoneyLike): Decimal {
  if (Decimal.isDecimal(x)) return d(x)
  if (typeof x === 'number') {
    if (!Number.isFinite(x)) throw new MoneyError(`Not a valid amount: ${String(x)}`)
    const text = String(x)
    if (!TWO_DP.test(text)) {
      throw new MoneyError(`Amount ${text} must have at most 2 decimal places.`)
    }
    return new Decimal(text)
  }
  if (typeof x === 'string') {
    const text = x.trim()
    if (!TWO_DP.test(text)) {
      throw new MoneyError(`Amount "${x}" must be a number with at most 2 decimal places.`)
    }
    return new Decimal(text)
  }
  throw new MoneyError(`Not a valid amount: ${String(x)}`)
}

/** Convert to a JavaScript number. Only at the API or display boundary. */
export function toNumber(x: MoneyLike): number {
  return d(x).toNumber()
}

// ─────────────────────────────────────────────────────────────────────────────
// ARITHMETIC
// ─────────────────────────────────────────────────────────────────────────────

/** Round to 2 decimal places, half-up. */
export function round2(x: MoneyLike): Decimal {
  return d(x).toDecimalPlaces(2, ROUNDING)
}

export function add(a: MoneyLike, b: MoneyLike): Decimal {
  return d(a).plus(d(b))
}

export function sub(a: MoneyLike, b: MoneyLike): Decimal {
  return d(a).minus(d(b))
}

/** Multiply. The result is NOT rounded: apply `round2` where the rule says to. */
export function mul(x: MoneyLike, factor: MoneyLike): Decimal {
  return d(x).times(d(factor))
}

/** `pct` percent of `amount`, rounded to 2 dp. `percentOf(1000, 5)` is 50.00. */
export function percentOf(amount: MoneyLike, pct: MoneyLike): Decimal {
  return round2(d(amount).times(d(pct)).div(100))
}

/** Exact total of a list. An empty list is zero. */
export function sum(values: readonly MoneyLike[]): Decimal {
  let total = ZERO
  for (const v of values) total = total.plus(d(v))
  return total
}

export function min(a: MoneyLike, b: MoneyLike): Decimal {
  return lt(b, a) ? d(b) : d(a)
}

export function max(a: MoneyLike, b: MoneyLike): Decimal {
  return gt(b, a) ? d(b) : d(a)
}

/** `x` when it is positive, otherwise zero. Replaces `Math.max(0, x)`. */
export function nonNegative(x: MoneyLike): Decimal {
  return lt(x, 0) ? ZERO : d(x)
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPARISON (exact; there is no tolerance)
// ─────────────────────────────────────────────────────────────────────────────

/** -1 when a < b, 0 when equal, 1 when a > b. */
export function compare(a: MoneyLike, b: MoneyLike): -1 | 0 | 1 {
  return d(a).comparedTo(d(b)) as -1 | 0 | 1
}
export const eq  = (a: MoneyLike, b: MoneyLike): boolean => compare(a, b) === 0
export const gt  = (a: MoneyLike, b: MoneyLike): boolean => compare(a, b) > 0
export const gte = (a: MoneyLike, b: MoneyLike): boolean => compare(a, b) >= 0
export const lt  = (a: MoneyLike, b: MoneyLike): boolean => compare(a, b) < 0
export const lte = (a: MoneyLike, b: MoneyLike): boolean => compare(a, b) <= 0
export const isZero = (x: MoneyLike): boolean => d(x).isZero()

// ─────────────────────────────────────────────────────────────────────────────
// ALLOCATION (largest remainder)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Split `total` across `weights` so that the parts add up to `total` exactly, to the cent.
 *
 * Method: each part gets the whole number of cents its share earns; the cents left over go, one
 * each, to the parts with the largest fractional remainder (a tie goes to the earlier part).
 * Used for discount shares, payroll splits and pro-rata interest and principal.
 *
 * Done in integers (BigInt) so there is no rounding error in the shares themselves.
 * A weight of zero receives nothing. All weights zero, a negative weight, or a `total` with more
 * than 2 decimal places is an error.
 */
export function allocate(total: MoneyLike, weights: readonly MoneyLike[]): Decimal[] {
  const t = d(total)
  if (t.decimalPlaces() > 2) {
    throw new MoneyError(`Cannot allocate ${t.toString()}: more than 2 decimal places.`)
  }
  if (weights.length === 0) throw new MoneyError('Cannot allocate across zero parts.')

  const w = weights.map(d)
  if (w.some((x) => x.isNegative())) throw new MoneyError('Allocation weights cannot be negative.')

  // Scale every weight to a whole number so the arithmetic below is exact.
  const scaleDigits = Math.max(0, ...w.map((x) => x.decimalPlaces()))
  const scale = new Decimal(10).pow(scaleDigits)
  const wInt = w.map((x) => BigInt(x.times(scale).toFixed(0)))
  const wTotal = wInt.reduce((a, b) => a + b, BigInt(0))
  if (wTotal === BigInt(0)) throw new MoneyError('Cannot allocate: every weight is zero.')

  const negative = t.isNegative()
  const cents = BigInt(t.abs().times(100).toFixed(0))

  const floors = wInt.map((x) => (cents * x) / wTotal)
  const remainders = wInt.map((x) => (cents * x) % wTotal)
  let left = Number(cents - floors.reduce((a, b) => a + b, BigInt(0)))

  const order = remainders
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1))
  const parts = floors.slice()
  for (let k = 0; left > 0; k++, left--) {
    const idx = order[k]!.i
    parts[idx] = parts[idx]! + BigInt(1)
  }

  return parts.map((c) => {
    const v = new Decimal(c.toString()).div(100)
    return negative ? v.negated() : v
  })
}
