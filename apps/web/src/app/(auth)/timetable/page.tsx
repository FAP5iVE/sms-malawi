'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAuth } from 'firebase/auth'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { useClasses } from '@/hooks/useClasses'
import type { ApiTimetableSlot, ApiClass } from '@shared/types/api'

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] as const
const DAY_LABELS = {
  MONDAY: 'Mon',
  TUESDAY: 'Tue',
  WEDNESDAY: 'Wed',
  THURSDAY: 'Thu',
  FRIDAY: 'Fri',
}

export default function TimetablePage() {
  return (
    <RoleGuard
      allowed={['admin', 'high_rank', 'lower_rank', 'academic', 'exam_officer', 'student']}
    >
      <TimetableContent />
    </RoleGuard>
  )
}

function TimetableContent() {
  const { data: classes = [] } = useClasses('2025/2026')
  const [selectedClassId, setSelectedClassId] = useState('')
  const [term, setTerm] = useState(1)

  const { data: slots = [], isLoading } = useQuery<ApiTimetableSlot[]>({
    queryKey: ['timetable', selectedClassId, term],
    queryFn: async () => {
      if (!selectedClassId) return []
      const token = await getAuth().currentUser?.getIdToken()
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/classes/${selectedClassId}/timetable?term=${term}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      return res.json()
    },
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
