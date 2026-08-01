/**
 * [CHANGE TYPE]: TARGETED EDIT (output in full — the button-visibility
 *   logic, data-fetching, and "Compute Results" handler all change); R8
 *   further adds three tabs (Report Cards, Promotion, Results Release)
 * [FILE]: apps/web/src/app/(auth)/exams/page.tsx
 * [R-PHASE]: R7 — Academics III: Exam Pipeline Repair & Grading Engine
 *   Unification; further edited in R8 — Academics IV: Report Cards,
 *   Transcripts, Promotion & Risk Assessment
 * [PURPOSE — R8]: Added three tabs giving ReportCardGenerator.tsx,
 *   PromotionEngine.tsx, and ResultsReleaseWorkflow.tsx (all pre-existing,
 *   functional components with zero real importer anywhere in the app)
 *   their first real UI homes, visible to every role except student/
 *   lower_rank (the components themselves gate their own actions further).
 * [PURPOSE — R7]:
 *   1. "Compute Results" button: the local apiPost('/exams/compute') call
 *      (sent with no request body, guaranteed to 400) is replaced with a
 *      call through the canonical apiFetch, supplying the required
 *      classId/academicYear/term — the local apiPost() helper (and its
 *      firebase/auth import) is removed entirely, consistent with R1's
 *      one-client standard. The result/error is now surfaced to the user
 *      (previously discarded silently regardless of outcome).
 *   2. "All classes…" filter: useExams(selectedClassId || undefined, ...)
 *      in place of always passing selectedClassId — useExams.ts (this same
 *      phase) no longer disables the query when classId is empty, so
 *      selecting "All classes" runs a real aggregated query instead of
 *      showing a misleading "No exams scheduled yet" empty state caused by
 *      a disabled query, not an actually-empty result.
 *   3. Replaced the hardcoded CURRENT_YEAR = '2025/2026' with
 *      usePublicSchoolInfo()'s currentYear (the same live source R5
 *      established for exactly this purpose), and the inline
 *      ['SCHEDULED','IN_PROGRESS','MARKS_PENDING','MARKS_DRAFT'] status
 *      array with EXAM_MARKS_ENTERABLE_STATUSES (@shared/schemas/exam,
 *      this same phase) — full constants centralization is R15's job; this
 *      is the immediate correctness fix since the file is already open for
 *      the button fix.
 *   4. Button-visibility booleans (canManage/canEnterMarks and two more
 *      inline role-array checks) are replaced with usePermissions().can()
 *      checks matching exams.ts's newly-narrowed backend gates exactly
 *      (exam.create, exam.computeResults, exam.approveResults,
 *      exam.authorizeRelease, exam.enterOwnClassMarks) — the old,
 *      loosely-shared role arrays let admin/high_rank see Approve/Release/
 *      Enter-Marks controls that the now-correctly-narrowed backend
 *      permissions would reject, exactly the UI/backend mismatch class of
 *      bug this audit repeatedly flags.
 *   5. MarksEntrySheet now receives maxMark (sourced from the already-
 *      loaded exams list) so the sheet can validate against the specific
 *      exam's configured maximum instead of a fixed 100.
 * [DEPENDS ON]: apps/web/src/hooks/usePublic.ts (usePublicSchoolInfo),
 *   apps/web/src/hooks/usePermissions.ts, @shared/schemas/exam
 *   (EXAM_MARKS_ENTERABLE_STATUSES), apps/web/src/lib/api-client.ts
 *   (apiFetch)
 */
/*
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R15 — UI/UX Polish: Shared Components, Dashboards,
 *   Confirmation Dialogs & Data-Display Consistency
 * [PURPOSE]: (1) Initialises the active tab from ?tab= (post-hydration,
 *   validated against TABS) so dashboard quick actions can deep-link —
 *   /exams/marks, /exams/results and /exams/maneb never existed as
 *   routes. (2) The My Results tab passed studentId={user.uid} (a
 *   Firebase UID) to StudentResultsView where a Prisma Student.id is
 *   required — resolved via useStudentMe() (same phase), matching the
 *   StudentDashboard fix and the exams.ts route's corrected ownership
 *   check.
 * [DEPENDS ON]: W/hooks/useStudents.ts (useStudentMe, same phase)
 */
