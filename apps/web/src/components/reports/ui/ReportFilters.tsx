'use client'

/**
 * Filter controls for report tabs. Every control is a labelled native <select>
 * (keyboard + screen-reader friendly, no extra dependency). A tab renders only
 * the filters its role can use; changing one re-queries every dependent
 * section because the value flows from one piece of state in the tab.
 */
import type { ReactNode } from 'react'
import { useFlatSurface } from '@/components/shared/FlatSurface'

export interface FilterOption {
  value: string
  label: string
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: readonly FilterOption[]
  /** When set, adds a leading "all" option with an empty value. */
  allLabel?: string
}) {
  return (
    <label className="flex min-w-32 flex-col gap-1 text-xs font-medium text-muted">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-base bg-surface px-2.5 py-2 text-sm text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
      >
        {allLabel !== undefined && <option value="">{allLabel}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function FilterBar({ children, ariaLabel = 'Report filters' }: { children: ReactNode; ariaLabel?: string }) {
  const flat = useFlatSurface()
  return (
    <div role="group" aria-label={ariaLabel} className={`flex flex-wrap items-end gap-3 ${flat ? '' : 'rounded-xl app-tint p-3'}`}>
      {children}
    </div>
  )
}

export const TERM_OPTIONS: readonly FilterOption[] = [
  { value: '1', label: 'Term 1' },
  { value: '2', label: 'Term 2' },
  { value: '3', label: 'Term 3' },
]

/** A calendar-date filter (YYYY-MM-DD). Empty string means "not set". */
export function FilterDate({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
}) {
  return (
    <label className="flex min-w-32 flex-col gap-1 text-xs font-medium text-muted">
      {label}
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-base bg-surface px-2.5 py-2 text-sm text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
      />
    </label>
  )
}
