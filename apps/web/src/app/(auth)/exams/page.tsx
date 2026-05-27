'use client'
import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { ExamForm } from '@/components/exams/ExamForm'
import { MarksEntrySheet } from '@/components/exams/MarksEntrySheet'
import { AnalyticsPanel } from '@/components/exams/AnalyticsPanel'
import { ManebPanel } from '@/components/exams/ManebPanel'
import { StudentResultsView } from '@/components/exams/StudentResultsView'
import { useExams, useApproveResults, useReleaseResults } from '@/hooks/useExams'
import { useClasses } from '@/hooks/useClasses'
import {
  Calendar,
  Plus,
  BarChart2,
  GraduationCap,
  FileText,
  ChevronRight,
  Loader2,
} from 'lucide-react'
import type { ApiExam, ApiClass } from '@shared/types/api'
import { getAuth } from 'firebase/auth'

const ALLOWED_ROLES = [
  'admin',
  'high_rank',
  'academic',
  'exam_officer',
  'lower_rank',
  'student',
] as const

const TABS = [
  { id: 'exams', label: 'Exams', icon: Calendar },
  { id: 'analytics', label: 'Analytics', icon: BarChart2 },
  { id: 'maneb', label: 'MANEB', icon: GraduationCap },
  { id: 'results', label: 'My Results', icon: FileText },
] as const

type Tab = (typeof TABS)[number]['id']

const CURRENT_YEAR = '2025/2026'

async function apiPost(path: string) {
  const token = await getAuth().currentUser?.getIdToken()
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
  })
  return res.json()
}