'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { useStudentMe } from '@/hooks/useStudents'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { ExamForm } from '@/components/exams/ExamForm'
import { MarksEntrySheet } from '@/components/exams/MarksEntrySheet'
import { AnalyticsPanel } from '@/components/exams/AnalyticsPanel'
import { ManebPanel } from '@/components/exams/ManebPanel'
import { StudentResultsView } from '@/components/exams/StudentResultsView'
import { ReportCardGenerator } from '@/components/exams/ReportCardGenerator'
import { PromotionEngine } from '@/components/exams/PromotionEngine'
import { ResultsReleaseWorkflow } from '@/components/exams/ResultsReleaseWorkflow'
import { useExams, useApproveResults, useReleaseResults } from '@/hooks/useExams'
import { useClasses } from '@/hooks/useClasses'
import { usePublicSchoolInfo } from '@/hooks/usePublic'
import { usePermissions } from '@/hooks/usePermissions'
import { apiFetch } from '@/lib/api-client'
import { EXAM_MARKS_ENTERABLE_STATUSES } from '@shared/schemas/exam'
import { ModuleTabs }        from '@/components/shared/ModuleTabs'
import {
  Calendar,
  Plus,
  BarChart2,
  GraduationCap,
  FileText,
  ChevronRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Printer,
  TrendingUp,
  Send,
} from 'lucide-react'
import type { ApiExam, ApiClass } from '@shared/types/api'

const ALLOWED_ROLES = [
  'admin',
  'high_rank',
  'academic',
  'exam_officer',
  'lower_rank',
  'student',
] as const

// 'report-cards', 'promotion', and 'release' give ReportCardGenerator.tsx,
// PromotionEngine.tsx, and ResultsReleaseWorkflow.tsx (all pre-existing,
// functional, but previously unimported anywhere in the app) their real
// UI homes (R8) — the components themselves gate their own actions via
// usePermissions()/role checks; the tabs are visible to the same
// management-facing roles the rest of this page already serves.
const TABS = [
  { id: 'exams', label: 'Exams', icon: Calendar },
  { id: 'analytics', label: 'Analytics', icon: BarChart2 },
  { id: 'maneb', label: 'MANEB', icon: GraduationCap },
  { id: 'report-cards', label: 'Report Cards', icon: Printer },
  { id: 'promotion', label: 'Promotion', icon: TrendingUp },
  { id: 'release', label: 'Results Release', icon: Send },
  { id: 'results', label: 'My Results', icon: FileText },
] as const

type Tab = (typeof TABS)[number]['id']

// Fallback used only while usePublicSchoolInfo() is still loading —
// matches the same fallback settingsService.ts itself uses server-side.
const FALLBACK_YEAR = '2025/2026'

