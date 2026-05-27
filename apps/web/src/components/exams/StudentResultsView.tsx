'use client'
import { useState } from 'react'
import { useStudentResults, useGenerateReportCard } from '@/hooks/useExams'
import { AlertTriangle, FileDown, TrendingUp } from 'lucide-react'
import type { ApiTermResult } from '@shared/types/api'

interface Props { studentId: string }

export function StudentResultsView({ studentId }: Props) {
  const [academicYear] = useState('2025/2026')
  const [term, setTerm] = useState(1)
  const { data: result, isLoading, error } = useStudentResults(studentId, academicYear, term)
  const generateCard = useGenerateReportCard()

  if (isLoading) return <div className="animate-pulse h-40 rounded-xl bg-surface" />

  // Fee gate error — shown when API returns 403
  if (error) {
    const msg = (error as Error).message
    const isFeeGate = msg.includes('fee') || msg.includes('Outstanding')
    const bgClass  = isFeeGate ? 'bg-brand-coral/8 border-brand-coral/25' : 'bg-surface border-base'
    const iconClass = isFeeGate ? 'text-brand-coral' : 'text-muted'
    const titleClass = isFeeGate ? 'text-brand-coral' : 'text-body'
    return (
      <div className={`rounded-xl p-5 border flex items-start gap-3 ${bgClass}`}>
        <AlertTriangle className={`w-5 h-5 mt-0.5 shrink-0 ${iconClass}`} />
        <div>
          <p className={`font-semibold ${titleClass}`}>
            {isFeeGate ? 'Results Unavailable — Outstanding Fee Balance' : 'Results Not Yet Released'}
          </p>
          <p className="text-sm text-muted mt-1">
            {isFeeGate
              ? 'Your exam results are blocked until all outstanding fees for this term are paid in full. Please visit the Finance office.'
              : 'Results have not been released yet. Please check back later.'}
          </p>
        </div>
      </div>
    )
  }

  if (!result) return <div className="text-center py-12 text-muted text-sm">No results for this term.</div>

  // Now result is typed as ApiTermResult
  const r = result as ApiTermResult
  const subjects = r.subjectResults

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-2">
          {[1,2,3].map((t) => (
            <button key={t} onClick={() => setTerm(t)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                term === t ? 'bg-brand-navy text-white border-brand-navy' : 'border-base text-muted'
              }`}>
              Term {t}
            </button>
          ))}
        </div>
        <button
          onClick={() => generateCard.mutate({ studentId, academicYear, term }, {
            onSuccess: (d) => window.open(d.url, '_blank'),
          })}
          disabled={generateCard.isPending}
          className="flex items-center gap-1.5 text-sm border border-base px-3 py-1.5 rounded-xl hover:bg-page transition-colors disabled:opacity-60"
        >
          <FileDown className="w-4 h-4" />
          {generateCard.isPending ? 'Generating…' : 'Download Report Card'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Average',  value: `${Number(r.average).toFixed(1)}%` },
          { label: 'Grade',    value: r.grade },
          { label: 'Position', value: r.position ? `#${r.position}` : '—' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-surface border border-base rounded-xl p-4 text-center">
            <p className="text-xl font-bold text-brand-navy">{value}</p>
            <p className="text-xs text-muted mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className={`rounded-xl px-4 py-3 text-sm font-semibold flex items-center gap-2 ${
        r.passStatus
          ? 'bg-green-50 text-green-700 border border-green-200'
          : 'bg-brand-coral/8 text-brand-coral border border-brand-coral/20'
      }`}>
        <TrendingUp className="w-4 h-4" />
        {r.passStatus ? '✓ Pass and Proceed to Next Class' : '✗ Repeat Class — Did Not Meet Promotion Criteria'}
      </div>

      <div className="border border-base rounded-xl overflow-hidden">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-page border-b border-base">
              {['Subject','Average','Grade','Result'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-base">
            {Object.entries(subjects).map(([subject, data]) => (
              <tr key={subject} className="hover:bg-page">
                <td className="px-4 py-3 font-medium">{subject}</td>
                <td className="px-4 py-3">{data.average.toFixed(1)}%</td>
                <td className="px-4 py-3 font-bold text-brand-navy">{data.grade}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    data.pass ? 'bg-green-100 text-green-700' : 'bg-brand-coral/10 text-brand-coral'
                  }`}>
                    {data.pass ? 'Pass' : 'Fail'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}