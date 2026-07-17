/**
 * [CHANGE TYPE]: NEW FILE (replaces the flat, year-pinned
 *   MALAWI_PUBLIC_HOLIDAYS_2026 array previously in malawi.ts)
 * [FILE]: packages/shared/constants/malawi/holidays.ts
 * [R-PHASE]: R16 — Constants Centralization (Phase 10B Plan)
 * [PURPOSE]: Malawi public holidays as year-agnostic templates rather than a
 *   single hardcoded year's dates. Fixed-date holidays are stored as
 *   month/day templates (matching the ACADEMIC_TERMS start/end convention);
 *   the two movable holidays (Good Friday, Easter Monday) are computed from
 *   Easter Sunday via the Anonymous Gregorian (Computus) algorithm, so the
 *   list evolves in place for any year instead of needing a new
 *   _2027/_2028 array re-typed annually. Every consumer calls the single
 *   getPublicHolidaysForYear(year) function.
 *
 *   Verified against the previous MALAWI_PUBLIC_HOLIDAYS_2026 values:
 *   getPublicHolidaysForYear(2026) reproduces the same fixed dates, and
 *   Easter 2026 = Sun 5 Apr → Good Friday 3 Apr / Easter Monday 6 Apr,
 *   exactly matching the old hardcoded 2026 entries.
 * [DEPENDS ON]: none
 */

/** A holiday whose date is the same month/day every year. */
export interface HolidayTemplate {
  month: number // 1–12
  day: number // 1–31
  name: string
}

/** A resolved holiday for a specific calendar year. */
export interface PublicHoliday {
  date: string // 'YYYY-MM-DD'
  name: string
}

// ─── FIXED-DATE HOLIDAYS ──────────────────────────────────
// Month/day templates. Dates flagged "verify" in the original malawi.ts
// carry the same values that array used — confirm against malawi.gov.mw
// before a production year rollover.
const FIXED_DATE_HOLIDAYS: readonly HolidayTemplate[] = [
  { month: 1, day: 1, name: "New Year's Day" },
  { month: 1, day: 15, name: 'John Chilembwe Day' },
  { month: 3, day: 3, name: "Martyrs' Day" },
  { month: 5, day: 1, name: 'Labour Day' },
  { month: 5, day: 14, name: 'Kamuzu Day' },
  { month: 6, day: 14, name: 'Freedom Day' },
  { month: 7, day: 6, name: 'Independence Day' },
  { month: 10, day: 15, name: "Mother's Day" },
  { month: 12, day: 25, name: 'Christmas Day' },
  { month: 12, day: 26, name: 'Boxing Day' },
] as const

// ─── EASTER (COMPUTUS) ────────────────────────────────────
/**
 * Anonymous Gregorian algorithm ("Meeus/Jones/Butcher") for the Gregorian
 * date of Easter Sunday in the given year. Returns a UTC Date.
 */
function computeEasterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day))
}

/** Formats a UTC Date as a 'YYYY-MM-DD' string. */
function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Adds a whole number of days to a UTC Date, returning a new Date. */
function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000)
}

// ─── PUBLIC API ───────────────────────────────────────────
/**
 * Returns every Malawi public holiday for the given year, sorted by date.
 * Combines the fixed-date templates with the two Easter-derived movable
 * holidays (Good Friday = Easter Sunday − 2 days, Easter Monday =
 * Easter Sunday + 1 day).
 */
export function getPublicHolidaysForYear(year: number): PublicHoliday[] {
  const easterSunday = computeEasterSunday(year)
  const movable: PublicHoliday[] = [
    { date: toIsoDate(addDays(easterSunday, -2)), name: 'Good Friday' },
    { date: toIsoDate(addDays(easterSunday, 1)), name: 'Easter Monday' },
  ]

  const fixed: PublicHoliday[] = FIXED_DATE_HOLIDAYS.map((h) => ({
    date: `${year}-${String(h.month).padStart(2, '0')}-${String(h.day).padStart(2, '0')}`,
    name: h.name,
  }))

  return [...fixed, ...movable].sort((a, b) => a.date.localeCompare(b.date))
}