function ExamsPageInner() {
  const { role, setTitle, setSubtitle } = useAuthStore()
  // R19 — the active tab is derived from ?tab= during render via Next's
  // useSearchParams() (the codebase's established pattern — see
  // (public)/login/page.tsx) instead of a useEffect that read
  // window.location.search and called setTab post-mount. Because
  // useSearchParams() is backed by the actual request URL on the server,
  // this also renders the correct deep-linked tab on first paint instead of
  // always showing 'exams' until the effect corrects it client-side.
  // /exams/marks, /exams/results and /exams/maneb never existed as routes.
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const initialTab: Tab = tabParam && TABS.some((x) => x.id === tabParam) ? (tabParam as Tab) : 'exams'

  const [tab, setTab] = useState<Tab>(initialTab)
  const [term, setTerm] = useState(1)
  const [selectedClassId, setSelectedClassId] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [marksExamId, setMarksExamId] = useState<string | null>(null)
  // [PRODUCTION FIX 2026-07-28] Separate from marksExamId (teacher entry)
  // — exam officers reviewing before approval reuse the same sheet in
  // read-only mode, but need their own state so opening one doesn't
  // interfere with the other.
  const [reviewExamId, setReviewExamId] = useState<string | null>(null)
  // ET-1 / ET-2: exam-tab drill-downs — scheduled exam detail, released marks list.
  const [detailExamId, setDetailExamId] = useState<string | null>(null)
  const [viewMarksExamId, setViewMarksExamId] = useState<string | null>(null)
  const [computing, setComputing] = useState(false)
  const [computeResult, setComputeResult] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const { data: myStudent, isLoading: myStudentLoading } = useStudentMe()
  const { data: schoolInfo } = usePublicSchoolInfo()
  const academicYear = schoolInfo?.currentYear ?? FALLBACK_YEAR

  useEffect(() => {
    setTitle('Exams & Results')
    setSubtitle(`${academicYear} — Term ${term}`)
    return () => {
      setTitle(null)
      setSubtitle(null)
    }
  }, [term, academicYear, setTitle, setSubtitle])

  const { data: classesData } = useClasses(academicYear)
  const classes = (classesData ?? []) as ApiClass[]

  const { data: examsData, isLoading: examsLoading } = useExams(
    selectedClassId || undefined,
    academicYear,
    term
  )
  const exams = (examsData ?? []) as ApiExam[]
  const marksExam = marksExamId ? exams.find((e) => e.id === marksExamId) : undefined
  const reviewExam = reviewExamId ? exams.find((e) => e.id === reviewExamId) : undefined
  const detailExam = detailExamId ? exams.find((e) => e.id === detailExamId) : undefined
  const viewMarksExam = viewMarksExamId ? exams.find((e) => e.id === viewMarksExamId) : undefined

  const approveResults = useApproveResults()
  const releaseResults = useReleaseResults()
  const { can } = usePermissions()

  const canScheduleExam    = can('exam.create')
  const canComputeResults  = can('exam.computeResults')
  const canApprove         = can('exam.approveResults')
  const canRelease         = can('exam.authorizeRelease')
  const canEnterMarks      = can('exam.enterOwnClassMarks')
  const canCorrect         = can('exam.correctMarksInReview')

  async function handleCompute() {
    if (!selectedClassId) return
    setComputing(true)
    setComputeResult(null)
    try {
      const result = await apiFetch<{ computed: number }>('/exams/compute', {
        method: 'POST',
        body: JSON.stringify({ classId: selectedClassId, academicYear, term }),
      })
      setComputeResult({
        kind: 'success',
        text: `Computed results for ${result.computed} student(s).`,
      })
    } catch (err) {
      setComputeResult({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Failed to compute results.',
      })
    } finally {
      setComputing(false)
    }
  }

  // Hide 'My Results' tab for non-students; hide the management tabs
  // (Report Cards, Promotion, Results Release) from student/lower_rank —
  // the components themselves also gate their actions, this just avoids
  // showing a tab whose contents a role can only ever view, never act on.
  const MANAGEMENT_TABS: Tab[] = ['report-cards', 'promotion', 'release']
  const visibleTabs = TABS.filter((t) => {
    if (t.id === 'results') return role === 'student'
    if (MANAGEMENT_TABS.includes(t.id)) return role !== 'student' && role !== 'lower_rank'
    return true
  })

  return (
    <RoleGuard allowed={[...ALLOWED_ROLES]}>
      <div className="min-h-screen bg-page">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* R19 — real page heading (was absent, unlike sibling module pages),
             giving assistive tech and E2E heading-role checks a landmark. */}
          <h1 className="font-heading text-2xl font-bold text-brand-navy">Exams</h1>

          {/* Mobile-scrollable pill tab navigation — C7 */}
            <ModuleTabs<Tab>
              tabs={visibleTabs}
              active={tab}
              onChange={setTab}
              variant="pill"
              id="exams-tabs"
            />

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
                {canScheduleExam && (
                  <button
                    onClick={() => setShowForm(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-brand-teal text-white rounded-xl text-sm font-semibold hover:bg-brand-teal-light ml-auto"
                  >
                    <Plus className="w-4 h-4" /> Schedule Exam
                  </button>
                )}
                {canComputeResults && selectedClassId && (
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
              </div>

              {computeResult && (
                <p
                  role={computeResult.kind === 'success' ? 'status' : 'alert'}
                  className={`flex items-center gap-2 text-sm rounded-xl px-4 py-3 border ${
                    computeResult.kind === 'success'
                      ? 'text-brand-teal bg-brand-teal/8 border-brand-teal/20'
                      : 'text-brand-coral bg-brand-coral/8 border-brand-coral/20'
                  }`}
                >
                  {computeResult.kind === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
                  )}
                  {computeResult.text}
                </p>
              )}

              {examsLoading && (
                <div className="text-center py-16 text-muted text-sm animate-pulse">
                  Loading exams…
                </div>
              )}

              {!examsLoading && exams.length === 0 && (
                <div className="text-center py-20 text-muted text-sm border border-base rounded-2xl">
                  No exams scheduled yet.{canScheduleExam && ' Click "Schedule Exam" to add one.'}
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
                            <button
                              type="button"
                              onClick={() => exam.status === 'RESULTS_RELEASED' ? setViewMarksExamId(exam.id) : setDetailExamId(exam.id)}
                              className="text-left hover:underline"
                              title={exam.status === 'RESULTS_RELEASED' ? 'View released marks' : 'View exam details'}
                            >
                              <p className="font-medium text-body">{exam.title}</p>
                              <p className="text-xs text-muted">{exam.type.replace(/_/g, ' ')}</p>
                            </button>
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
                                (EXAM_MARKS_ENTERABLE_STATUSES as readonly string[]).includes(exam.status) && (
                                  <button
                                    onClick={() => setMarksExamId(exam.id)}
                                    className="text-xs text-brand-teal hover:underline flex items-center gap-1"
                                  >
                                    Enter Marks <ChevronRight className="w-3 h-3" />
                                  </button>
                                )}
                              {(canApprove || canCorrect) && (exam.status === 'MARKS_FINAL' || exam.status === 'RESULTS_APPROVED') && (
                                <button
                                  onClick={() => setReviewExamId(exam.id)}
                                  className="text-xs text-brand-teal hover:underline flex items-center gap-1"
                                >
                                  {canCorrect ? 'Review / Correct' : 'Review Marks'} <ChevronRight className="w-3 h-3" />
                                </button>
                              )}
                              {canApprove && exam.status === 'MARKS_FINAL' && (
                                <button
                                  onClick={() => approveResults.mutate(exam.id)}
                                  disabled={approveResults.isPending}
                                  className="text-xs text-brand-navy hover:underline"
                                >
                                  Approve
                                </button>
                              )}
                              {canRelease && exam.status === 'RESULTS_APPROVED' && (
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
              academicYear={academicYear}
              selectedClassId={selectedClassId}
              term={term}
            />
          )}

          {/* ── MANEB TAB ── */}
          {tab === 'maneb' && <ManebPanel academicYear={academicYear} />}

          {/* ── REPORT CARDS TAB ── */}
          {tab === 'report-cards' && <ReportCardGenerator />}

          {/* ── PROMOTION TAB ── */}
          {tab === 'promotion' && <PromotionEngine />}

          {/* ── RESULTS RELEASE TAB ── */}
          {tab === 'release' && (
            <div className="space-y-4">
              {/* [PRODUCTION FIX 2026-07-28] Previously required selecting
                  a class from the Exams tab first — if nothing was already
                  selected, this tab showed just a passive instruction with
                  no way to act, looking exactly like missing UI even
                  though ResultsReleaseWorkflow's real release buttons were
                  there all along, just unreachable. Now has its own
                  selector, same shared selectedClassId state. */}
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                aria-label="Select class to review for release"
                className="border border-base rounded-xl px-3 py-2 text-sm bg-surface focus:outline-none"
              >
                <option value="">Select a class…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {selectedClassId ? (
                <ResultsReleaseWorkflow
                  classId={selectedClassId}
                  academicYear={academicYear}
                  term={term}
                />
              ) : (
                <div className="text-center py-16 text-muted text-sm border border-base rounded-2xl">
                  Select a class above to review its results release status.
                </div>
              )}
            </div>
          )}

          {/* ── MY RESULTS TAB (students only) ──
              R15: StudentResultsView needs a Prisma Student.id —
              examService.getStudentResults() queries TermResult.studentId
              with it — so the signed-in student's real record id is
              resolved through useStudentMe() (GET /students/me) instead of
              passing the Firebase UID, which never matched any row. */}
          {tab === 'results' && role === 'student' && (
            myStudent?.id ? (
              <StudentResultsView studentId={myStudent.id} />
            ) : (
              <p className="text-sm text-muted text-center py-16" role="status">
                {myStudentLoading
                  ? 'Loading your student record…'
                  : 'Your student record could not be found. Please contact the school office.'}
              </p>
            )
          )}
        </div>

        {/* Modals */}
        {showForm && (
          <ExamForm onClose={() => setShowForm(false)} academicYear={academicYear} term={term} />
        )}
        {marksExamId && (
          <MarksEntrySheet
            examId={marksExamId}
            classId={selectedClassId}
            maxMark={marksExam?.maxMark ?? 100}
            onClose={() => setMarksExamId(null)}
          />
        )}
        {reviewExamId && reviewExam && (
          <MarksEntrySheet
            examId={reviewExamId}
            classId={reviewExam.classId}
            maxMark={reviewExam.maxMark ?? 100}
            onClose={() => setReviewExamId(null)}
            correctionMode={canCorrect}
            readOnly={!canCorrect}
          />
        )}

        {/* ET-2: released exam — read-only marks list */}
        {viewMarksExamId && viewMarksExam && (
          <MarksEntrySheet
            examId={viewMarksExamId}
            classId={viewMarksExam.classId}
            maxMark={viewMarksExam.maxMark ?? 100}
            onClose={() => setViewMarksExamId(null)}
            readOnly
          />
        )}

        {/* ET-1: exam detail */}
        {detailExamId && detailExam && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Exam details">
            <div className="absolute inset-0" onClick={() => setDetailExamId(null)} />
            <div className="relative z-10 w-full max-w-lg bg-surface rounded-2xl shadow-xl overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-base">
                <div>
                  <h2 className="font-heading font-bold text-brand-navy">{detailExam.title}</h2>
                  <p className="text-xs text-muted mt-0.5">{detailExam.type.replace(/_/g, ' ')} · {detailExam.status.replace(/_/g, ' ')}</p>
                </div>
                <button type="button" onClick={() => setDetailExamId(null)} aria-label="Close" className="p-2 hover:bg-page rounded-xl">
                  <ChevronRight className="w-4 h-4 text-muted rotate-90" />
                </button>
              </div>
              <dl className="px-6 py-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {[
                  ['Subject', detailExam.subject],
                  ['Class', detailExam.className ?? detailExam.classId],
                  ['Date', new Date(detailExam.date).toLocaleDateString('en-MW', { day: '2-digit', month: 'short', year: 'numeric' })],
                  ['Time', `${detailExam.timeStart} – ${detailExam.timeEnd}`],
                  ['Venue', detailExam.venue],
                  ['Max mark', String(detailExam.maxMark)],
                  ['Weight', `${detailExam.weightPercent}%`],
                  ['Term', `Term ${detailExam.term} · ${detailExam.academicYear}`],
                  ['Students', detailExam.totalStudents != null ? String(detailExam.totalStudents) : '—'],
                  ['Marks entered', detailExam.marksEntered != null ? String(detailExam.marksEntered) : '—'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
                    <dd className="text-body font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  )
}

// `useSearchParams()` requires a Suspense boundary or `next build` fails —
// same convention as (public)/login/page.tsx.
export default function ExamsPage() {
  return (
    <Suspense fallback={<div className="p-6 space-y-3"><div className="h-8 w-40 rounded-lg bg-surface animate-pulse" /><div className="h-48 rounded-xl bg-surface animate-pulse" /></div>}>
      <ExamsPageInner />
    </Suspense>
  )
}