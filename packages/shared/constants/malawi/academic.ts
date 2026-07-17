/**
 * [CHANGE TYPE]: NEW FILE (extracted + extended from malawi.ts)
 * [FILE]: packages/shared/constants/malawi/academic.ts
 * [R-PHASE]: R16 — Constants Centralization (Phase 10B Plan)
 * [PURPOSE]: Pure, YEAR-AGNOSTIC academic-structure calculation logic. This
 *   module NEVER stores "the current academic year" — that single value
 *   lives solely in SETTING_KEYS.CURRENT_ACADEMIC_YEAR and is fetched at
 *   runtime via settingsService. Everything here derives from a year that is
 *   passed in.
 *
 *   Contains: ACADEMIC_TERMS (retained from malawi.ts); the MANEB national-
 *   examination structure (MANEB_NATIONAL_FORM_TERM / getManebExamType /
 *   isManebNationalTerm — relocated verbatim from malawi.ts, still the shared
 *   source of truth consumed by examService.ts and classService.ts through
 *   the preserved @shared/constants/malawi barrel); FORM_LEVELS / FORM_COLORS
 *   (replacing the scattered [1,2,3,4] / ['Form 1'..'Form 4'] arrays and
 *   classes/page.tsx's inline FORM_COLORS); and the year/term helpers
 *   getTermDatesForYear / getCurrentTerm / getAcademicYearOptions /
 *   getMaxPublishedYear.
 * [DEPENDS ON]: none
 */

// ─── ACADEMIC TERM STRUCTURE ─────────────────────────────
// Malawi's three-term year. Term 1 falls in the FIRST calendar year of an
// academic year (e.g. "2025/2026" → Term 1 = 2025); Terms 2 and 3 fall in
// the SECOND (2026). Months are start/end MM-DD templates, applied to the
// correct calendar year by getTermDatesForYear().
export const ACADEMIC_TERMS = {
  TERM_1: { label: 'Term 1', months: 'September – December', start: '09-01', end: '12-15' },
  TERM_2: { label: 'Term 2', months: 'January – April', start: '01-10', end: '04-15' },
  TERM_3: { label: 'Term 3', months: 'May – July', start: '05-05', end: '07-25' },
} as const

export type TermNumber = 1 | 2 | 3

// ─── MANEB NATIONAL EXAMINATION STRUCTURE ────────────────
// Relocated verbatim from malawi.ts (originally added in R7). Malawi's
// secondary curriculum sits two MANEB national examinations: JCE at the end
// of Form 2, and MSCE at the end of Form 4 — both in Term 3 of their form.
// Every other end-of-term exam is set, marked, and graded by the school
// itself. MANEB grades are never computed by this system — they arrive
// already-graded from MANEB and are recorded via ManebRecord
// (examService.createManebRecord()/listManebRecords()), never through the
// internal Exam/ExamMark/computeTermResults() pipeline. examService.ts and
// classService.ts consult this table to keep the internal pipeline from
// being used for a term MANEB — not the school — actually grades.
export const MANEB_NATIONAL_FORM_TERM: ReadonlyArray<{
  form: number
  term: number
  examType: 'JCE' | 'MSCE'
}> = [
  { form: 2, term: 3, examType: 'JCE' },
  { form: 4, term: 3, examType: 'MSCE' },
]

/** Returns the MANEB exam type ('JCE' | 'MSCE') if the given form+term is a
 *  nationally-administered MANEB sitting, or null for an ordinary,
 *  school-administered term. */
export function getManebExamType(form: number, term: number): 'JCE' | 'MSCE' | null {
  return MANEB_NATIONAL_FORM_TERM.find((r) => r.form === form && r.term === term)?.examType ?? null
}

/** True if the given form+term is a MANEB national examination sitting —
 *  results for it come from MANEB import (ManebRecord), never from internal
 *  marks entry or computeTermResults(). */
export function isManebNationalTerm(form: number, term: number): boolean {
  return getManebExamType(form, term) !== null
}

// ─── FORM LEVELS ──────────────────────────────────────────
// Single source for the four secondary forms. Replaces every hardcoded
// [1,2,3,4] / ['Form 1'..'Form 4'] array across apply/page.tsx,
// StudentFormSections.tsx and classes/page.tsx.
export interface FormLevel {
  value: number // 1–4
  label: string // 'Form 1'..'Form 4'
}

export const FORM_LEVELS: readonly FormLevel[] = [
  { value: 1, label: 'Form 1' },
  { value: 2, label: 'Form 2' },
  { value: 3, label: 'Form 3' },
  { value: 4, label: 'Form 4' },
] as const

/** Form-number literals only ([1, 2, 3, 4]). */
export const FORM_NUMBERS: readonly number[] = FORM_LEVELS.map((f) => f.value)

/** Form-label strings only (['Form 1'..'Form 4']). */
export const FORM_LABELS: readonly string[] = FORM_LEVELS.map((f) => f.label)

