'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter }          from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, X, GraduationCap, Users, BookOpen, Loader2 } from 'lucide-react'
import { getAuth }            from 'firebase/auth'
import { useMotionEnabled }   from '@/store/motionStore'
import { FADE_DOWN_VARIANTS, reducedMotionVariants, reducedMotionTransition, SPRING } from '@/lib/motion'

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface StudentHit  { id: string; fullName: string; registrationNo: string; className: string | null }
interface StaffHit    { id: string; fullName: string; role: string; department: string }
interface BookHit     { id: string; title: string; author: string; category: string }

interface SearchResults {
  students: StudentHit[]
  staff:    StaffHit[]
  books:    BookHit[]
}

interface Props {
  /** Render as icon-only button that expands (mobile/compact) or as persistent input */
  variant?: 'compact' | 'expanded'
  placeholder?: string
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

async function fetchResults(query: string): Promise<SearchResults> {
  try {
    const token = await getAuth().currentUser?.getIdToken()
    const res   = await fetch(`/api/search/fallback?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${token ?? ''}` },
    })
    if (!res.ok) throw new Error('search failed')
    return res.json() as Promise<SearchResults>
  } catch {
    return { students: [], staff: [], books: [] }
  }
}

function hasResults(r: SearchResults): boolean {
  return r.students.length > 0 || r.staff.length > 0 || r.books.length > 0
}

// ─── RESULT ITEMS ─────────────────────────────────────────────────────────────

function StudentResult({ hit, onSelect }: { hit: StudentHit; onSelect: () => void }) {
  const router = useRouter()
  return (
    <button
      onClick={() => { router.push(`/students/${hit.id}`); onSelect() }}
      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-page text-left transition-colors"
    >
      <span className="w-7 h-7 rounded-full bg-brand-navy/10 flex items-center justify-center shrink-0">
        <GraduationCap className="w-3.5 h-3.5 text-brand-navy" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-brand-navy truncate">{hit.fullName}</p>
        <p className="text-xs text-muted">{hit.registrationNo}{hit.className ? ` · ${hit.className}` : ''}</p>
      </div>
    </button>
  )
}

function StaffResult({ hit, onSelect }: { hit: StaffHit; onSelect: () => void }) {
  const router = useRouter()
  return (
    <button
      onClick={() => { router.push(`/hr/staff/${hit.id}`); onSelect() }}
      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-page text-left transition-colors"
    >
      <span className="w-7 h-7 rounded-full bg-brand-teal/10 flex items-center justify-center shrink-0">
        <Users className="w-3.5 h-3.5 text-brand-teal" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-brand-navy truncate">{hit.fullName}</p>
        <p className="text-xs text-muted capitalize">{hit.role.replace('_', ' ')} · {hit.department}</p>
      </div>
    </button>
  )
}

function BookResult({ hit, onSelect }: { hit: BookHit; onSelect: () => void }) {
  const router = useRouter()
  return (
    <button
      onClick={() => { router.push(`/library?book=${hit.id}`); onSelect() }}
      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-page text-left transition-colors"
    >
      <span className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
        <BookOpen className="w-3.5 h-3.5 text-amber-700" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-brand-navy truncate">{hit.title}</p>
        <p className="text-xs text-muted">{hit.author} · {hit.category}</p>
      </div>
    </button>
  )
}

// ─── RESULTS DROPDOWN ─────────────────────────────────────────────────────────

