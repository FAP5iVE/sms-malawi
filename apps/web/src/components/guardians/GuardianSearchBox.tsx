/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/guardians/GuardianSearchBox.tsx
 * [PURPOSE]: One search input for the Guardians screens (Review queue, Student list), plus the
 *   short debounce they share so a keystroke does not become a request. Text in, text out: the
 *   caller owns the value and decides what a search means.
 */
'use client'

import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'

/** The value, but only after it has stopped changing for `ms`. */
export function useDebouncedValue<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return settled
}

export function GuardianSearchBox({ id, label, value, onChange, placeholder }: {
  id: string
  label: string
  value: string
  onChange: (next: string) => void
  placeholder: string
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-xs font-medium text-body">{label}</label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" aria-hidden />
        <input
          id={id} type="search" value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" placeholder={placeholder}
          className="w-full rounded-xl border border-base bg-page pl-9 pr-11 py-2.5 text-sm text-body placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-teal/40 min-h-11"
        />
        {value && (
          <button
            type="button" aria-label="Clear search" onClick={() => onChange('')}
            className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center min-h-11 min-w-11 rounded-xl text-muted hover:text-body"
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  )
}
