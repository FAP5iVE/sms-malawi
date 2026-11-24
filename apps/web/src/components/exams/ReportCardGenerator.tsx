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
 *   • Individual PDF view action — opens the report card in the browser's
 *     own PDF viewer (new tab); download/print from the viewer's controls
 *   • Retry failed students individually
 *   • Progress bar showing batch completion
 *
 * The student-facing view is in the student's results page
 * (StudentResultsView.tsx), which uses the same shared openPdfPreview().
 *
 * [PDF PREVIEW] The per-row Download button (an <a download> click that
 * forced a file download) was removed. Viewing a report card now goes
 * through lib/pdfPreview.ts; the browser's PDF viewer already provides
 * Download and Print, so users review first and save only if they choose to.
 */

import { useState, useCallback }       from 'react'
import { useQuery, useQueryClient }   from '@tanstack/react-query'
import { motion }                     from 'framer-motion'
import { toast }                        from 'sonner'
import {
  FileText,
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
import { openPdfPreview, downloadProtectedFile } from '@/lib/pdfPreview'
import type { BatchGenerationResult, ReportCommentSheet, ReportCommentKind } from '@/server/services/reportCardService'
import { useClasses }                   from '@/hooks/useClasses'
import { useEffectiveViewingPeriod }     from '@/hooks/useViewingPeriod'

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
          <span className="text-tone-coral">{failed} failed</span>
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
  canTranscript,
}: {
  row:           StudentRow
  onRetry:       (studentId: string) => void
  canTranscript: boolean
}) {
  // Transcript: builds the all-terms transcript for this student on the server
  // (POST /exams/transcript, admin and exam officer only) and saves the PDF.
  const [transcriptBusy, setTranscriptBusy] = useState(false)
  const downloadTranscript = useCallback(async () => {
    setTranscriptBusy(true)
    try {
      const { url } = await apiFetch<{ url: string }>('/exams/transcript', {
        method: 'POST',
        body:   JSON.stringify({ studentId: row.studentId }),
      })
      await downloadProtectedFile(url, `Transcript - ${row.fullName}.pdf`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not build this transcript.')
    } finally {
      setTranscriptBusy(false)
    }
  }, [row.studentId, row.fullName])

  // [PDF PREVIEW] /api/files/[fileId] requires a live auth token, and a plain
  // browser navigation can never attach an Authorization header (an earlier
  // <a href> version returned {"error":"Unauthorised"} on every click).
  // openPdfPreview() fetches a fresh ID token at click time, appends it as
  // ?token= (accepted by getIdTokenFromRequest, see verifyAuth.ts) and opens
  // the file in a new tab. The server still runs the same token + canReadFile
  // checks and answers Content-Disposition: inline, so the browser's PDF
  // viewer shows it. The tab is opened synchronously inside the click.
  const openPreview = useCallback(() => {
    if (!row.url) return
    openPdfPreview(row.url).catch((err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Could not open this report card.')
    })
  }, [row.url])

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-surface border-b border-base last:border-0">
      {/* Status icon */}
      <div className="shrink-0 w-6 flex items-center justify-center">
        {row.rowStatus === 'queued'     && <span className="w-2 h-2 rounded-full bg-base border border-muted" />}
        {row.rowStatus === 'generating' && <Loader2 className="w-4 h-4 text-tone-teal animate-spin" />}
        {row.rowStatus === 'done'       && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        {row.rowStatus === 'failed'     && <XCircle className="w-4 h-4 text-tone-coral" />}
      </div>

      {/* Student info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-heading font-medium text-body truncate">{row.fullName}</p>
        <p className="text-xs text-muted">{row.registrationNo}</p>
        {row.error && (
          <p className="text-xs text-tone-coral mt-0.5 truncate">{row.error}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {canTranscript && row.rowStatus !== 'generating' && (
          <button
            type="button"
            onClick={downloadTranscript}
            disabled={transcriptBusy}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-base px-3 text-sm font-medium text-body transition-colors hover:bg-page disabled:opacity-60"
            aria-label={`Download transcript for ${row.fullName}`}
          >
            {transcriptBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileText className="h-4 w-4" aria-hidden />}
            {transcriptBusy ? 'Building…' : 'Transcript'}
          </button>
        )}
        {row.rowStatus === 'done' && row.url && (
          <button
            type="button"
            onClick={openPreview}
            className="p-1.5 rounded-lg text-tone-teal hover:bg-brand-teal/10 transition-colors"
            aria-label={`View report card for ${row.fullName}`}
            title="View report card (opens in a new tab)"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        )}
        {row.rowStatus === 'failed' && (
          <button
            type="button"
            onClick={() => onRetry(row.studentId)}
            className="p-1.5 rounded-lg text-tone-amber hover:bg-brand-amber/10 transition-colors"
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
// COMMENT SHEET: class teacher + head teacher comments for the chosen class and term.
// The class teacher (the class's assigned teacher) writes the first comment, the head
// teacher (high rank / admin) the second. Everyone else sees them read-only.
// ─────────────────────────────────────────────────────────────────────────────

function CommentSheet({ classId, term, academicYear }: { classId: string; term: 1 | 2 | 3; academicYear: string }) {
  const qc = useQueryClient()
  const queryKey = ['exams', 'report-comments', classId, term, academicYear] as const
  const { data: sheet, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => apiFetch<ReportCommentSheet>(
      `/exams/report-comments/${classId}/${term}?academicYear=${encodeURIComponent(academicYear)}`,
    ),
    enabled: !!classId && !!academicYear,
  })
  // Unsaved edits, keyed `${studentId}:${kind}`; a key is absent once saved or untouched.
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)

  async function save(studentId: string, kind: ReportCommentKind, text: string) {
    const key = `${studentId}:${kind}`
    setSavingKey(key)
    try {
      await apiFetch(`/exams/report-comments/${studentId}`, {
        method: 'PUT',
        body:   JSON.stringify({ academicYear, term, kind, comment: text }),
      })
      toast.success('Comment saved')
      setDrafts((d) => { const next = { ...d }; delete next[key]; return next })
      await qc.invalidateQueries({ queryKey })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not save this comment.')
    } finally {
      setSavingKey(null)
    }
  }

  if (isLoading) return <div className="skeleton h-40 rounded-xl" aria-hidden />
  if (isError || !sheet) {
    return <p className="text-sm text-tone-coral">Could not load the comments for this class.</p>
  }

  const canWriteAny = sheet.canClassTeacher || sheet.canHeadTeacher

  function field(row: ReportCommentSheet['rows'][number], kind: ReportCommentKind, label: string, allowed: boolean) {
    const key = `${row.studentId}:${kind}`
    const saved = kind === 'CLASS_TEACHER' ? row.classTeacherComment : row.headTeacherComment
    const value = drafts[key] ?? saved
    const dirty = drafts[key] !== undefined && drafts[key] !== saved
    return (
      <div>
        <label htmlFor={`rc-${key}`} className="block text-xs font-heading font-semibold text-muted mb-1">{label}</label>
        <textarea
          id={`rc-${key}`}
          value={value}
          onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
          rows={2}
          maxLength={600}
          disabled={!allowed || !row.hasResults}
          placeholder={allowed ? 'Write a comment for the report card' : '-'}
          className="w-full border border-base rounded-xl px-3 py-2 text-sm bg-page text-body resize-none disabled:opacity-70"
        />
        {allowed && row.hasResults && dirty && (
          <button
            type="button"
            onClick={() => save(row.studentId, kind, value)}
            disabled={savingKey === key}
            className="mt-1.5 min-h-[36px] px-3 rounded-lg text-xs font-heading font-semibold bg-brand-deep text-white disabled:opacity-60"
          >
            {savingKey === key ? 'Saving…' : 'Save comment'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-heading font-semibold text-base text-brand-navy">Report card comments</h3>
        <p className="text-xs text-muted mt-0.5">
          {canWriteAny
            ? `${sheet.canClassTeacher ? "You are this class's teacher: write the class teacher's comment. " : ''}${sheet.canHeadTeacher ? "You can write the head teacher's comment. " : ''}Comments appear on the report card when it is generated.`
            : "Only the class teacher and the head teacher can write these comments. You can read what has been entered."}
        </p>
      </div>
      {sheet.rows.length === 0 ? (
        <p className="text-sm text-muted">No active students in this class.</p>
      ) : (
        <div className="border border-base rounded-xl overflow-hidden">
          {sheet.rows.map((row) => (
            <div key={row.studentId} className="p-3 space-y-2 border-b border-base last:border-0">
              <p className="text-sm font-heading font-medium text-body">
                {row.fullName} <span className="text-xs text-muted font-normal">{row.registrationNo}</span>
              </p>
              {!row.hasResults && (
                <p className="text-xs text-tone-amber">Results for this term are not computed yet, so a comment cannot be added.</p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {field(row, 'CLASS_TEACHER', "Class teacher's comment", sheet.canClassTeacher)}
                {field(row, 'HEAD_TEACHER', "Head teacher's comment", sheet.canHeadTeacher)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT CARD GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

export function ReportCardGenerator() {
  const { role }      = useAuthStore()
  const motionEnabled = useMotionEnabled()

  // Year AND term come from the GLOBAL viewing period. This generator used to
  // keep its own term select (defaulting to Term 1 no matter which term the
  // page was showing) and a free-text year box — so "Generate All" could quietly
  // build the wrong term's cards. The Exams page subtitle and the header
  // switcher now decide which period is generated; the panel states it below.
  const { academicYear: effectiveAcademicYear, term: viewingTerm } = useEffectiveViewingPeriod()
  const term = viewingTerm as 1 | 2 | 3

  // [MAINT 2026-10-23] Scoped to the viewed year, like the Exams page above it.
  // With no year, every year's class rows came back — each class listed once
  // per year, and a prior year's row could be picked for the wrong cards.
  const { data: classes = [] } = useClasses(effectiveAcademicYear)

  const [classId,      setClassId]      = useState('')
  const [rows,         setRows]         = useState<StudentRow[]>([])
  const [generating,   setGenerating]   = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [done,         setDone]         = useState(false)


  const doneCount   = rows.filter((r) => r.rowStatus === 'done').length
  const failedCount = rows.filter((r) => r.rowStatus === 'failed').length

  const canGenerate = role === 'exam_officer' || role === 'admin'

  // ── Generate all ──────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!classId) { setError('Please select a class.'); return }
    if (!effectiveAcademicYear) { setError('Academic year is still loading. Please try again shortly.'); return }
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
          Report card generator
        </h2>
        <p className="text-sm text-muted mt-0.5">
          Batch-generate PDF report cards and upload to Appwrite storage.
        </p>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
        <div>
          <label className="block text-xs font-heading font-semibold text-muted mb-1.5">
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
          <p className="block text-xs font-heading font-semibold text-muted mb-1.5">
            Period
          </p>
          <p className="min-h-[44px] flex items-center text-sm text-body">
            Term {term} · {effectiveAcademicYear}
          </p>
        </div>

        {canGenerate && (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || !classId}
            className="min-h-[44px] px-5 rounded-xl text-sm font-heading font-semibold bg-brand-deep text-white hover:brightness-110 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {generating
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
              : <><FileText className="w-4 h-4" /> Generate All</>}
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-brand-coral/8 border border-brand-coral/25 rounded-xl px-4 py-3 text-sm text-tone-coral">
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
        <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm text-tone-teal app-tint">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {doneCount} report card{doneCount !== 1 ? 's' : ''} generated successfully.
          {failedCount > 0 && ` ${failedCount} failed. Use the retry button to regenerate.`}
        </div>
      )}

      {/* Student rows — [PRODUCTION FIX] was its own bordered card,
         redundant nested inside ModuleSurface's panel. */}
      {rows.length > 0 && (
        <motion.div
          key={`rows-${rows.length}`}
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="overflow-hidden"
        >
          {rows.map((row) => (
            <motion.div
              key={row.studentId}
              variants={itemVariants}
              transition={itemTransition}
            >
              <StudentResultRow row={row} onRetry={handleRetry} canTranscript={canGenerate} />
            </motion.div>
          ))}
        </motion.div>
      )}

      {rows.length === 0 && !generating && (
        <div className="text-center py-16 text-muted text-sm border border-dashed border-base rounded-xl">
          Select a class, then click Generate All to create report cards for the period shown above.
        </div>
      )}

      {/* Class teacher / head teacher comments for the selected class */}
      {classId && effectiveAcademicYear && (
        <CommentSheet classId={classId} term={term} academicYear={effectiveAcademicYear} />
      )}
    </div>
  )
}