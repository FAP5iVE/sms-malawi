/*
 * [CHANGE TYPE]: TARGETED EDIT (adds a permission-gated bulk-entry form; the
 *   existing exam-type toggle, MANEB advisory note, and records table are
 *   otherwise unchanged)
 * [FILE]: apps/web/src/components/exams/ManebPanel.tsx
 * [R-PHASE]: R18 — University Placement Module (Phase 11 Blueprint)
 * [PURPOSE]: MANEB results are the sole input to the placement module, and
 *   entering a whole exam centre's candidates one-by-one is impractical. This
 *   adds a "Bulk entry" form (visible only to roles holding
 *   exam.manageManebRecords — admin, high_rank, exam_officer) that lets staff
 *   add several candidate records at once. It posts through the new useBulkCreateManebRecords hook →
 *   POST /exams/maneb/bulk → examService.bulkCreateManebRecords, which is a
 *   thin loop over the existing createManebRecord (the sole MANEB write path) —
 *   NOT a second import mechanism. Per-row failures (e.g. a duplicate
 *   candidateNo) are surfaced without aborting the rest of the batch.
 * [DEPENDS ON]: @/hooks/useExams (useManebRecords, useBulkCreateManebRecords),
 *   @/hooks/usePermissions, @shared/schemas/exam (CreateManebRecordInput),
 *   @shared/constants/malawi (MALAWI_SUBJECTS)
 */
'use client'
import { useState } from 'react'
import { useManebRecords, useBulkCreateManebRecords, useCreateManebRecord } from '@/hooks/useExams'
import { usePermissions } from '@/hooks/usePermissions'
import { useAuthStore } from '@/store/authStore'
import { ExternalLink, GraduationCap, Plus, Trash2, Upload, Loader2 } from 'lucide-react'
import type { ApiManebRecord } from '@shared/types/api'
import type { CreateManebRecordInput } from '@shared/schemas/exam'

interface Props { academicYear: string }

// Six core MSCE/JCE subjects offered as quick grade inputs; staff can leave
// any blank. Grade strings are validated server-side via CreateManebRecordSchema.
const QUICK_SUBJECTS = ['English', 'Mathematics', 'Biology', 'Physical Science', 'Chemistry', 'Physics'] as const

interface BulkRow {
  candidateNo: string
  studentId: string
  centerNo: string
  centerName: string
  grades: Record<string, string>
}

function emptyRow(): BulkRow {
  return { candidateNo: '', studentId: '', centerNo: '', centerName: '', grades: {} }
}

