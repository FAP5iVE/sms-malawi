/**
 * apps/web/src/lib/requestLimits.ts
 *
 * [CHANGE TYPE]: NEW FILE (Issue 6)
 *
 * Request COST limits. A rate limit caps how many requests a caller may make;
 * it does nothing about one allowed request that asks for ten years of audit
 * rows or a 100 000-row page. These helpers bound the size of a single
 * request and REJECT (HTTP 400) rather than silently clamp — clamping hides
 * the problem from the client and returns a different result from the one it
 * asked for — and they run BEFORE any query is issued.
 *
 * Pure functions, no framework imports: they throw RequestCostError, which
 * carries `status = 400` and so is rendered correctly by globalErrorHandler
 * (and by sendError) from inside any async route handler.
 */

export class RequestCostError extends Error {
  readonly status = 400
  /** Marks the message as safe to show the client. */
  readonly expose = true
  constructor(message: string) {
    super(message)
    this.name = 'RequestCostError'
  }
}

/** Ceilings shared by routes, so the same question has the same answer everywhere. */
export const REQUEST_LIMITS = {
  /** Longest window a report/analytics `days` parameter may ask for. */
  maxDays: 730,
  maxMonths: 36,
  maxWeeks: 104,
  /** "Top N" style limits. */
  maxTopN: 100,
  /** Largest page any list endpoint will serve. */
  maxPageSize: 200,
  /** Widest from→to span for ledger / statement style queries. */
  maxRangeDays: 400,
  /** Longest free-text search term. */
  maxSearchChars: 100,
} as const

const DAY_MS = 86_400_000

function asString(raw: unknown): string | undefined {
  if (Array.isArray(raw)) raw = raw[0] // ?x=1&x=2 — take the first, never an array
  return typeof raw === 'string' ? raw : undefined
}

/**
 * A positive-integer query parameter with an upper bound.
 * Missing → `fallback`. Malformed → `fallback` (matches the previous lenient
 * behaviour for typos). Above `max` → RequestCostError.
 */
export function boundedInt(raw: unknown, fallback: number, max: number, name = 'value'): number {
  const s = asString(raw)
  if (s === undefined || s.trim() === '') return fallback
  const n = Number(s)
  if (!Number.isInteger(n) || n <= 0) return fallback
  if (n > max) throw new RequestCostError(`"${name}" must be ${max} or less.`)
  return n
}

export interface PageParams {
  page: number
  pageSize: number
  skip: number
}

/** `page` / `pageSize` with a hard ceiling. A pageSize above `maxSize` is rejected, not clamped. */
export function parsePageParams(
  query: { page?: unknown; pageSize?: unknown },
  opts: { defaultSize: number; maxSize?: number },
): PageParams {
  const maxSize = opts.maxSize ?? REQUEST_LIMITS.maxPageSize
  const pageSize = boundedInt(query.pageSize, opts.defaultSize, maxSize, 'pageSize')
  const page = boundedInt(query.page, 1, 1_000_000, 'page')
  return { page, pageSize, skip: (page - 1) * pageSize }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function parseIsoDate(raw: string, name: string): Date {
  if (!ISO_DATE.test(raw)) throw new RequestCostError(`"${name}" must be a date in YYYY-MM-DD format.`)
  const d = new Date(`${raw}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) throw new RequestCostError(`"${name}" is not a valid date.`)
  return d
}

export interface DateRange {
  from: Date
  to: Date
  days: number
}

/**
 * A from→to pair, validated and span-limited. Both bounds are required unless
 * `optional` is set, in which case a missing pair returns undefined (and a
 * half-specified pair is still rejected, since "from without to" is an
 * open-ended — i.e. unbounded — query).
 */
export function parseDateRange(
  query: { from?: unknown; to?: unknown },
  opts: { maxDays?: number; optional?: boolean } = {},
): DateRange | undefined {
  const maxDays = opts.maxDays ?? REQUEST_LIMITS.maxRangeDays
  const fromRaw = asString(query.from)?.trim()
  const toRaw = asString(query.to)?.trim()

  if (!fromRaw && !toRaw) {
    if (opts.optional) return undefined
    throw new RequestCostError('"from" and "to" are required.')
  }
  if (!fromRaw || !toRaw) throw new RequestCostError('"from" and "to" must be provided together.')

  const from = parseIsoDate(fromRaw, 'from')
  const to = parseIsoDate(toRaw, 'to')
  if (from > to) throw new RequestCostError('"from" must not be after "to".')

  const days = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1
  if (days > maxDays) throw new RequestCostError(`The date range may not exceed ${maxDays} days.`)
  return { from, to, days }
}

/** A trimmed search term, length-capped. Returns '' for missing input. */
export function parseSearchTerm(raw: unknown, maxChars: number = REQUEST_LIMITS.maxSearchChars): string {
  const s = asString(raw)?.trim() ?? ''
  if (s.length > maxChars) throw new RequestCostError(`Search text must be ${maxChars} characters or fewer.`)
  return s
}

/** Rejects an array body/field longer than `max` (e.g. a bulk id list). */
export function assertMaxItems(items: readonly unknown[] | undefined, max: number, name: string): void {
  if (items && items.length > max) {
    throw new RequestCostError(`"${name}" may contain at most ${max} items per request.`)
  }
}
