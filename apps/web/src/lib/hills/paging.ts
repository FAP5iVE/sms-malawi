/**
 * apps/web/src/lib/hills/paging.ts
 *
 * [CHANGE TYPE]: NEW FILE (Chikangawa Hills theme, Phase 8b-0: foundations)
 * [PURPOSE]: The pure rules behind list paging (RULEBOOK section 7), apart from
 *   React so the plain node test runner can check them
 *   (tools/hills/__tests__/paging.test.mts).
 *
 *   Desktop tables: 25 rows by default, a choice of 10, 25 or 50, remembered in
 *   the browser (R7.1). Phones: 20 rows, then "Show 20 more", never endless
 *   scrolling (R7.2). Dashboard cards: top 5 and a "View all" link (R7.3).
 *
 *   Paging is CLIENT SIDE ONLY, on rows the page has already loaded (R7.4,
 *   owner decision 3). Nothing here fetches or changes a limit. A list the
 *   server already pages keeps its own paging.
 */

export const PAGE_SIZES = [10, 25, 50] as const
export type PageSize = (typeof PAGE_SIZES)[number]

export const DEFAULT_PAGE_SIZE: PageSize = 25

/** Rows added by each "Show more" press on a phone, and the first batch. */
export const PHONE_STEP = 20

/** Rows on a dashboard card before "View all". */
export const CARD_ROWS = 5

/** Phones are narrower than the md breakpoint (768px). */
export const PHONE_QUERY = '(max-width: 767.98px)'

/** localStorage key for the remembered rows-per-page choice. */
export const PAGE_SIZE_STORAGE_KEY = 'hills.pageSize'

/** Accepts only 10, 25 or 50 (number or numeric string); anything else gives the default. */
export function normalizePageSize(value: unknown): PageSize {
  const n = typeof value === 'string' ? Number(value) : value
  return (PAGE_SIZES as readonly unknown[]).includes(n) ? (n as PageSize) : DEFAULT_PAGE_SIZE
}

/** Number of pages; an empty list still has one (empty) page. */
export function pageCount(total: number, size: number): number {
  if (!Number.isFinite(total) || total <= 0 || size <= 0) return 1
  return Math.ceil(total / size)
}

/** Keeps a 1-based page number inside 1..pageCount. */
export function clampPage(page: number, total: number, size: number): number {
  const last = pageCount(total, size)
  if (!Number.isFinite(page)) return 1
  return Math.min(Math.max(1, Math.floor(page)), last)
}

/** The rows of one 1-based page. */
export function sliceForPage<T>(rows: readonly T[], page: number, size: number): T[] {
  const p = clampPage(page, rows.length, size)
  return rows.slice((p - 1) * size, p * size)
}

/** "26 to 50 of 130", or "No results". No dashes, plain words (R4.7). */
export function rangeText(total: number, page: number, size: number): string {
  if (!Number.isFinite(total) || total <= 0) return 'No results'
  const p = clampPage(page, total, size)
  const from = (p - 1) * size + 1
  const to = Math.min(p * size, total)
  return from === to ? `${from} of ${total}` : `${from} to ${to} of ${total}`
}

/** The first `shown` rows (the phone list). */
export function firstRows<T>(rows: readonly T[], shown: number): T[] {
  return rows.slice(0, Math.max(0, shown))
}

export interface ShowMorePlan {
  /** True when every row is already shown, so the button goes away. */
  done: boolean
  /** How many rows the next press adds (the step, or fewer at the end). */
  add: number
  /** The new `shown` value after a press. */
  next: number
  /** Button text: "Show 20 more", or "Show 5 more" for the last few. */
  label: string
}

export function showMorePlan(shown: number, total: number, step: number = PHONE_STEP): ShowMorePlan {
  const remaining = Math.max(0, total - Math.max(0, shown))
  if (remaining === 0) return { done: true, add: 0, next: Math.max(0, shown), label: '' }
  const add = Math.min(step, remaining)
  return { done: false, add, next: shown + add, label: `Show ${add} more` }
}

/** Whether a list needs any paging controls at all (10 rows or fewer never do). */
export function needsPaging(total: number): boolean {
  return Number.isFinite(total) && total > PAGE_SIZES[0]
}
