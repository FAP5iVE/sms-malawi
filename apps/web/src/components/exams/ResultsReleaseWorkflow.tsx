'use client'

/**
 * apps/web/src/components/exams/ResultsReleaseWorkflow.tsx — Phase D2
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R8 — Academics IV: Report Cards, Transcripts, Promotion &
 *   Risk Assessment
 * [PURPOSE]: Wired in as the real Approve/Release UI on the Exams page
 *   (exams/page.tsx, this same phase), replacing the inline ad-hoc
 *   approve/release buttons that page previously had. Fixed `import {
 *   apiClient }` — no such export has ever existed in api-client.ts (only
 *   apiFetch, the R1 canonical client) — a confirmed build-breaking error.
 *   Fixed canApprove/canRelease's role checks to match exams.ts's real,
 *   R7-narrowed gates (exam.approveResults → exam_officer only, not
 *   exam_officer-or-admin; exam.authorizeRelease → high_rank only, not
 *   high_rank-or-admin — admin holds neither permission under the real
 *   matrix) via usePermissions(), instead of a hand-typed role check that
 *   had drifted out of sync with the backend. Fixed its ExamSummary type
 *   mismatch by extending examService.listExams() (this same phase) to
 *   return feeBlockedCount/totalStudents/marksEntered/className — data the
 *   underlying query could already join for with modest additions.
 * [DEPENDS ON]: apps/web/src/hooks/usePermissions.ts
 *
 * Three-stage exam results release workflow component.
 *
 * Stage pipeline per ExamStatus:
 *   MARKS_FINAL       → [Exam Officer]  "Approve Results"   → RESULTS_APPROVED
 *   RESULTS_APPROVED  → [High Rank]     "Authorise Release" → RESULTS_RELEASED
 *   RESULTS_RELEASED  → Students can view (fee-gated)
 *
 * Fee gate:
 *   Students with outstanding fees cannot access RESULTS_RELEASED results.
 *   The component shows a per-exam count of fee-blocked students to help
 *   the finance team identify who needs to clear balances.
 *
 * API calls (all via api-client.ts):
 *   GET  /exams?classId=&academicYear=&term=           — list exams
 *   POST /exams/:id/approve                            — exam_officer only
 *   POST /exams/:id/release                            — high_rank only
 *
 * Props:
 *   classId      string   — filter to a specific class
 *   academicYear string   — e.g. "2025/2026"
 *   term         number   — 1 | 2 | 3
 */

import { useState, useCallback }         from 'react'
import { AnimatePresence, motion }        from 'framer-motion'
import {
  CheckCircle2,
  Clock,
  Eye,
  Lock,
  Loader2,
  ChevronRight,
  AlertTriangle,
  Users,
  Trophy,
  X,
}                                         from 'lucide-react'
import { useMotionEnabled }               from '@/store/motionStore'
import { usePermissions }                 from '@/hooks/usePermissions'
import {
  LIST_CONTAINER_VARIANTS,
  LIST_ITEM_VARIANTS,
  reducedMotionVariants,
  reducedMotionTransition,
  DURATION,
  EASE,
}                                         from '@/lib/motion'
import { apiFetch }                       from '@/lib/api-client'

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type ExamStatus =
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'MARKS_PENDING'
  | 'MARKS_DRAFT'
  | 'MARKS_FINAL'
  | 'RESULTS_APPROVED'
  | 'RESULTS_RELEASED'

interface ExamSummary {
  id:               string
  title:            string
  subject:          string
  className:        string
  examDate:         string
  status:           ExamStatus
  totalStudents:    number
  feeBlockedCount:  number
  marksEntered:     number
}