function ResultsDropdown({ results, onSelect }: { results: SearchResults; onSelect: () => void }) {
  const motionEnabled = useMotionEnabled()
  // Post-R19 production fix: reducedMotionVariants/reducedMotionTransition must be
  // CALLED (they branch on motionEnabled internally), never assigned as a bare
  // function reference — that shape doesn't satisfy motion.div's Variants prop type.
  const variants      = reducedMotionVariants(motionEnabled, FADE_DOWN_VARIANTS)
  const transition    = reducedMotionTransition(motionEnabled, { ...SPRING, duration: 0.18 })

  const empty = !hasResults(results)

  return (
    <motion.div
      key="results"
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="hidden"
      transition={transition}
      className="absolute top-full left-0 right-0 mt-1.5 bg-surface border border-base rounded-2xl shadow-lg overflow-hidden z-50 max-h-[70vh] overflow-y-auto"
    >
      {empty ? (
        <p className="px-4 py-5 text-sm text-muted text-center">No results found</p>
      ) : (
        <>
          {results.students.length > 0 && (
            <section>
              <p className="px-4 pt-3 pb-1 text-xs font-heading font-semibold text-muted uppercase tracking-wide">Students</p>
              {results.students.map((h) => <StudentResult key={h.id} hit={h} onSelect={onSelect} />)}
            </section>
          )}
          {results.staff.length > 0 && (
            <section className={results.students.length > 0 ? 'border-t border-base' : ''}>
              <p className="px-4 pt-3 pb-1 text-xs font-heading font-semibold text-muted uppercase tracking-wide">Staff</p>
              {results.staff.map((h) => <StaffResult key={h.id} hit={h} onSelect={onSelect} />)}
            </section>
          )}
          {results.books.length > 0 && (
            <section className={results.students.length + results.staff.length > 0 ? 'border-t border-base' : ''}>
              <p className="px-4 pt-3 pb-1 text-xs font-heading font-semibold text-muted uppercase tracking-wide">Books</p>
              {results.books.map((h) => <BookResult key={h.id} hit={h} onSelect={onSelect} />)}
            </section>
          )}
        </>
      )}
    </motion.div>
  )
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function GlobalSearch({ variant = 'expanded', placeholder = 'Search students, staff, books…' }: Props) {
  const [query,     setQuery]     = useState('')
  const [results,   setResults]   = useState<SearchResults | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [open,      setOpen]      = useState(false)
  const [expanded,  setExpanded]  = useState(variant === 'expanded')
  const inputRef   = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Debounced search ──
  const handleChange = useCallback((value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (value.trim().length < 2) { setResults(null); setOpen(false); return }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      const res = await fetchResults(value)
      setResults(res)
      setOpen(true)
      setLoading(false)
    }, 300)
  }, [])

  // ── Click-outside close ──
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  // ── Keyboard Escape ──
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur() }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (variant === 'compact') setExpanded(true)
        setTimeout(() => inputRef.current?.focus(), 50)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [variant])

  function handleClear() {
    setQuery(''); setResults(null); setOpen(false)
    inputRef.current?.focus()
  }

  function handleSelect() {
    setOpen(false); setQuery(''); setResults(null)
    if (variant === 'compact') setExpanded(false)
  }

  // ── Compact icon-only button ──
  if (variant === 'compact' && !expanded) {
    return (
      <button
        onClick={() => { setExpanded(true); setTimeout(() => inputRef.current?.focus(), 80) }}
        aria-label="Open search"
        className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-base text-muted transition-colors"
      >
        <Search className="w-4.5 h-4.5" />
      </button>
    )
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className={`flex items-center gap-2 border rounded-xl px-3 h-9 bg-surface transition-all ${open ? 'border-brand-navy/40 ring-2 ring-brand-navy/10' : 'border-base'}`}>
        {loading
          ? <Loader2 className="w-4 h-4 text-muted shrink-0 animate-spin" />
          : <Search   className="w-4 h-4 text-muted shrink-0" />
        }
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => { if (results && hasResults(results)) setOpen(true) }}
          placeholder={placeholder}
          aria-label="Global search"
          autoComplete="off"
          className="flex-1 bg-transparent text-sm text-brand-navy placeholder:text-muted focus:outline-none min-w-0"
        />
        <AnimatePresence>
          {query && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.1 }}
              onClick={handleClear}
              aria-label="Clear search"
              className="shrink-0 text-muted hover:text-brand-navy transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </motion.button>
          )}
        </AnimatePresence>
        {variant === 'compact' && (
          <button onClick={() => setExpanded(false)} className="shrink-0 text-muted hover:text-brand-navy ml-1">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <AnimatePresence>
        {open && results && (
          <ResultsDropdown results={results} onSelect={handleSelect} />
        )}
      </AnimatePresence>
    </div>
  )
}