/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/shared/AcademicYearSelect.tsx
 * [PURPOSE]: Production fix (2026-08-27) — a codebase-wide sweep found the
 *   same defect repeated at every place an academic year is entered by a
 *   person: either a hardcoded ['2026','2027','2028']-style array (expires
 *   the moment the school rolls past the last listed year) or a free-text
 *   `<input>` with a "2025/2026" placeholder (accepts any typo/format —
 *   "2025-2026", "25/26" — silently breaking every downstream
 *   parseAcademicYear() call, which requires the exact "YYYY/YYYY" shape).
 *   This component is the one, shared fix: a `<select>` whose options are
 *   computed from getAcademicYearOptions(schoolInfo.currentYear) —
 *   schoolInfo comes from usePublicSchoolInfo() (GET /public/school-info,
 *   unauthenticated), the same live source apply/page.tsx, exams/page.tsx,
 *   students/[id]/page.tsx and placements/page.tsx already read for the
 *   identical value — so every consumer's offered years track the school's
 *   real configured current year and advance with it, and the value is
 *   always well-formed (a real computed option, never free-typed text).
 *
 *   Forwards every other native <select> prop untouched (value/onChange,
 *   or a bare `{...register('academicYear')}` spread), so it drops into
 *   both react-hook-form and plain useState call sites with no other
 *   wiring change. For a register()-based (uncontrolled) field whose
 *   current value might sit outside the computed back/forward window (an
 *   existing record from a prior year, opened for editing), pass `value`
 *   alongside the register spread (e.g. `value={watch('academicYear')}`)
 *   so this component's "keep the stored value in the list" safeguard can
 *   see it — otherwise an out-of-window stored year would silently fail to
 *   select on mount, corrupting an edit form's prefilled value.
 * [DEPENDS ON]: apps/web/src/hooks/usePublic.ts (usePublicSchoolInfo),
 *   @shared/constants/malawi (getAcademicYearOptions, AcademicYearOptionsConfig)
 */
'use client'

import { forwardRef } from 'react'
import { usePublicSchoolInfo } from '@/hooks/usePublic'
import { getAcademicYearOptions } from '@shared/constants/malawi'
import type { AcademicYearOptionsConfig } from '@shared/constants/malawi'

// Matches the fallback already used while usePublicSchoolInfo() is loading
// elsewhere in the app (exams/page.tsx, placements/page.tsx) — the same
// default settingsService.ts itself falls back to server-side.
const FALLBACK_YEAR = '2025/2026'

/** getAcademicYearOptions() throws on a malformed "currentYear" (see
 *  parseAcademicYear's contract) — a stored SystemSettings value could in
 *  principle be bad data from before this component existed. Never let a
 *  malformed setting take down every select that renders from it; fall
 *  back to the known-good default instead. */
function safeAcademicYearOptions(year: string, cfg?: AcademicYearOptionsConfig): string[] {
  try {
    return getAcademicYearOptions(year, cfg)
  } catch {
    return getAcademicYearOptions(FALLBACK_YEAR, cfg)
  }
}

export interface AcademicYearSelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  /** How many academic years before/after the school's current one to
   *  offer. Defaults to getAcademicYearOptions's own default (2 back, 2
   *  forward) when omitted. */
  optionsConfig?: AcademicYearOptionsConfig
}

export const AcademicYearSelect = forwardRef<HTMLSelectElement, AcademicYearSelectProps>(
  function AcademicYearSelect({ optionsConfig, value, ...rest }, ref) {
    const { data: schoolInfo } = usePublicSchoolInfo()
    const currentYear = schoolInfo?.currentYear ?? FALLBACK_YEAR
    const options = safeAcademicYearOptions(currentYear, optionsConfig)

    // Never silently drop an already-selected value that falls outside the
    // computed window — e.g. editing a class/scholarship/invoice created
    // several years ago. Only applicable when the caller passes `value`
    // explicitly (controlled usage, or a register-spread plus `value` for
    // the safety net described above).
    const allOptions =
      typeof value === 'string' && value && !options.includes(value) ? [value, ...options] : options

    return (
      <select ref={ref} value={value} {...rest}>
        {allOptions.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    )
  }
)