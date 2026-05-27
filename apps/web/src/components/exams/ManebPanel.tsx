'use client'
import { useState } from 'react'
import { useManebRecords } from '@/hooks/useExams'
import { useAuthStore } from '@/store/authStore'
import { ExternalLink, GraduationCap } from 'lucide-react'
import type { ApiManebRecord } from '@shared/types/api'

interface Props { academicYear: string }

export function ManebPanel({ academicYear }: Props) {
  const { role }    = useAuthStore()
  const [examType, setExamType] = useState<'JCE' | 'MSCE'>('MSCE')
  const { data: records = [], isLoading } = useManebRecords(academicYear)
  // Cast to ApiManebRecord[] — useManebRecords returns typed data, no 'any' needed
  const typed    = records as ApiManebRecord[]
  const filtered = typed.filter((r) => r.examType === examType)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-2">
          {(['JCE', 'MSCE'] as const).map((t) => (
            <button key={t} onClick={() => setExamType(t)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                examType === t ? 'bg-brand-navy text-white border-brand-navy' : 'border-base text-muted hover:border-brand-navy'
              }`}>
              {t === 'JCE' ? 'JCE — Form 2' : 'MSCE — Form 4'}
            </button>
          ))}
        </div>
        <a href="https://maneb.mw" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm text-brand-teal hover:underline">
          <ExternalLink className="w-3.5 h-3.5" /> View MANEB Results Portal
        </a>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
        <GraduationCap className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          Grading follows official MANEB standards.{' '}
          {examType === 'MSCE'
            ? 'MSCE (Form 3 & 4): Grade 1 (80–100%) through Grade 9 (0–24%). Pass = Grade 1–6 (35%+).'
            : 'JCE (Form 1 & 2): Grade A (80–100%) through Grade F (0–34%). Pass = A–E (35%+).'}
          {' '}Verify at{' '}
          <a href="https://maneb.mw" target="_blank" rel="noopener noreferrer" className="underline">maneb.mw</a>.
        </span>
      </div>

      {isLoading && <div className="text-center py-12 text-muted text-sm animate-pulse">Loading records…</div>}

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-16 text-muted text-sm border border-base rounded-xl">
          No {examType} records for {academicYear}.
          {['admin', 'exam_officer'].includes(role ?? '') && ' Add candidates to get started.'}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="border border-base rounded-xl overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-page border-b border-base">
                {['Candidate No','Name','Centre','Subjects','Overall Grade','Status'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-base">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-page">
                  <td className="px-4 py-3 font-mono text-xs">{r.candidateNo}</td>
                  <td className="px-4 py-3">{r.studentId}</td>
                  <td className="px-4 py-3 text-muted text-xs">{r.centerNo} – {r.centerName}</td>
                  <td className="px-4 py-3 text-xs">
                    {Object.entries(r.subjectGrades).map(([subj, grade]) => (
                      <span key={subj} className="inline-flex items-center gap-1 bg-base rounded px-1.5 py-0.5 mr-1 mb-1">
                        {subj}: <strong>{grade}</strong>
                      </span>
                    ))}
                  </td>
                  <td className="px-4 py-3 font-bold text-brand-navy">{r.overallGrade ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-brand-teal/15 text-brand-teal px-2 py-0.5 rounded-full">{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}