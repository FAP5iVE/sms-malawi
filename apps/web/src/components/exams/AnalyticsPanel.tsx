'use client'
import { useState } from 'react'
import { useClassAnalytics } from '@/hooks/useExams'
import { useClasses } from '@/hooks/useClasses'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Trophy, Users, TrendingUp } from 'lucide-react'
import type { ApiClass } from '@shared/types/api'

interface Props { academicYear: string; selectedClassId: string; term: number }

export function AnalyticsPanel({ academicYear, selectedClassId, term }: Props) {
  const [classId, setClassId] = useState(selectedClassId)
  const [t, setT]             = useState(term)
  const { data: classesData }  = useClasses(academicYear)
  const classes                = (classesData ?? []) as ApiClass[]
  const { data: analytics, isLoading } = useClassAnalytics(classId, academicYear, t)

  return (
    <div className="space-y-5">
      <div className="flex gap-3 flex-wrap">
        <select
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          aria-label="Select class"
          className="border border-base rounded-xl px-3 py-2 text-sm bg-surface focus:outline-none"
        >
          <option value="">Select class…</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          value={t}
          onChange={(e) => setT(Number(e.target.value))}
          aria-label="Select term"
          className="border border-base rounded-xl px-3 py-2 text-sm bg-surface focus:outline-none"
        >
          {[1,2,3].map((n) => <option key={n} value={n}>Term {n}</option>)}
        </select>
      </div>

      {!classId && <div className="text-center py-16 text-muted text-sm">Select a class to view analytics</div>}
      {classId && isLoading && <div className="text-center py-16 text-muted text-sm animate-pulse">Computing analytics…</div>}
      {classId && !isLoading && !analytics && (
        <div className="text-center py-16 text-muted text-sm">No results computed for this class and term yet.</div>
      )}

      {analytics && (
        <>
          <div className="grid grid-cols-3 gap-4">
            {[
              { icon: TrendingUp, label: 'Pass Rate',      value: `${analytics.passRate}%`,                    bg: 'bg-brand-teal/15',  ic: 'text-brand-teal' },
              { icon: Users,      label: 'Class Average',  value: `${analytics.classAverage.toFixed(1)}%`,     bg: 'bg-brand-navy/10',  ic: 'text-brand-navy' },
              { icon: Trophy,     label: 'Total Students', value: String(analytics.totalStudents),              bg: 'bg-brand-amber/15', ic: 'text-brand-amber' },
            ].map(({ icon: Icon, label, value, bg, ic }) => (
              <div key={label} className="bg-surface border border-base rounded-xl p-5 text-center">
                <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mx-auto mb-2`}>
                  <Icon className={`w-5 h-5 ${ic}`} />
                </div>
                <p className="text-2xl font-bold text-brand-navy">{value}</p>
                <p className="text-xs text-muted mt-1">{label}</p>
              </div>
            ))}
          </div>

          {analytics.top10.length > 0 && (
            <div className="bg-surface border border-base rounded-xl p-5">
              <h3 className="font-heading font-semibold text-sm text-muted uppercase tracking-wide mb-4">Top 10 Students</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={analytics.top10} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <XAxis dataKey="position" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `#${v}`} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => {
                      const num = typeof value === 'number' ? value : 0
                      return [`${num.toFixed(1)}%`, 'Average']
                    }} />
                  <Bar dataKey="average" radius={[4,4,0,0]}>
                    {analytics.top10.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? '#D97706' : i === 1 ? '#94A3B8' : i === 2 ? '#CD7F32' : '#0E8A6A'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  )
}