'use client'

/**
 * apps/web/src/components/shared/SearchableSelect.tsx
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: A generic "pick one from a list, with a search box" control — a
 *   select you can also type into. Built for use INSIDE dialogs:
 *     • The option list opens IN-FLOW beneath the trigger (it pushes content
 *       down) instead of floating as an absolutely-positioned popover. A
 *       floating list gets clipped by a dialog's scrolling body or hidden by
 *       the on-screen keyboard; an in-flow list just scrolls with the form.
 *     • Search matches every typed word against label + description + keywords,
 *       so "bwanali fin" finds "Bwanali Phiri — Finance".
 *     • Keyboard: ↑/↓ move, Enter picks, Esc closes the list (and does NOT
 *       close the surrounding Modal — it marks the event handled first).
 *     • Loading, load-failure (with retry) and no-results states are built in,
 *       so a failed fetch is never silently shown as an empty list.
 *   TeacherSelect.tsx predates this and stays as-is (it is teacher/uid specific).
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Search, ChevronDown, Check, Loader2, AlertTriangle, RefreshCw } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
  /** Secondary line, shown under the label and searched too. */
  description?: string
  /** Extra search-only text (not displayed). */
  keywords?: string
  disabled?: boolean
}

export interface SearchableSelectProps {
  id?: string
  options: readonly SelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  isLoading?: boolean
  /** Set when the options failed to load; shows this message with a retry. */
  errorMessage?: string | null
  onRetry?: () => void
  /** Shown when there are no options at all (distinct from "no search match"). */
  emptyMessage?: string
  disabled?: boolean
  'aria-invalid'?: boolean
  className?: string
}

const TRIGGER_CLS =
  'w-full border border-base rounded-lg px-3 py-2 text-sm bg-page text-body min-h-11 ' +
  'flex items-center justify-between gap-2 text-left ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-teal/25 focus:border-brand-teal transition-all ' +
  'disabled:opacity-60 disabled:cursor-not-allowed'

export function SearchableSelect({
  id,
  options,
  value,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Type to search…',
  isLoading = false,
  errorMessage = null,
  onRetry,
  emptyMessage = 'Nothing to choose from yet.',
  disabled = false,
  'aria-invalid': ariaInvalid,
  className = '',
}: SearchableSelectProps) {
  const reactId = useId()
  const listId = `${reactId}-list`
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value])

  const filtered = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length === 0) return options
    return options.filter((o) => {
      const hay = `${o.label} ${o.description ?? ''} ${o.keywords ?? ''}`.toLowerCase()
      return words.every((w) => hay.includes(w))
    })
  }, [options, query])

  // Close on outside press.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  // Keep the highlighted row visible while arrowing through a long list.
  useEffect(() => {
    if (!open) return
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView?.({ block: 'nearest' })
  }, [active, open])

  function openList() {
    if (disabled) return
    setQuery('')
    const idx = options.findIndex((o) => o.value === value)
    setActive(idx >= 0 ? idx : 0)
    setOpen(true)
  }

  function closeList(returnFocus = true) {
    setOpen(false)
    setQuery('')
    if (returnFocus) triggerRef.current?.focus({ preventScroll: true })
  }

  function pick(o: SelectOption) {
    if (o.disabled) return
    onChange(o.value)
    closeList()
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      // Handled here: tell the surrounding Modal not to also close itself.
      e.preventDefault()
      e.stopPropagation()
      closeList()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      // Never submit the surrounding form from inside the picker.
      e.preventDefault()
      const o = filtered[active]
      if (o) pick(o)
    }
  }

  const activeOptionId = filtered[active] ? `${reactId}-opt-${active}` : undefined

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-invalid={ariaInvalid}
        disabled={disabled}
        onClick={() => (open ? closeList(false) : openList())}
        className={TRIGGER_CLS}
      >
        <span className={`min-w-0 truncate ${selected ? 'text-body' : 'text-muted'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div className="mt-1.5 border border-base rounded-xl bg-surface overflow-hidden">
          <div className="flex items-center gap-2 px-3 border-b border-base">
            <Search className="w-4 h-4 text-muted shrink-0" aria-hidden />
            <input
              autoFocus
              type="text"
              role="searchbox"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
              }}
              onKeyDown={onSearchKeyDown}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              aria-controls={listId}
              aria-activedescendant={activeOptionId}
              autoComplete="off"
              className="w-full min-h-11 text-sm bg-transparent text-body placeholder:text-muted focus:outline-none"
            />
          </div>

          <div ref={listRef} id={listId} role="listbox" className="max-h-56 overflow-y-auto overscroll-contain">
            {isLoading && (
              <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted" role="status">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Loading…
              </div>
            )}

            {!isLoading && errorMessage && (
              <div className="px-4 py-3 space-y-2" role="alert">
                <p className="flex items-start gap-2 text-sm text-brand-coral">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                  {errorMessage}
                </p>
                {onRetry && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-teal hover:underline"
                  >
                    <RefreshCw className="w-3 h-3" aria-hidden /> Try again
                  </button>
                )}
              </div>
            )}

            {!isLoading && !errorMessage && options.length === 0 && (
              <p className="px-4 py-3 text-sm text-muted">{emptyMessage}</p>
            )}

            {!isLoading && !errorMessage && options.length > 0 && filtered.length === 0 && (
              <p className="px-4 py-3 text-sm text-muted">No match for “{query.trim()}”.</p>
            )}

            {!isLoading &&
              !errorMessage &&
              filtered.map((o, i) => {
                const isSelected = o.value === value
                return (
                  <div
                    key={o.value}
                    id={`${reactId}-opt-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={o.disabled}
                    onClick={() => pick(o)}
                    onMouseEnter={() => setActive(i)}
                    className={[
                      'flex items-center justify-between gap-3 px-4 py-2.5 min-h-11 text-sm cursor-pointer',
                      i === active ? 'bg-page' : '',
                      o.disabled ? 'opacity-50 cursor-not-allowed' : '',
                    ].join(' ')}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-body">{o.label}</span>
                      {o.description && (
                        <span className="block truncate text-xs text-muted">{o.description}</span>
                      )}
                    </span>
                    {isSelected && <Check className="w-4 h-4 text-brand-teal shrink-0" aria-hidden />}
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}

export default SearchableSelect
