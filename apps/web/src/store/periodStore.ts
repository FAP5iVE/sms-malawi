'use client'

/**
 * apps/web/src/store/periodStore.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: The ONE client-side source for "which academic year and term
 *   is this person LOOKING AT right now".
 *
 *   Two different ideas were previously collapsed into one:
 *     1. The school's CURRENT period  — an admin-controlled setting
 *        (SETTING_KEYS.CURRENT_ACADEMIC_YEAR / CURRENT_TERM). Changes once
 *        a term, for everybody. Still owned by useCurrentAcademicPeriod().
 *     2. The VIEWING period           — which slice of history one person
 *        is browsing. Per-person, per-session. That is this store.
 *
 *   Because only (1) existed, the app could never show anything but the
 *   current term: every tab read the setting directly, so last term's
 *   invoices, expenses, attendance and results were unreachable.
 *
 *   `null` means "follow the school's current period" — the default, and
 *   what every new browser session starts on. Only an explicit pick in the
 *   header's PeriodSwitcher stores a value. Persisted in sessionStorage
 *   (not localStorage) on purpose: closing the tab returns the person to
 *   the live period, so nobody comes back tomorrow and unknowingly records
 *   payments against a term they were only browsing.
 *
 *   Hydration: zustand v5 renders the server snapshot (getInitialState =
 *   all-null) during hydration and the persisted value afterwards, so the
 *   header never mismatches between server and client.
 * [DEPENDS ON]: zustand (persist middleware)
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type ViewingTerm = 1 | 2 | 3

interface PeriodState {
  /** "YYYY/YYYY", or null = follow the school's current academic year. */
  academicYear: string | null
  /** 1 | 2 | 3, or null = follow the school's current term. */
  term: ViewingTerm | null

  /** Set both at once (what the switcher does). Pass nulls to follow current. */
  setPeriod: (academicYear: string | null, term: number | null) => void
  setAcademicYear: (academicYear: string | null) => void
  setTerm: (term: number | null) => void
  /** Back to the school's current period. */
  reset: () => void
}

const YEAR_RE = /^\d{4}\/\d{4}$/

function cleanYear(v: unknown): string | null {
  return typeof v === 'string' && YEAR_RE.test(v) ? v : null
}
function cleanTerm(v: unknown): ViewingTerm | null {
  return v === 1 || v === 2 || v === 3 ? v : null
}

export const usePeriodStore = create<PeriodState>()(
  persist(
    (set) => ({
      academicYear: null,
      term: null,

      setPeriod: (academicYear, term) =>
        set({ academicYear: cleanYear(academicYear), term: cleanTerm(term) }),
      setAcademicYear: (academicYear) => set({ academicYear: cleanYear(academicYear) }),
      setTerm: (term) => set({ term: cleanTerm(term) }),
      reset: () => set({ academicYear: null, term: null }),
    }),
    {
      name: 'sms-viewing-period',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ academicYear: s.academicYear, term: s.term }),
      // Never trust stored data: a hand-edited or stale value must degrade
      // to "follow current", not feed a malformed year to parseAcademicYear().
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PeriodState>
        return { ...current, academicYear: cleanYear(p.academicYear), term: cleanTerm(p.term) }
      },
    },
  ),
)
