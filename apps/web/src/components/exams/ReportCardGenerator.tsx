'use client'

/**
 * apps/web/src/components/exams/ReportCardGenerator.tsx — Phase D3
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R8 — Academics IV: Report Cards, Transcripts, Promotion &
 *   Risk Assessment
 * [PURPOSE]: Wired into the Exams module (exams/page.tsx, this same
 *   phase) as the real UI entry point for reportCardService.
 *   batchGenerateReportCards() — the pipeline was already correct; only
 *   the missing importer was fixed here. Also fixed three defects found
 *   while wiring it in: (1) `import { apiClient }` — no such export has
 *   ever existed in api-client.ts (only apiFetch, the R1 canonical
 *   client) — a confirmed build-breaking error. (2) The hardcoded
 *   academicYear = '2025/2026' default is replaced with
 *   usePublicSchoolInfo()'s currentYear, the same live source R5
 *   established for exactly this purpose. (3) handleRetry() called GET
 *   /exams/report-cards/student/:studentId — the plural, unauthenticated
 *   route R7 deleted as a confirmed vulnerability; it never generated
 *   anything (that route only returned an already-generated file's URL).
 *   Retry now calls POST /exams/report-card (reportCardService.
 *   generateSingleReportCard(), this same phase), which actually
 *   regenerates the one student's card.
 * [DEPENDS ON]: apps/web/src/hooks/usePublic.ts (usePublicSchoolInfo),
 *   apps/web/src/hooks/useExams.ts (useGenerateReportCard)
 *
 * Exam officer / admin interface for batch report card generation.
 *
 * Features:
 *   • Class + term + academic year selector
 *   • "Generate All" button → calls GET /exams/report-cards/:classId/:term
 *   • Per-student status table: Queued → Generating → Done | Failed
 *   • Individual PDF download/view link (signed Appwrite URL)
 *   • Retry failed students individually
 *   • Progress bar showing batch completion
 *
 * The student-facing download is in the student's results page, which
 * calls GET /exams/report-card/:studentId (singular — the only
 * authenticated, access-controlled path) directly.
 */

import { useState, useCallback }       from 'react'
import { motion, AnimatePresence }     from 'framer-motion'
import { getAuth }                      from 'firebase/auth'
import {
  FileText,
  Download,
  ExternalLink,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  AlertTriangle,
}                                       from 'lucide-react'
import { useAuthStore }                 from '@/store/authStore'
import { useMotionEnabled }             from '@/store/motionStore'
import {
  reducedMotionVariants,
  reducedMotionTransition,
  LIST_CONTAINER_VARIANTS,
  LIST_ITEM_VARIANTS,
  DURATION,
  EASE,
}                                       from '@/lib/motion'
import { apiFetch }                     from '@/lib/api-client'
import type { BatchGenerationResult }   from '@/server/services/reportCardService'
import { useClasses }                   from '@/hooks/useClasses'
import { usePublicSchoolInfo }          from '@/hooks/usePublic'

// ─────────────────────────────────────────────────────────────────────────────
// PROGRESS BAR
// ─────────────────────────────────────────────────────────────────────────────

function ProgressBar({
  done,
  total,
  failed,
  motionEnabled,
}: {
  done:          number
  total:         number
  failed:        number
  motionEnabled: boolean
}) {
  const pct = total > 0 ? (done / total) * 100 : 0

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-muted">
        <span>{done} / {total} generated</span>
        {failed > 0 && (
          <span className="text-brand-coral">{failed} failed</span>
        )}
      </div>
      <div className="h-2 bg-page rounded-full overflow-hidden border border-base">
        <motion.div
          className="h-full bg-brand-teal rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={reducedMotionTransition(motionEnabled, {
            duration: DURATION.normal,
            ease: EASE.out,
          })}
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT ROW
// ─────────────────────────────────────────────────────────────────────────────

type RowStatus = 'queued' | 'generating' | 'done' | 'failed'

interface StudentRow extends BatchGenerationResult {
  rowStatus: RowStatus
}

