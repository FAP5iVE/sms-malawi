'use client'

/**
 * apps/web/src/components/shared/PeriodSwitcher.tsx
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: The universal academic year + term filter. Lives in the app
 *   header (replacing the old read-only "Term 3 — 2026/2027" badge), so it
 *   is visible on every authenticated page; whatever it selects is what
 *   every period-scoped tab reads through useViewingPeriod().
 *
 *   - Picking a year/term applies immediately (no "Apply" step) and writes
 *     to the global periodStore.
 *   - Picking the school's own current period clears the override, so
 *     "isOverridden" stays truthful.
 *   - "Back to current" resets in one click.
 *   - PeriodBanner is the second half of the feature: whenever the
 *     person is NOT on the live period it says so on every page, because
 *     forms on a screen save into the period being viewed.
 *
 *   Two variants: 'desktop' (md+ header, left slot) and 'compact' (mobile
 *   header chip, panel docks below the header like the search/bell panels).
 * [DEPENDS ON]: @/hooks/useViewingPeriod, @shared/constants/malawi
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarRange, ChevronDown, RotateCcw } from 'lucide-react'
import { useViewingPeriod } from '@/hooks/useViewingPeriod'
import { getAcademicYearOptions } from '@shared/constants/malawi'

const TERMS = [1, 2, 3] as const
const YEARS_BACK = 6
const YEARS_FORWARD = 1

/** Newest first. Always contains `ensure` so a stored out-of-window year still renders. */
function yearChoices(currentYear: string | undefined, ensure: string | undefined): string[] {
  if (!currentYear) return ensure ? [ensure] : []
  let years: string[]
  try {
    years = getAcademicYearOptions(currentYear, { back: YEARS_BACK, forward: YEARS_FORWARD })
  } catch {
    years = [currentYear]
  }
  if (ensure && !years.includes(ensure)) years = [...years, ensure]
  return [...new Set(years)].sort().reverse()
}

export function PeriodSwitcher({ variant = 'desktop' }: { variant?: 'desktop' | 'compact' }) {
  const {
    academicYear, term, isLoading, currentYear, currentTerm, relation, isOverridden, setPeriod, reset,
  } = useViewingPeriod()

  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const years = useMemo(() => yearChoices(currentYear, academicYear), [currentYear, academicYear])

  if (isLoading) {
    return (
      <span
        className="h-4 w-32 rounded bg-page animate-pulse"
        role="status"
        aria-label="Loading academic period"
      />
    )
  }
  if (!academicYear || !term) return <span aria-hidden />

  // setPeriod already treats "landed back on the school's own period" as
  // "follow current" rather than storing an override.
  const apply = setPeriod

  const away = relation !== 'current'
  const tag = relation === 'past' ? 'Past' : relation === 'future' ? 'Upcoming' : null

  const triggerClass = [
    'inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm font-semibold font-heading transition-colors',
    away
      ? 'border-brand-amber/50 bg-brand-amber/10 text-body hover:bg-brand-amber/15'
      : 'border-transparent text-body hover:bg-page',
  ].join(' ')

  const panelClass =
    variant === 'compact'
      ? 'fixed left-3 right-3 top-14 z-50 rounded-2xl border border-base bg-surface shadow-lg p-4 md:hidden'
      : 'absolute left-0 top-full mt-2 z-50 w-72 rounded-2xl border border-base bg-surface shadow-lg p-4'

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={triggerClass}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Viewing Term ${term}, ${academicYear}. Change academic period.`}
      >
        <CalendarRange className="w-4 h-4 text-muted shrink-0" aria-hidden />
        {variant === 'compact' ? (
          <span className="tabular">T{term} · {academicYear.slice(2, 4)}/{academicYear.slice(7)}</span>
        ) : (
          <span>Term {term} — {academicYear}</span>
        )}
        {tag && (
          <span className="rounded bg-brand-amber/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-amber">
            {tag}
          </span>
        )}
        <ChevronDown
          className={`w-3.5 h-3.5 text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div className={panelClass} role="dialog" aria-label="Academic period">
          <p className="text-xs font-heading font-semibold uppercase tracking-wide text-muted mb-3">
            Viewing period
          </p>

          <label htmlFor={`period-year-${variant}`} className="block text-xs text-muted mb-1">
            Academic year
          </label>
          <select
            id={`period-year-${variant}`}
            value={academicYear}
            onChange={(e) => apply(e.target.value, term)}
            className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}{y === currentYear ? ' (current)' : ''}
              </option>
            ))}
          </select>

          <p className="text-xs text-muted mt-3 mb-1" id={`period-term-label-${variant}`}>Term</p>
          <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby={`period-term-label-${variant}`}>
            {TERMS.map((t) => {
              const active = t === term
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => apply(academicYear, t)}
                  aria-pressed={active}
                  className={[
                    'min-h-11 rounded-lg border text-sm font-semibold transition-colors',
                    active
                      ? 'bg-brand-deep text-white border-brand-navy'
                      : 'border-base text-muted hover:text-body hover:bg-page',
                  ].join(' ')}
                >
                  Term {t}
                  {t === currentTerm && academicYear === currentYear && (
                    <span className="block text-[10px] font-normal opacity-80">current</span>
                  )}
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={() => { reset(); setOpen(false) }}
            disabled={!isOverridden}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-base px-3 py-2 text-sm font-semibold text-body hover:bg-page disabled:opacity-50 disabled:cursor-not-allowed min-h-11"
          >
            <RotateCcw className="w-4 h-4" aria-hidden />
            Back to current{currentYear && currentTerm ? ` (T${currentTerm} · ${currentYear})` : ''}
          </button>

          <p className="text-[11px] leading-snug text-muted mt-3">
            This only changes what <em>you</em> are viewing. The school&rsquo;s current term is set by an
            administrator in Settings.
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * Thin strip under the header whenever the viewing period is not the live one.
 * Rendered once in (auth)/layout.tsx so every page shows it.
 */
export function PeriodBanner() {
  const { academicYear, term, currentYear, currentTerm, relation, reset } = useViewingPeriod()
  if (relation === 'current' || !academicYear || !term) return null

  const kind = relation === 'past' ? 'a past period' : 'an upcoming period'
  return (
    <div
      role="status"
      className="shrink-0 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-brand-amber/40 bg-brand-amber/10 px-4 md:px-6 py-2 text-xs text-body"
    >
      <p>
        <strong className="font-heading">Viewing Term {term} · {academicYear}</strong> — {kind}.
        Anything you record on a page is saved to this period.
      </p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex items-center gap-1.5 font-heading font-semibold text-brand-teal hover:underline"
      >
        <RotateCcw className="w-3.5 h-3.5" aria-hidden />
        Return to Term {currentTerm} · {currentYear}
      </button>
    </div>
  )
}