// Per-form card tint classes (folded in from classes/page.tsx). Indexed by
// (form - 1) % 4. Retained verbatim from the source; the raw-palette →
// design-token migration for these is tracked separately.
export const FORM_COLORS: readonly string[] = [
  'bg-blue-50 border-blue-200',
  'bg-teal-50 border-teal-200',
  'bg-purple-50 border-purple-200',
  'bg-amber-50 border-amber-200',
] as const

// ─── ACADEMIC-YEAR HELPERS ───────────────────────────────

/** Parses an academic-year string ("2025/2026") into its two calendar years.
 *  Throws on a malformed value rather than silently producing NaN. */
export function parseAcademicYear(academicYear: string): { startYear: number; endYear: number } {
  const match = /^(\d{4})\/(\d{4})$/.exec(academicYear.trim())
  if (!match || match[1] === undefined || match[2] === undefined) {
    throw new Error(`Invalid academic year "${academicYear}" — expected "YYYY/YYYY".`)
  }
  return { startYear: Number(match[1]), endYear: Number(match[2]) }
}

export interface TermDateRange {
  term: TermNumber
  label: string
  start: string // 'YYYY-MM-DD'
  end: string // 'YYYY-MM-DD'
}

/** Resolves the three terms' concrete date ranges for a given academic year.
 *  Term 1 uses the start calendar year; Terms 2 and 3 use the end year.
 *  Replaces calendar.ts's TERM_PERIODS and calendar/page.tsx's hardcoded
 *  dateRange initial state. */
export function getTermDatesForYear(academicYear: string): TermDateRange[] {
  const { startYear, endYear } = parseAcademicYear(academicYear)
  return [
    {
      term: 1,
      label: ACADEMIC_TERMS.TERM_1.label,
      start: `${startYear}-${ACADEMIC_TERMS.TERM_1.start}`,
      end: `${startYear}-${ACADEMIC_TERMS.TERM_1.end}`,
    },
    {
      term: 2,
      label: ACADEMIC_TERMS.TERM_2.label,
      start: `${endYear}-${ACADEMIC_TERMS.TERM_2.start}`,
      end: `${endYear}-${ACADEMIC_TERMS.TERM_2.end}`,
    },
    {
      term: 3,
      label: ACADEMIC_TERMS.TERM_3.label,
      start: `${endYear}-${ACADEMIC_TERMS.TERM_3.start}`,
      end: `${endYear}-${ACADEMIC_TERMS.TERM_3.end}`,
    },
  ]
}

/** Returns the term (1|2|3) the given date falls within for the given
 *  academic year. A date inside a term's [start, end] range maps to that
 *  term; a date in a between-term gap maps to the most recently-started term
 *  (defaulting to Term 1 before the year begins). Replaces PageHeader.tsx's
 *  hardcoded CURRENT_TERM literal and informs classes/[id]/page.tsx's term
 *  selector. */
export function getCurrentTerm(date: Date, academicYear: string): TermNumber {
  const iso = date.toISOString().slice(0, 10)
  const ranges = getTermDatesForYear(academicYear)

  for (const r of ranges) {
    if (iso >= r.start && iso <= r.end) return r.term
  }

  // In a gap or outside the year: choose the most recently-started term.
  let current: TermNumber = 1
  for (const r of ranges) {
    if (iso >= r.start) current = r.term
  }
  return current
}

export interface AcademicYearOptionsConfig {
  /** How many academic years before the current one to include. Default 2. */
  back?: number
  /** How many academic years after the current one to include. Default 2. */
  forward?: number
}

/** Returns a list of academic-year strings ("YYYY/YYYY") centered on the
 *  given current academic year, for populating year-selector dropdowns.
 *  Replaces every hardcoded year array (HolidaysManager.tsx, apply/page.tsx,
 *  reports/page.tsx) with one runtime-derived source. */
export function getAcademicYearOptions(
  currentAcademicYear: string,
  opts?: AcademicYearOptionsConfig
): string[] {
  const { startYear } = parseAcademicYear(currentAcademicYear)
  const back = opts?.back ?? 2
  const forward = opts?.forward ?? 2
  const years: string[] = []
  for (let offset = -back; offset <= forward; offset++) {
    const s = startYear + offset
    years.push(`${s}/${s + 1}`)
  }
  return years
}

/** Returns a contiguous list of calendar-year numbers centered on a year,
 *  for numeric year selectors (e.g. HolidaysManager's holiday-year picker).
 *  Year-agnostic: pass the current calendar year in from a settings-derived
 *  source rather than baking one in. */
export function getCalendarYearOptions(currentYear: number, back = 1, forward = 2): number[] {
  const years: number[] = []
  for (let offset = -back; offset <= forward; offset++) {
    years.push(currentYear + offset)
  }
  return years
}

/** The maximum plausible "published year" for library material — the current
 *  calendar year plus a one-year buffer for near-future publications.
 *  Replaces S/schemas/library.ts's hardcoded 2030 upper bound with a value
 *  that evolves in place instead of expiring. */
export function getMaxPublishedYear(): number {
  return new Date().getUTCFullYear() + 1
}