function StudentResultRow({
  row,
  onRetry,
}: {
  row:     StudentRow
  onRetry: (studentId: string) => void
}) {
  // [PRODUCTION FIX] These used to be plain <a href={row.url}> links.
  // /api/files/[fileId] requires a live auth token, and a direct browser
  // navigation can never attach one — every click returned {"error":
  // "Unauthorised"}. Fetching a fresh ID token at click time and appending
  // it as the ?token= param (now accepted by getIdTokenFromRequest, see
  // verifyAuth.ts) makes these work without weakening the access check —
  // it's still the same decoded uid/role being verified, just read from
  // the query string instead of a header this navigation could never send.
  const openWithToken = useCallback(async (mode: 'view' | 'download') => {
    if (!row.url) return
    const user = getAuth().currentUser
    if (!user) return
    const token = await user.getIdToken()
    const separator = row.url.includes('?') ? '&' : '?'
    const authedUrl = `${row.url}${separator}token=${encodeURIComponent(token)}`
    if (mode === 'view') {
      window.open(authedUrl, '_blank', 'noopener,noreferrer')
    } else {
      const a = document.createElement('a')
      a.href = authedUrl
      a.download = `report-card-${row.registrationNo}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
    }
  }, [row.url, row.registrationNo])

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-surface border-b border-base last:border-0">
      {/* Status icon */}
      <div className="shrink-0 w-6 flex items-center justify-center">
        {row.rowStatus === 'queued'     && <span className="w-2 h-2 rounded-full bg-base border border-muted" />}
        {row.rowStatus === 'generating' && <Loader2 className="w-4 h-4 text-brand-teal animate-spin" />}
        {row.rowStatus === 'done'       && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        {row.rowStatus === 'failed'     && <XCircle className="w-4 h-4 text-brand-coral" />}
      </div>

      {/* Student info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-heading font-medium text-body truncate">{row.fullName}</p>
        <p className="text-xs text-muted">{row.registrationNo}</p>
        {row.error && (
          <p className="text-xs text-brand-coral mt-0.5 truncate">{row.error}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {row.rowStatus === 'done' && row.url && (
          <>
            <button
              type="button"
              onClick={() => void openWithToken('view')}
              className="p-1.5 rounded-lg text-brand-teal hover:bg-brand-teal/10 transition-colors"
              aria-label={`View report card for ${row.fullName}`}
            >
              <ExternalLink className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => void openWithToken('download')}
              className="p-1.5 rounded-lg text-brand-navy hover:bg-brand-navy/10 transition-colors"
              aria-label={`Download report card for ${row.fullName}`}
            >
              <Download className="w-4 h-4" />
            </button>
          </>
        )}
        {row.rowStatus === 'failed' && (
          <button
            type="button"
            onClick={() => onRetry(row.studentId)}
            className="p-1.5 rounded-lg text-brand-amber hover:bg-brand-amber/10 transition-colors"
            aria-label={`Retry generation for ${row.fullName}`}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT CARD GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

export function ReportCardGenerator() {
  const { role }      = useAuthStore()
  const motionEnabled = useMotionEnabled()

  const { data: classes = [] } = useClasses()
  const { data: schoolInfo }   = usePublicSchoolInfo()

  const [classId,      setClassId]      = useState('')
  const [term,         setTerm]         = useState<1 | 2 | 3>(1)
  const [academicYear, setAcademicYear] = useState('')
  const [rows,         setRows]         = useState<StudentRow[]>([])
  const [generating,   setGenerating]   = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [done,         setDone]         = useState(false)

  const effectiveAcademicYear = academicYear || schoolInfo?.currentYear || ''

  const doneCount   = rows.filter((r) => r.rowStatus === 'done').length
  const failedCount = rows.filter((r) => r.rowStatus === 'failed').length

  const canGenerate = role === 'exam_officer' || role === 'admin'

  // ── Generate all ──────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!classId) { setError('Please select a class.'); return }
    if (!effectiveAcademicYear) { setError('Academic year is still loading — please try again shortly.'); return }
    setGenerating(true)
    setError(null)
    setDone(false)

    // Pre-populate rows as queued so user sees the list immediately
    try {
      const students = await apiFetch<{ id: string; registrationNo: string; firstName: string; lastName: string }[]>(
        `/students?classId=${classId}&status=ACTIVE`,
      )
      setRows(students.map((s) => ({
        studentId:      s.id,
        registrationNo: s.registrationNo,
        fullName:       `${s.firstName} ${s.lastName}`,
        rowStatus:      'queued',
      })))
    } catch {
      // If pre-load fails, continue anyway — results will populate after generation
    }

    try {
      const encoded = encodeURIComponent(effectiveAcademicYear)
      const results = await apiFetch<BatchGenerationResult[]>(
        `/exams/report-cards/${classId}/${term}?academicYear=${encoded}`,
      )

      setRows(results.map((r) => ({
        ...r,
        rowStatus: r.error ? 'failed' : 'done',
      })))
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Batch generation failed')
    } finally {
      setGenerating(false)
    }
  }, [classId, term, effectiveAcademicYear])

  // ── Retry single student ─────────────────────────────────────────────────
  // Calls POST /exams/report-card (single-student generation), not the
  // deleted plural GET route — that route only ever returned an
  // already-generated file's URL, it never regenerated anything.
  const handleRetry = useCallback(async (studentId: string) => {
    setRows((prev) =>
      prev.map((r) => r.studentId === studentId ? { ...r, rowStatus: 'generating' } : r),
    )
    try {
      const result = await apiFetch<BatchGenerationResult>('/exams/report-card', {
        method: 'POST',
        body:   JSON.stringify({ studentId, academicYear: effectiveAcademicYear, term }),
      })
      setRows((prev) =>
        prev.map((r) =>
          r.studentId === studentId
            ? { ...r, ...result, rowStatus: result.error ? 'failed' : 'done' }
            : r,
        ),
      )
    } catch (e) {
      setRows((prev) =>
        prev.map((r) =>
          r.studentId === studentId
            ? { ...r, error: e instanceof Error ? e.message : 'Retry failed', rowStatus: 'failed' }
            : r,
        ),
      )
    }
  }, [effectiveAcademicYear, term])

  const containerVariants = reducedMotionVariants(motionEnabled, LIST_CONTAINER_VARIANTS)
  const itemVariants      = reducedMotionVariants(motionEnabled, LIST_ITEM_VARIANTS)
  const itemTransition    = reducedMotionTransition(motionEnabled, { duration: DURATION.fast, ease: EASE.out })

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h2 className="font-heading font-bold text-xl text-brand-navy flex items-center gap-2">
          <FileText className="w-5 h-5" aria-hidden />
          Report Card Generator
        </h2>
        <p className="text-sm text-muted mt-0.5">
          Batch-generate PDF report cards and upload to Appwrite storage.
        </p>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
        <div>
          <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">
            Class
          </label>
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="w-full min-h-[44px] border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
          >
            <option value="">Select class…</option>
            {(classes as { id: string; name: string }[]).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">
            Term
          </label>
          <select
            value={term}
            onChange={(e) => setTerm(parseInt(e.target.value) as 1 | 2 | 3)}
            className="w-full min-h-[44px] border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
          >
            <option value={1}>Term 1</option>
            <option value={2}>Term 2</option>
            <option value={3}>Term 3</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">
            Academic Year
          </label>
          <input
            value={effectiveAcademicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            placeholder="e.g. 2025/2026"
            className="w-full min-h-[44px] border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
          />
        </div>

        {canGenerate && (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || !classId}
            className="min-h-[44px] px-5 rounded-xl text-sm font-heading font-semibold bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {generating
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
              : <><FileText className="w-4 h-4" /> Generate All</>}
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-brand-coral/8 border border-brand-coral/25 rounded-xl px-4 py-3 text-sm text-brand-coral">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Progress */}
      {rows.length > 0 && (
        <ProgressBar
          done={doneCount}
          total={rows.length}
          failed={failedCount}
          motionEnabled={motionEnabled}
        />
      )}

      {/* Success summary */}
      {done && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-800/40 dark:text-emerald-400">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {doneCount} report card{doneCount !== 1 ? 's' : ''} generated successfully.
          {failedCount > 0 && ` ${failedCount} failed — use the retry button to regenerate.`}
        </div>
      )}

      {/* Student rows */}
      {rows.length > 0 && (
        <motion.div
          key={`rows-${rows.length}`}
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="border border-base rounded-xl overflow-hidden"
        >
          {rows.map((row) => (
            <motion.div
              key={row.studentId}
              variants={itemVariants}
              transition={itemTransition}
            >
              <StudentResultRow row={row} onRetry={handleRetry} />
            </motion.div>
          ))}
        </motion.div>
      )}

      {rows.length === 0 && !generating && (
        <div className="text-center py-16 text-muted text-sm border border-dashed border-base rounded-xl">
          Select a class and term, then click Generate All to create report cards.
        </div>
      )}
    </div>
  )
}