export default function ExamsPage() {
  const { role, user, setTitle, setSubtitle } = useAuthStore()
  const [tab, setTab] = useState<Tab>('exams')
  const [term, setTerm] = useState(1)
  const [selectedClassId, setSelectedClassId] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [marksExamId, setMarksExamId] = useState<string | null>(null)
  const [computing, setComputing] = useState(false)

  useEffect(() => {
    setTitle('Exams & Results')
    setSubtitle(`${CURRENT_YEAR} — Term ${term}`)
    return () => {
      setTitle(null)
      setSubtitle(null)
    }
  }, [term, setTitle, setSubtitle])

  const { data: classesData } = useClasses(CURRENT_YEAR)
  const classes = (classesData ?? []) as ApiClass[]

  const { data: examsData, isLoading: examsLoading } = useExams(selectedClassId, CURRENT_YEAR, term)
  // Properly typed — useExams returns ApiExam[], data is ApiExam[] | undefined
  const exams = (examsData ?? []) as ApiExam[]

  const approveResults = useApproveResults()
  const releaseResults = useReleaseResults()

  const canManage = ['admin', 'high_rank', 'exam_officer'].includes(role ?? '')
  const canEnterMarks = ['academic', 'exam_officer', 'admin'].includes(role ?? '')

  async function handleCompute() {
    if (!selectedClassId) return
    setComputing(true)
    try {
      await apiPost(`/exams/compute`)
    } finally {
      setComputing(false)
    }
  }

  // Hide 'My Results' tab for non-students
  const visibleTabs = TABS.filter((t) => t.id !== 'results' || role === 'student')

  return (
    <RoleGuard allowed={[...ALLOWED_ROLES]}>
      <div className="min-h-screen bg-page">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Tab bar */}
          <div className="flex gap-1 bg-surface border border-base rounded-xl p-1 w-fit">
            {visibleTabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  tab === id ? 'bg-brand-navy text-white' : 'text-muted hover:text-body'
                }`}
              >
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>

          {/* ── EXAMS TAB ── */}
          {tab === 'exams' && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 flex-wrap">
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  aria-label="Select class"
                  className="border border-base rounded-xl px-3 py-2 text-sm bg-surface focus:outline-none"
                >
                  <option value="">All classes…</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  value={term}
                  onChange={(e) => setTerm(Number(e.target.value))}
                  aria-label="Select term"
                  className="border border-base rounded-xl px-3 py-2 text-sm bg-surface focus:outline-none"
                >
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      Term {n}
                    </option>
                  ))}
                </select>
                {canManage && (
                  <>
                    <button
                      onClick={() => setShowForm(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-brand-teal text-white rounded-xl text-sm font-semibold hover:bg-brand-teal-light ml-auto"
                    >
                      <Plus className="w-4 h-4" /> Schedule Exam
                    </button>
                    {selectedClassId && (
                      <button
                        onClick={handleCompute}
                        disabled={computing}
                        className="flex items-center gap-2 px-4 py-2 border border-base rounded-xl text-sm hover:bg-page disabled:opacity-60"
                      >
                        {computing ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <BarChart2 className="w-4 h-4" />
                        )}
                        Compute Results
                      </button>
                    )}
                  </>
                )}
              </div>

              {examsLoading && (
                <div className="text-center py-16 text-muted text-sm animate-pulse">
                  Loading exams…
                </div>
              )}

              {!examsLoading && exams.length === 0 && (
                <div className="text-center py-20 text-muted text-sm border border-base rounded-2xl">
                  No exams scheduled yet.{canManage && ' Click "Schedule Exam" to add one.'}
                </div>
              )}

              {exams.length > 0 && (
                <div className="border border-base rounded-2xl overflow-hidden bg-surface">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-page border-b border-base">
                        {['Title', 'Subject', 'Date', 'Status', 'Actions'].map((h) => (
                          <th
                            key={h}
                            className="px-5 py-3 text-left text-xs font-heading font-semibold text-muted uppercase tracking-wide"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-base">
                      {exams.map((exam) => (
                        <tr key={exam.id} className="hover:bg-page">
                          <td className="px-5 py-3">
                            <p className="font-medium text-body">{exam.title}</p>
                            <p className="text-xs text-muted">{exam.type.replace(/_/g, ' ')}</p>
                          </td>
                          <td className="px-5 py-3 text-muted">{exam.subject}</td>
                          <td className="px-5 py-3 text-muted">
                            {new Date(exam.date).toLocaleDateString('en-MW')}
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                exam.status === 'RESULTS_RELEASED'
                                  ? 'bg-green-100 text-green-700'
                                  : exam.status === 'RESULTS_APPROVED'
                                    ? 'bg-brand-teal/15 text-brand-teal'
                                    : exam.status === 'MARKS_FINAL'
                                      ? 'bg-blue-100 text-blue-700'
                                      : exam.status.includes('MARKS')
                                        ? 'bg-amber-100 text-amber-700'
                                        : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {exam.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              {canEnterMarks &&
                                [
                                  'SCHEDULED',
                                  'IN_PROGRESS',
                                  'MARKS_PENDING',
                                  'MARKS_DRAFT',
                                ].includes(exam.status) && (
                                  <button
                                    onClick={() => setMarksExamId(exam.id)}
                                    className="text-xs text-brand-teal hover:underline flex items-center gap-1"
                                  >
                                    Enter Marks <ChevronRight className="w-3 h-3" />
                                  </button>
                                )}
                              {canManage && exam.status === 'MARKS_FINAL' && (
                                <button
                                  onClick={() => approveResults.mutate(exam.id)}
                                  disabled={approveResults.isPending}
                                  className="text-xs text-brand-navy hover:underline"
                                >
                                  Approve
                                </button>
                              )}
                              {['admin', 'high_rank'].includes(role ?? '') &&
                                exam.status === 'RESULTS_APPROVED' && (
                                  <button
                                    onClick={() => releaseResults.mutate(exam.id)}
                                    disabled={releaseResults.isPending}
                                    className="text-xs text-green-700 hover:underline font-semibold"
                                  >
                                    Release to Students
                                  </button>
                                )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── ANALYTICS TAB ── */}
          {tab === 'analytics' && (
            <AnalyticsPanel
              academicYear={CURRENT_YEAR}
              selectedClassId={selectedClassId}
              term={term}
            />
          )}

          {/* ── MANEB TAB ── */}
          {tab === 'maneb' && <ManebPanel academicYear={CURRENT_YEAR} />}

          {/* ── MY RESULTS TAB (students only) ── */}
          {tab === 'results' && role === 'student' && user && (
            <StudentResultsView studentId={user.uid} />
          )}
        </div>

        {/* Modals */}
        {showForm && (
          <ExamForm onClose={() => setShowForm(false)} academicYear={CURRENT_YEAR} term={term} />
        )}
        {marksExamId && (
          <MarksEntrySheet
            examId={marksExamId}
            classId={selectedClassId}
            onClose={() => setMarksExamId(null)}
          />
        )}
      </div>
    </RoleGuard>
  )
}
