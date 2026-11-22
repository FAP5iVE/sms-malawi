'use client'

/**
 * apps/web/src/hooks/useViewingPeriod.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: The hooks every period-scoped screen reads. Return shapes are
 *   deliberately IDENTICAL to the two hooks they sit beside, so a page
 *   adopts the universal filter by changing one import:
 *
 *     useCurrentAcademicPeriod()   → useViewingPeriod()
 *     useEffectiveAcademicPeriod() → useEffectiveViewingPeriod()
 *
 *   Resolution rule (the whole feature in one line):
 *     viewing = person's explicit pick (periodStore)  ??  school's current setting
 *
 *   `useCurrentAcademicPeriod` / `useEffectiveAcademicPeriod` are NOT
 *   removed or changed — they remain the truth about "what period is the
 *   school in right now", which the switcher itself needs (to offer
 *   "Back to current", to flag a past/future view). Use them only where
 *   the REAL current period is semantically required; use these everywhere
 *   data is displayed or filtered by year/term.
 * [DEPENDS ON]: @/store/periodStore, @/hooks/useSettings
 */

import { useCallback } from 'react'
import { useCurrentAcademicPeriod, useEffectiveAcademicPeriod } from '@/hooks/useSettings'
import { usePeriodStore } from '@/store/periodStore'
import { getTermDatesForYear, parseAcademicYear } from '@shared/constants/malawi'

export type PeriodRelation = 'current' | 'past' | 'future'

/** Orders two (year, term) pairs; <0 means a is earlier than b. */
function comparePeriods(aYear: string, aTerm: number, bYear: string, bTerm: number): number {
  try {
    const ay = parseAcademicYear(aYear).startYear
    const by = parseAcademicYear(bYear).startYear
    if (ay !== by) return ay - by
  } catch {
    return 0
  }
  return aTerm - bTerm
}

function relationOf(
  year: string | undefined, term: number | undefined,
  curYear: string | undefined, curTerm: number | undefined,
): PeriodRelation {
  if (!year || !term || !curYear || !curTerm) return 'current'
  const c = comparePeriods(year, term, curYear, curTerm)
  return c < 0 ? 'past' : c > 0 ? 'future' : 'current'
}

export interface ViewingPeriod {
  /** The year to display/filter by — undefined only until the school setting resolves. */
  academicYear: string | undefined
  /** The term to display/filter by — undefined only until the school setting resolves. */
  term: number | undefined
  isLoading: boolean
  /** The school's REAL current period (for labels like "Back to Term 3 · 2026/2027"). */
  currentYear: string | undefined
  currentTerm: number | undefined
  /** Is the person looking at the past, the future, or the live period? */
  relation: PeriodRelation
  /** True when the person is looking at something other than the school's live period. */
  isOverridden: boolean
  /** Pick a (year, term). Landing exactly on the school's current period clears the override. */
  setPeriod: (academicYear: string, term: number) => void
  /** Change only the term (keeps the viewed year). No-op until the period resolves. */
  setTerm: (term: number) => void
  /** Change only the year (keeps the viewed term). No-op until the period resolves. */
  setAcademicYear: (academicYear: string) => void
  /** Back to the school's current period. */
  reset: () => void
}

/**
 * The one place that decides what gets stored. Both fields are always stored
 * together (or both cleared): storing only the field that differs would make
 * the OTHER one silently drift whenever an admin rolls the school's current
 * term, e.g. someone reading last year's Term 3 would be bounced to last
 * year's Term 1.
 */
function useApplyPeriod(currentYear: string | undefined, currentTerm: number | undefined) {
  const storeSet   = usePeriodStore((s) => s.setPeriod)
  const storeReset = usePeriodStore((s) => s.reset)
  return useCallback(
    (year: string, term: number) => {
      if (year === currentYear && term === currentTerm) storeReset()
      else storeSet(year, term)
    },
    [currentYear, currentTerm, storeSet, storeReset],
  )
}

/**
 * Drop-in for useCurrentAcademicPeriod(): `academicYear` / `term` may be
 * undefined until the school settings load, so callers keep gating their
 * queries with `enabled` exactly as before.
 */
export function useViewingPeriod(): ViewingPeriod {
  const { academicYear: currentYear, term: currentTerm, isLoading } = useCurrentAcademicPeriod()
  const pickedYear = usePeriodStore((s) => s.academicYear)
  const pickedTerm = usePeriodStore((s) => s.term)
  const reset      = usePeriodStore((s) => s.reset)
  const apply      = useApplyPeriod(currentYear, currentTerm)

  const academicYear = pickedYear ?? currentYear
  const term         = pickedTerm ?? currentTerm

  const setTerm = useCallback(
    (t: number) => { if (academicYear) apply(academicYear, t) },
    [academicYear, apply],
  )
  const setAcademicYear = useCallback(
    (y: string) => { if (term) apply(y, term) },
    [term, apply],
  )

  return {
    academicYear,
    term,
    isLoading,
    currentYear,
    currentTerm,
    relation: relationOf(academicYear, term, currentYear, currentTerm),
    isOverridden: pickedYear !== null || pickedTerm !== null,
    setPeriod: apply,
    setTerm,
    setAcademicYear,
    reset,
  }
}

/**
 * Drop-in for useEffectiveAcademicPeriod(): always returns a usable year +
 * term (falling back to the calendar-derived value before settings load).
 */
export function useEffectiveViewingPeriod(): {
  academicYear: string
  term: number
  isResolved: boolean
  isLoading: boolean
  relation: PeriodRelation
  setPeriod: (academicYear: string, term: number) => void
  setTerm: (term: number) => void
  setAcademicYear: (academicYear: string) => void
} {
  const eff = useEffectiveAcademicPeriod()
  const { currentYear, currentTerm } = useViewingPeriod()
  const pickedYear = usePeriodStore((s) => s.academicYear)
  const pickedTerm = usePeriodStore((s) => s.term)
  const apply      = useApplyPeriod(currentYear, currentTerm)

  const academicYear = pickedYear ?? eff.academicYear
  const term         = pickedTerm ?? eff.term

  // Stable setters so pages with their own <select> write THROUGH to the
  // global filter instead of keeping a competing local copy.
  const setTerm = useCallback((t: number) => apply(academicYear, t), [academicYear, apply])
  const setAcademicYear = useCallback((y: string) => apply(y, term), [term, apply])

  return {
    academicYear,
    term,
    isResolved: eff.isResolved,
    isLoading: eff.isLoading,
    relation: relationOf(academicYear, term, currentYear, currentTerm),
    setPeriod: apply,
    setTerm,
    setAcademicYear,
  }
}

/**
 * [start, end] ISO dates (YYYY-MM-DD) of the viewing term — for screens whose
 * data is date-stamped rather than term-stamped (ledger, procurement
 * documents, payroll runs). Undefined until the period resolves or if the
 * year string is malformed.
 */
export function useViewingTermRange(): { start: string; end: string } | undefined {
  const { academicYear, term } = useViewingPeriod()
  if (!academicYear || !term) return undefined
  try {
    const r = getTermDatesForYear(academicYear).find((t) => t.term === term)
    return r ? { start: r.start, end: r.end } : undefined
  } catch {
    return undefined
  }
}