export function ManebPanel({ academicYear }: Props) {
  const { role } = useAuthStore()
  const { can } = usePermissions()
  const [examType, setExamType] = useState<'JCE' | 'MSCE'>('MSCE')
  const [showBulk, setShowBulk] = useState(false)
  const [rows, setRows] = useState<BulkRow[]>([emptyRow()])
  const [feedback, setFeedback] = useState<string | null>(null)
  // [PRODUCTION FIX 2026-07-28] Individual entry — reuses the exact same
  // BulkRow shape and grade-editing logic as bulk entry (one row instead
  // of many), submitted through the real POST /exams/maneb route that
  // already existed but had no frontend hook at all.
  const [showIndividual, setShowIndividual] = useState(false)
  const [individualRow, setIndividualRow] = useState<BulkRow>(emptyRow())
  const [individualFeedback, setIndividualFeedback] = useState<string | null>(null)
  const createRecord = useCreateManebRecord(academicYear)

  const { data: records = [], isLoading } = useManebRecords(academicYear)
  const bulkCreate = useBulkCreateManebRecords(academicYear)

  const typed = records as ApiManebRecord[]
  const filtered = typed.filter((r) => r.examType === examType)

  // Bulk entry is a MANEB management capability — same roles as the maneb routes.
  const canManage = can('exam.manageManebRecords')

  function updateRow(i: number, patch: Partial<BulkRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  function updateGrade(i: number, subject: string, grade: string) {
    setRows((prev) =>
      prev.map((r, idx) => (idx === i ? { ...r, grades: { ...r.grades, [subject]: grade } } : r)),
    )
  }
  function addRow() {
    setRows((prev) => (prev.length >= 200 ? prev : [...prev, emptyRow()]))
  }
  function removeRow(i: number) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)))
  }

  function submit() {
    setFeedback(null)
    const payload: CreateManebRecordInput[] = []
    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i]!
      if (!r.candidateNo.trim() || !r.studentId.trim() || !r.centerNo.trim() || !r.centerName.trim()) {
        setFeedback(`Row ${i + 1}: candidate number, student, centre number and centre name are all required.`)
        return
      }
      const grades: Record<string, string> = {}
      for (const [subject, grade] of Object.entries(r.grades)) {
        if (grade.trim()) grades[subject] = grade.trim()
      }
      if (Object.keys(grades).length === 0) {
        setFeedback(`Row ${i + 1}: enter at least one subject grade.`)
        return
      }
      payload.push({
        studentId: r.studentId.trim(),
        examType,
        candidateNo: r.candidateNo.trim(),
        centerNo: r.centerNo.trim(),
        centerName: r.centerName.trim(),
        academicYear,
        subjectGrades: grades,
        status: 'RESULTS_RECEIVED',
      })
    }

    bulkCreate.mutate(payload, {
      onSuccess: (result) => {
        setFeedback(
          `Imported ${result.created.length} record${result.created.length === 1 ? '' : 's'}` +
            (result.errors.length > 0 ? ` — ${result.errors.length} row(s) failed (e.g. duplicate candidate number).` : '.'),
        )
        if (result.errors.length === 0) {
          setRows([emptyRow()])
          setShowBulk(false)
        }
      },
    })
  }

  const fieldClass =
    'w-full rounded-lg border border-base bg-page px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/40'

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
        <div className="flex items-center gap-3">
          {canManage && (
            <button onClick={() => setShowIndividual((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-navy text-brand-navy text-sm font-semibold hover:bg-brand-navy/5">
              {showIndividual ? 'Close individual entry' : 'Individual entry'}
            </button>
          )}
          {canManage && (
            <button onClick={() => setShowBulk((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-navy text-white text-sm font-semibold">
              <Upload className="w-4 h-4" /> {showBulk ? 'Close bulk entry' : 'Bulk entry'}
            </button>
          )}
          <a href="https://www.maneb.edu.mw/" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-brand-teal hover:underline">
            <ExternalLink className="w-3.5 h-3.5" /> MANEB Portal
          </a>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
        <GraduationCap className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          Grading follows official MANEB standards.{' '}
          {examType === 'MSCE'
            ? 'MSCE (Form 3 & 4): Grade 1 (80–100%) through Grade 9 (0–24%). Pass = Grade 1–6 (35%+).'
            : 'JCE (Form 1 & 2): Grade A (80–100%) through Grade F (0–34%). Pass = A–E (35%+).'}
          {' '}Verify at{' '}
          <a href="https://www.maneb.edu.mw/" target="_blank" rel="noopener noreferrer" className="underline">maneb.edu.mw</a>.
        </span>
      </div>

      {showIndividual && canManage && (
        <div className="border border-base rounded-xl p-4 space-y-3">
          <p className="text-sm font-heading font-semibold">Individual {examType} entry — {academicYear}</p>
          <p className="text-xs text-muted">
            For a single candidate. Grades are entered per subject; leave a subject blank if the candidate did not
            sit it. Saved with status - Results received.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <input className={fieldClass} placeholder="Candidate no." value={individualRow.candidateNo} onChange={(e) => setIndividualRow((p) => ({ ...p, candidateNo: e.target.value }))} />
            <input className={fieldClass} placeholder="Student ID" value={individualRow.studentId} onChange={(e) => setIndividualRow((p) => ({ ...p, studentId: e.target.value }))} />
            <input className={fieldClass} placeholder="Centre no." value={individualRow.centerNo} onChange={(e) => setIndividualRow((p) => ({ ...p, centerNo: e.target.value }))} />
            <input className={fieldClass} placeholder="Centre name" value={individualRow.centerName} onChange={(e) => setIndividualRow((p) => ({ ...p, centerName: e.target.value }))} />
          </div>
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            {QUICK_SUBJECTS.map((subject) => (
              <div key={subject}>
                <label className="block text-[10px] text-muted mb-0.5 truncate" title={subject}>{subject}</label>
                <input
                  className={fieldClass}
                  placeholder={examType === 'MSCE' ? '1–9' : 'A–F'}
                  value={individualRow.grades[subject] ?? ''}
                  onChange={(e) => setIndividualRow((p) => ({ ...p, grades: { ...p.grades, [subject]: e.target.value } }))}
                />
              </div>
            ))}
          </div>
          {individualFeedback && <p className="text-sm text-brand-coral">{individualFeedback}</p>}
          <button
            onClick={() => {
              setIndividualFeedback(null)
              if (!individualRow.candidateNo.trim() || !individualRow.studentId.trim() || !individualRow.centerNo.trim() || !individualRow.centerName.trim()) {
                setIndividualFeedback('Candidate number, student, centre number and centre name are all required.')
                return
              }
              const grades: Record<string, string> = {}
              for (const [subject, grade] of Object.entries(individualRow.grades)) {
                if (grade.trim()) grades[subject] = grade.trim()
              }
              if (Object.keys(grades).length === 0) {
                setIndividualFeedback('Enter at least one subject grade.')
                return
              }
              createRecord.mutate(
                {
                  studentId: individualRow.studentId.trim(),
                  examType,
                  candidateNo: individualRow.candidateNo.trim(),
                  centerNo: individualRow.centerNo.trim(),
                  centerName: individualRow.centerName.trim(),
                  academicYear,
                  subjectGrades: grades,
                  status: 'RESULTS_RECEIVED',
                },
                {
                  onSuccess: () => {
                    setIndividualFeedback(null)
                    setIndividualRow(emptyRow())
                    setShowIndividual(false)
                  },
                  onError: (err) => setIndividualFeedback(err instanceof Error ? err.message : 'Failed to save record.'),
                },
              )
            }}
            disabled={createRecord.isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-navy text-white text-sm font-semibold disabled:opacity-60"
          >
            {createRecord.isPending ? 'Saving…' : 'Save Record'}
          </button>
        </div>
      )}

      {showBulk && canManage && (
        <div className="border border-base rounded-xl p-4 space-y-3">
          <p className="text-sm font-heading font-semibold">Bulk {examType} entry — {academicYear}</p>
          <p className="text-xs text-muted">
            Add one row per candidate. Grades are entered per subject; leave a subject blank if the candidate did not
            sit it. Records are saved with status “Results received”. MANEB is the authority — enter grades exactly as
            reported.
          </p>

          <div className="space-y-3">
            {rows.map((r, i) => (
              <div key={i} className="rounded-lg border border-base p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted">Candidate {i + 1}</span>
                  {rows.length > 1 && (
                    <button onClick={() => removeRow(i)} className="text-muted hover:text-rose-600" aria-label={`Remove candidate ${i + 1}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <input className={fieldClass} placeholder="Candidate no." value={r.candidateNo} onChange={(e) => updateRow(i, { candidateNo: e.target.value })} />
                  <input className={fieldClass} placeholder="Student ID" value={r.studentId} onChange={(e) => updateRow(i, { studentId: e.target.value })} />
                  <input className={fieldClass} placeholder="Centre no." value={r.centerNo} onChange={(e) => updateRow(i, { centerNo: e.target.value })} />
                  <input className={fieldClass} placeholder="Centre name" value={r.centerName} onChange={(e) => updateRow(i, { centerName: e.target.value })} />
                </div>
                <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
                  {QUICK_SUBJECTS.map((subject) => (
                    <div key={subject}>
                      <label className="block text-[10px] text-muted mb-0.5 truncate" title={subject}>{subject}</label>
                      <input
                        className={fieldClass}
                        placeholder={examType === 'MSCE' ? '1–9' : 'A–F'}
                        value={r.grades[subject] ?? ''}
                        onChange={(e) => updateGrade(i, subject, e.target.value)}
                        aria-label={`${subject} grade for candidate ${i + 1}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button onClick={addRow} className="inline-flex items-center gap-1.5 text-sm text-brand-teal font-semibold hover:underline">
              <Plus className="w-4 h-4" /> Add candidate
            </button>
            <button onClick={submit} disabled={bulkCreate.isPending}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-navy text-white text-sm font-semibold disabled:opacity-60 ml-auto">
              {bulkCreate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Import {rows.length} candidate{rows.length === 1 ? '' : 's'}
            </button>
          </div>

          {feedback && <p className="text-sm text-brand-navy" role="status">{feedback}</p>}
        </div>
      )}

      {isLoading && <div className="text-center py-12 text-muted text-sm animate-pulse">Loading records…</div>}

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-16 text-muted text-sm border border-base rounded-xl">
          No {examType} records for {academicYear}.
          {['admin', 'exam_officer'].includes(role ?? '') && ' Use “Bulk entry” to add candidates.'}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="border border-base rounded-xl overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-page border-b border-base">
                {['Candidate No','Student','Centre','Subjects','Overall Grade','Status'].map((h) => (
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