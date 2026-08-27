/*
 * apps/web/src/app/(auth)/timetable/page.tsx
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R13 — Announcements, Timetable & Calendar Domain
 * [PURPOSE]:
 *   1. Replaced the raw fetch() call (zero error handling — a non-2xx
 *      response's error body was consumed via res.json() as if it were
 *      valid timetable data, and NEXT_PUBLIC_API_URL had no `?? ''`
 *      fallback unlike every other correctly-built call site) with the
 *      R1-consolidated apiFetch — which already handles both the base-URL
 *      fallback and non-2xx error throwing internally — and a proper
 *      queryKeys.classes.timetable()-keyed query.
 *   2. RoleGuard.allowed was missing finance/library/hr — all three hold
 *      timetable.view's universal grant per the permission matrix
 *      (confirmed: the backend GET /classes/:id/timetable route already
 *      gates on requirePermission('timetable.view') as of R6, so this
 *      was a frontend-only gap blocking three roles from a page their
 *      own backend route already allows them to call).
 * [DEPENDS ON]: apps/web/src/lib/api-client.ts (apiFetch, queryKeys)
 *
 * [CHANGE TYPE]: TARGETED EDIT (production fix, 2026-08-27).
 * [PURPOSE]: `useClasses('2025/2026')` was hardcoded — the Class filter
 *   dropdown it feeds would silently go empty (no classes to select, no
 *   error shown) the moment the school's real academic year moved past
 *   2025/2026, since no class from a different year would ever match.
 *   Replaced with usePublicSchoolInfo().currentYear (GET
 *   /public/school-info, unauthenticated), the same live source and
 *   FALLBACK_YEAR convention already used by (auth)/exams/page.tsx for
 *   the identical value.
 * [DEPENDS ON (added)]: apps/web/src/hooks/usePublic.ts (usePublicSchoolInfo)
 */
'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch, queryKeys } from '@/lib/api-client'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { useClasses } from '@/hooks/useClasses'
import { usePublicSchoolInfo } from '@/hooks/usePublic'
import type { ApiTimetableSlot, ApiClass } from '@shared/types/api'

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] as const
const DAY_LABELS = {
  MONDAY: 'Mon',
  TUESDAY: 'Tue',
  WEDNESDAY: 'Wed',
  THURSDAY: 'Thu',
  FRIDAY: 'Fri',
}

// Fallback used only while usePublicSchoolInfo() is still loading — matches
// the same constant name/value already used for this in (auth)/exams/page.tsx.
const FALLBACK_YEAR = '2025/2026'

export default function TimetablePage() {
  return (
    <RoleGuard
      allowed={['admin', 'high_rank', 'finance', 'library', 'lower_rank', 'academic', 'hr', 'exam_officer', 'student']}
    >
      <TimetableContent />
    </RoleGuard>
  )
}

function TimetableContent() {
  const { data: schoolInfo } = usePublicSchoolInfo()
  const { data: classes = [] } = useClasses(schoolInfo?.currentYear ?? FALLBACK_YEAR)
  const [selectedClassId, setSelectedClassId] = useState('')
  const [term, setTerm] = useState(1)

  const { data: slots = [], isLoading } = useQuery<ApiTimetableSlot[]>({
    queryKey: queryKeys.classes.timetable(selectedClassId, undefined, term),
    queryFn: () => apiFetch<ApiTimetableSlot[]>(`/classes/${selectedClassId}/timetable?term=${term}`),
    enabled: !!selectedClassId,
  })

  // Group slots by day
  const byDay = DAYS.reduce(
    (acc, day) => {
      acc[day] = slots.filter((s: ApiTimetableSlot) => s.day === day)
      return acc
    },
    {} as Record<string, ApiTimetableSlot[]>
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-bold text-brand-navy">Timetable</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={selectedClassId}
          onChange={(e) => setSelectedClassId(e.target.value)}
          className="border border-base rounded-lg px-3 py-2 text-sm bg-surface"
          aria-label="Select class"
        >
          <option value="">Select class</option>
          {(classes as ApiClass[]).map((c: ApiClass) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={term}
          onChange={(e) => setTerm(Number(e.target.value))}
          className="border border-base rounded-lg px-3 py-2 text-sm bg-surface"
          aria-label="Select term"
        >
          <option value={1}>Term 1</option>
          <option value={2}>Term 2</option>
          <option value={3}>Term 3</option>
        </select>
      </div>

      {!selectedClassId ? (
        <div className="bg-surface border border-base rounded-xl p-12 text-center text-muted text-sm">
          Select a class above to view its timetable
        </div>
      ) : isLoading ? (
        <div className="skeleton h-64 rounded-xl" />
      ) : (
        <div className="bg-surface border border-base rounded-xl overflow-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-base bg-page">
                <th className="text-left px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wide text-muted w-24">
                  Time
                </th>
                {DAYS.map((d) => (
                  <th
                    key={d}
                    className="text-left px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wide text-muted"
                  >
                    {DAY_LABELS[d]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slots.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted">
                    No timetable slots for this class and term
                  </td>
                </tr>
              ) : (
                // Get unique periods — type the Set as string[] so .map gets string values
                [...new Set<string>(slots.map((s: ApiTimetableSlot) => s.periodStart))]
                  .sort()
                  .map((periodStart: string) => {
                    const row = slots.find((s: ApiTimetableSlot) => s.periodStart === periodStart)
                    return (
                      <tr key={periodStart} className="border-b border-base hover:bg-page">
                        <td className="px-4 py-3 text-muted font-mono text-xs tabular">
                          {periodStart}–{row?.periodEnd}
                        </td>
                        {DAYS.map((day) => {
                          const slot = byDay[day]?.find(
                            (s: ApiTimetableSlot) => s.periodStart === periodStart
                          )
                          return (
                            <td key={day} className="px-4 py-3">
                              {slot ? (
                                <div>
                                  <p className="font-medium text-brand-navy">{slot.subject}</p>
                                  <p className="text-xs text-muted mt-0.5">{slot.room ?? '—'}</p>
                                </div>
                              ) : (
                                <span className="text-muted text-xs">Free</span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}