interface FeeBlockedStudent {
  studentId:      string
  name:           string
  registrationNo: string
  balance:        number
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ExamStatus, {
  label:  string
  icon:   React.ElementType
  chip:   string
  step:   number
}> = {
  SCHEDULED:        { label: 'Scheduled',       icon: Clock,         chip: 'bg-base text-muted border-base',                   step: 0 },
  IN_PROGRESS:      { label: 'In Progress',     icon: Clock,         chip: 'bg-blue-50 text-blue-600 border-blue-200',          step: 1 },
  MARKS_PENDING:    { label: 'Marks Pending',   icon: Clock,         chip: 'bg-brand-amber/10 text-brand-amber border-brand-amber/25', step: 2 },
  MARKS_DRAFT:      { label: 'Marks (Draft)',   icon: Clock,         chip: 'bg-brand-amber/10 text-brand-amber border-brand-amber/25', step: 2 },
  MARKS_FINAL:      { label: 'Marks Final',     icon: CheckCircle2,  chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', step: 3 },
  RESULTS_APPROVED: { label: 'Exam Approved',   icon: CheckCircle2,  chip: 'bg-brand-teal/10 text-brand-teal border-brand-teal/25',   step: 4 },
  RESULTS_RELEASED: { label: 'Released',        icon: Eye,           chip: 'bg-purple-50 text-purple-700 border-purple-200',    step: 5 },
}

const PIPELINE_STEPS = [
  { label: 'Scheduled',    step: 0 },
  { label: 'In Progress',  step: 1 },
  { label: 'Marks Entry',  step: 2 },
  { label: 'Marks Final',  step: 3 },
  { label: 'Approved',     step: 4 },
  { label: 'Released',     step: 5 },
]

// ─────────────────────────────────────────────────────────────────────────────
// STATUS BADGE
// ─────────────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ExamStatus }) {
  const { label, icon: Icon, chip } = STATUS_CONFIG[status]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-heading font-semibold border ${chip}`}>
      <Icon className="w-3 h-3 shrink-0" aria-hidden />
      {label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE PROGRESS BAR
// ─────────────────────────────────────────────────────────────────────────────

function PipelineBar({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center gap-0 w-full" aria-hidden>
      {PIPELINE_STEPS.map(({ label, step }, idx) => {
        const done   = step < currentStep
        const active = step === currentStep
        return (
          <div key={step} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`
                  w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold
                  ${done   ? 'bg-brand-teal text-white'
                  : active ? 'bg-brand-navy text-white ring-2 ring-brand-navy/30'
                  :          'bg-base text-muted border border-base'}
                `}
              >
                {done ? '✓' : step + 1}
              </div>
              <span className={`text-[9px] whitespace-nowrap ${active ? 'text-brand-navy font-semibold' : 'text-muted'}`}>
                {label}
              </span>
            </div>
            {idx < PIPELINE_STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mb-4 mx-0.5 ${step < currentStep ? 'bg-brand-teal' : 'bg-base'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EXAM ACTION ROW
// ─────────────────────────────────────────────────────────────────────────────

interface ExamRowProps {
  exam:      ExamSummary
  onAction:  (examId: string, action: 'approve' | 'release') => Promise<void>
  loading:   boolean
  canApprove: boolean
  canRelease: boolean
  onShowFeeBlocked: () => void
}

function ExamRow({ exam, onAction, loading, canApprove, canRelease, onShowFeeBlocked }: ExamRowProps) {
  const step = STATUS_CONFIG[exam.status].step
  const showApproveBtn = canApprove && exam.status === 'MARKS_FINAL'
  const showReleaseBtn = canRelease && exam.status === 'RESULTS_APPROVED'

  return (
    <div className="bg-surface border border-base rounded-xl p-5 space-y-4">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-heading font-semibold text-body">{exam.title}</h3>
            <StatusBadge status={exam.status} />
          </div>
          <p className="text-xs text-muted mt-0.5">
            {exam.subject} · {exam.className} · {new Date(exam.examDate).toLocaleDateString('en-MW', { day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-muted">
            <Users className="w-3.5 h-3.5" />
            <span>{exam.marksEntered}/{exam.totalStudents} marks</span>
          </div>
          {exam.feeBlockedCount > 0 && (
            <div className="flex items-center gap-1.5 text-brand-coral text-xs font-semibold">
              <Lock className="w-3.5 h-3.5" />
              {exam.feeBlockedCount} fee-blocked
            </div>
          )}
        </div>
      </div>

      {/* Pipeline progress */}
      <PipelineBar currentStep={step} />

      {/* Action buttons */}
      {(showApproveBtn || showReleaseBtn) && (
        <div className="flex items-center gap-3 pt-1">
          {showApproveBtn && (
            <button
              type="button"
              disabled={loading}
              onClick={() => onAction(exam.id, 'approve')}
              className="flex items-center gap-2 min-h-[44px] px-5 rounded-xl text-sm font-heading font-semibold bg-brand-teal text-white hover:bg-brand-teal/90 transition-colors disabled:opacity-60"
            >
              {loading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <CheckCircle2 className="w-4 h-4" />}
              Approve Results
            </button>
          )}
          {showReleaseBtn && (
            <>
              {exam.feeBlockedCount > 0 && (
                <button type="button" onClick={onShowFeeBlocked}
                  className="flex items-center gap-1.5 text-xs text-brand-amber bg-brand-amber/10 border border-brand-amber/25 px-3 py-2 rounded-xl hover:bg-brand-amber/15 transition-colors">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {exam.feeBlockedCount} students will not see results until fees are cleared. View list
                </button>
              )}
              <button
                type="button"
                disabled={loading}
                onClick={() => onAction(exam.id, 'release')}
                className="flex items-center gap-2 min-h-[44px] px-5 rounded-xl text-sm font-heading font-semibold bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors disabled:opacity-60"
              >
                {loading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Eye className="w-4 h-4" />}
                Authorise Release
              </button>
            </>
          )}
        </div>
      )}

      {exam.status === 'RESULTS_RELEASED' && (
        <p className="text-xs text-emerald-600 flex items-center gap-1.5 flex-wrap">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Results are live.{' '}
          {exam.feeBlockedCount > 0
            ? <button type="button" onClick={onShowFeeBlocked} className="text-brand-amber underline hover:no-underline">{exam.feeBlockedCount} student(s) blocked by unpaid fees — view list</button>
            : 'All students can view results.'}
        </p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULTS RELEASE WORKFLOW
// ─────────────────────────────────────────────────────────────────────────────

interface ResultsReleaseWorkflowProps {
  classId:      string
  academicYear: string
  term:         number
}

export function ResultsReleaseWorkflow({
  classId,
  academicYear,
  term,
}: ResultsReleaseWorkflowProps) {
  const motionEnabled  = useMotionEnabled()
  const { can }        = usePermissions()

  const canApprove = can('exam.approveResults')
  const canRelease = can('exam.authorizeRelease')

  const [exams,      setExams]      = useState<ExamSummary[]>([])
  const [fetched,    setFetched]    = useState(false)
  const [fetchLoading, setFetchLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error,      setError]      = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<ExamStatus | 'ALL'>('ALL')
  const [feeBlocked,   setFeeBlocked]   = useState<FeeBlockedStudent[] | null>(null)
  const [feeLoading,   setFeeLoading]   = useState(false)
  const [releasing,    setReleasing]    = useState(false)
  const [releaseNote,  setReleaseNote]  = useState<string | null>(null)

  const fetchExams = useCallback(async () => {
    setFetchLoading(true)
    setError(null)
    try {
      const data = await apiFetch<ExamSummary[]>(
        `/exams?classId=${classId}&academicYear=${encodeURIComponent(academicYear)}&term=${term}`,
      )
      setExams(data)
      setFetched(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load exams')
    } finally {
      setFetchLoading(false)
    }
  }, [classId, academicYear, term])

  const handleAction = useCallback(async (
    examId: string,
    action: 'approve' | 'release',
  ) => {
    setActionLoading(examId)
    setError(null)
    try {
      await apiFetch(`/exams/${examId}/${action}`, { method: 'POST' })
      await fetchExams()
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to ${action}`)
    } finally {
      setActionLoading(null)
    }
  }, [fetchExams])

  // RW-2: fetch which students are fee-blocked for this class + term.
  const openFeeBlocked = useCallback(async () => {
    setFeeLoading(true)
    setFeeBlocked([])
    try {
      const data = await apiFetch<FeeBlockedStudent[]>(
        `/exams/fee-blocked?classId=${classId}&academicYear=${encodeURIComponent(academicYear)}&term=${term}`,
      )
      setFeeBlocked(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load fee-blocked students')
      setFeeBlocked(null)
    } finally {
      setFeeLoading(false)
    }
  }, [classId, academicYear, term])

  // RW-4 + RW-5: release ALL end-of-term results for the term in unison, then
  // post the combined top-10 announcement. School-wide, not per class.
  const handleReleaseTerm = useCallback(async () => {
    setReleasing(true)
    setError(null)
    setReleaseNote(null)
    try {
      const res = await apiFetch<{ released: number; announced: boolean }>(
        '/exams/release-term', { method: 'POST', body: JSON.stringify({ academicYear, term }) },
      )
      setReleaseNote(
        `Released ${res.released} end-of-term exam(s) in unison.` +
        (res.announced ? ' Top-10 performers announced to the school.' : ''),
      )
      await fetchExams()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to release term results')
    } finally {
      setReleasing(false)
    }
  }, [academicYear, term, fetchExams])

  const filteredExams = filterStatus === 'ALL'
    ? exams
    : exams.filter((e) => e.status === filterStatus)

  const containerVariants = reducedMotionVariants(motionEnabled, LIST_CONTAINER_VARIANTS)
  const itemVariants      = reducedMotionVariants(motionEnabled, LIST_ITEM_VARIANTS)
  const itemTransition    = reducedMotionTransition(motionEnabled, { duration: DURATION.normal, ease: EASE.out })

  return (
    <div className="space-y-5">

      {/* Header + load button */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-heading font-bold text-lg text-brand-navy">
            Results Release Workflow
          </h2>
          <p className="text-sm text-muted mt-0.5">
            {academicYear} · Term {term} · 3-stage approval pipeline
          </p>
        </div>

        <button
          type="button"
          onClick={fetchExams}
          disabled={fetchLoading}
          className="flex items-center gap-2 min-h-[44px] px-5 rounded-xl text-sm font-heading font-semibold bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors disabled:opacity-60"
        >
          {fetchLoading
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <ChevronRight className="w-4 h-4" />}
          {fetched ? 'Refresh' : 'Load Exams'}
        </button>
      </div>

      {/* RW-4/RW-5: release all end-of-term results in unison + top-10 announcement */}
      {canRelease && (
        <div className="flex items-center justify-between gap-3 flex-wrap bg-brand-navy/5 border border-brand-navy/15 rounded-xl px-4 py-3">
          <div className="flex items-start gap-2">
            <Trophy className="w-4 h-4 text-brand-navy shrink-0 mt-0.5" aria-hidden />
            <p className="text-xs text-body">
              Release <strong>all Form 1–4 end-of-term results</strong> for Term {term} together. Only
              works once every end-of-term exam is approved; posts one school-wide top-10 announcement.
            </p>
          </div>
          <button
            type="button"
            onClick={handleReleaseTerm}
            disabled={releasing}
            className="flex items-center gap-2 min-h-[44px] px-5 rounded-xl text-sm font-heading font-semibold bg-brand-teal text-white hover:bg-brand-teal/90 transition-colors disabled:opacity-60 shrink-0"
          >
            {releasing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
            Release End-of-Term (in unison)
          </button>
        </div>
      )}

      {releaseNote && (
        <div role="status" className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {releaseNote}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-brand-coral/8 border border-brand-coral/25 rounded-xl px-4 py-3 text-sm text-brand-coral">
          {error}
        </div>
      )}

      {/* Status filter chips */}
      {fetched && exams.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {(['ALL', 'MARKS_FINAL', 'RESULTS_APPROVED', 'RESULTS_RELEASED'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilterStatus(s)}
              className={`
                px-3 py-1.5 rounded-full text-xs font-heading font-semibold border transition-colors min-h-[36px]
                ${filterStatus === s
                  ? 'bg-brand-navy text-white border-brand-navy'
                  : 'bg-surface border-base text-muted hover:border-brand-navy/30 hover:text-body'}
              `}
            >
              {s === 'ALL' ? 'All' : STATUS_CONFIG[s].label}
              {s !== 'ALL' && (
                <span className="ml-1.5 opacity-75">
                  ({exams.filter((e) => e.status === s).length})
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Exam list */}
      {fetched && (
        <motion.div
          key={`workflow-${filteredExams.length}`}
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-4"
        >
          {filteredExams.length === 0 ? (
            <div className="text-center py-16 text-muted text-sm border border-base rounded-xl">
              No exams match this filter.
            </div>
          ) : (
            filteredExams.map((exam) => (
              <motion.div
                key={exam.id}
                variants={itemVariants}
                transition={itemTransition}
              >
                <ExamRow
                  exam={exam}
                  onAction={handleAction}
                  loading={actionLoading === exam.id}
                  canApprove={canApprove}
                  canRelease={canRelease}
                  onShowFeeBlocked={openFeeBlocked}
                />
              </motion.div>
            ))
          )}
        </motion.div>
      )}

      {!fetched && !fetchLoading && (
        <div className="text-center py-16 text-muted text-sm border border-dashed border-base rounded-xl">
          Click Load Exams to view the release pipeline for this class and term.
        </div>
      )}

      {/* RW-2: fee-blocked students modal */}
      <AnimatePresence>
        {feeBlocked !== null && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            role="dialog" aria-modal="true" aria-label="Fee-blocked students"
          >
            <div className="absolute inset-0" onClick={() => setFeeBlocked(null)} />
            <div className="relative z-10 w-full max-w-md bg-surface rounded-2xl shadow-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-base">
                <h3 className="font-heading font-bold text-brand-navy flex items-center gap-2">
                  <Users className="w-4 h-4" /> Fee-blocked students
                </h3>
                <button type="button" onClick={() => setFeeBlocked(null)} aria-label="Close" className="p-2 hover:bg-page rounded-xl">
                  <X className="w-4 h-4 text-muted" />
                </button>
              </div>
              <div className="max-h-[60vh] overflow-y-auto p-2">
                {feeLoading ? (
                  <div className="py-10 text-center text-sm text-muted">Loading…</div>
                ) : feeBlocked.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted">No fee-blocked students for this class and term.</div>
                ) : (
                  <ul className="divide-y divide-base">
                    {feeBlocked.map((st) => (
                      <li key={st.studentId} className="flex items-center justify-between gap-3 px-3 py-3">
                        <div>
                          <p className="text-sm font-medium text-body">{st.name}</p>
                          <p className="text-xs text-muted font-mono">{st.registrationNo}</p>
                        </div>
                        <span className="text-sm font-semibold text-brand-coral tabular">MWK {st.balance.toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}