'use client'

/**
 * apps/web/src/app/(public)/placements/page.tsx
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Public university-placement results — the actual NCHE selection
 *   list (student name, university, programme, status), not just aggregate
 *   stats. This IS public information (selection results are published by
 *   the school once NCHE releases them), so the page and its data source are
 *   deliberately unauthenticated. The server only ever returns VERIFIED
 *   PLACED/CONFIRMED rows — a student's own pending self-claim never shows
 *   up here, and no grades or internal ids are exposed.
 * [DEPENDS ON]: usePublicPlacements (GET /public/placements, no auth),
 *   usePublicPlacementStats (GET /public/placement-stats, already public)
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, GraduationCap, Search, School, TrendingUp } from 'lucide-react'
import { usePublicPlacements, usePublicPlacementStats } from '@/hooks/usePublic'

export default function PublicPlacementsPage() {
  const [year, setYear] = useState<string>('')
  const [query, setQuery] = useState('')

  const { data: placements, isLoading } = usePublicPlacements(year || undefined)
  const { data: stats } = usePublicPlacementStats(year || undefined)

  const years = useMemo(() => {
    const set = new Set((placements ?? []).map((p) => p.academicYear))
    return Array.from(set).sort().reverse()
  }, [placements])

  const filtered = useMemo(() => {
    const rows = placements ?? []
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (p) =>
        p.studentName.toLowerCase().includes(q) ||
        p.university.toLowerCase().includes(q) ||
        p.programme.toLowerCase().includes(q) ||
        p.registrationNo.toLowerCase().includes(q),
    )
  }, [placements, query])

  const byUniversity = useMemo(() => {
    const map = new Map<string, typeof filtered>()
    for (const p of filtered) {
      const list = map.get(p.university) ?? []
      list.push(p)
      map.set(p.university, list)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  return (
    <div className="min-h-screen bg-page">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <Link href="/#performance" className="inline-flex items-center gap-2 text-sm text-brand-teal hover:underline mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to home
        </Link>

        <h1 className="font-heading font-extrabold text-3xl sm:text-4xl tracking-tight text-brand-navy dark:text-white mb-3 flex items-center gap-3">
          <GraduationCap className="w-8 h-8 text-brand-teal" aria-hidden />
          University Placements
        </h1>
        <p className="text-muted leading-relaxed mb-8 max-w-2xl">
          Public university placement results for our MSCE graduates, as selected through the National Council for
          Higher Education (NCHE) placement process. This list reflects confirmed selections only.
        </p>

        {/* Stats summary */}
        {stats && (
          <div className="grid grid-cols-3 gap-3 mb-8">
            <div className="border border-base rounded-2xl bg-surface p-4 text-center">
              <p className="text-2xl font-heading font-extrabold text-brand-navy dark:text-white">{stats.qualified}</p>
              <p className="text-xs text-muted mt-1">Qualified</p>
            </div>
            <div className="border border-base rounded-2xl bg-surface p-4 text-center">
              <p className="text-2xl font-heading font-extrabold text-brand-navy dark:text-white">{stats.selected}</p>
              <p className="text-xs text-muted mt-1">Selected by NCHE</p>
            </div>
            <div className="border border-base rounded-2xl bg-surface p-4 text-center">
              <p className="text-2xl font-heading font-extrabold text-brand-teal flex items-center justify-center gap-1">
                <TrendingUp className="w-4 h-4" aria-hidden /> {stats.selectionRate}%
              </p>
              <p className="text-xs text-muted mt-1">Selection rate</p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, registration number, university or programme…"
              className="w-full pl-10 pr-3 py-2.5 border border-base rounded-xl text-sm bg-surface focus:outline-none"
              aria-label="Search placements"
            />
          </div>
          {years.length > 1 && (
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              aria-label="Filter by academic year"
              className="border border-base rounded-xl px-3 py-2.5 text-sm bg-surface focus:outline-none"
            >
              <option value="">All years</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-surface animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-base rounded-2xl">
            <School className="w-8 h-8 mx-auto text-muted mb-3" aria-hidden />
            <p className="text-sm text-muted">
              {query ? 'No placements match your search.' : 'No published placements yet for this year.'}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {byUniversity.map(([university, rows]) => (
              <section key={university}>
                <h2 className="font-heading font-bold text-lg text-brand-navy dark:text-white mb-3 flex items-center gap-2">
                  <School className="w-5 h-5 text-brand-teal shrink-0" aria-hidden />
                  {university}
                  <span className="text-sm font-normal text-muted">({rows.length})</span>
                </h2>
                <div className="border border-base rounded-2xl bg-surface overflow-hidden divide-y divide-base">
                  {rows.map((p, i) => (
                    <div key={`${p.registrationNo}-${i}`} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-body truncate">{p.studentName}</p>
                        <p className="text-xs text-muted font-mono">{p.registrationNo} · {p.academicYear}</p>
                      </div>
                      <span className="text-sm text-brand-navy dark:text-white text-right shrink-0">{p.programme}</span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}