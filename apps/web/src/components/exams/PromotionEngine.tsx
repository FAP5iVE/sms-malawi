'use client'

/**
 * apps/web/src/components/exams/PromotionEngine.tsx — Phase D1
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R8 — Academics IV: Report Cards, Transcripts, Promotion &
 *   Risk Assessment
 * [PURPOSE]: Wired into the Exams module (exams/page.tsx, this same
 *   phase, as a dedicated "Promotion" tab reachable from app navigation —
 *   nothing linked to this component before). Replaced the raw fetch() +
 *   `dynamic import('@/lib/firebase')` token-retrieval pattern with the
 *   R1-consolidated apiFetch, which already resolves the current user's ID
 *   token internally — removing both the manual token plumbing and the
 *   missing `?? ''` fallback on the NEXT_PUBLIC_API_URL template literal
 *   every other call site in the codebase already has (apiFetch owns that
 *   concern once, not per-caller). Replaced the hardcoded academicYear =
 *   '2025/2026' default with usePublicSchoolInfo()'s currentYear, the same
 *   live source R5 established for exactly this purpose.
 * [DEPENDS ON]: apps/web/src/hooks/usePublic.ts (usePublicSchoolInfo)
 *
 * Full-page UI for the student promotion engine.
 *
 * Flow:
 *   1. Select academic year → click "Run Preview"
 *   2. Preview results table renders (per-student outcome badges)
 *   3. Review summary stats (promoted / repeated / awaiting MANEB / skipped)
 *   4. Click "Commit Promotion" → confirmation dialog → API call → done
 *
 * Access: exam_officer, admin
 *
 * API calls:
 *   POST /promotion/:year/preview  → PromotionPreview
 *   POST /promotion/:year/commit   → { committed: number }
 *   GET  /promotion/:year          → existing PromotionRun
 */

import { useState, useCallback, useEffect } from 'react'
import { AnimatePresence, motion }     from 'framer-motion'
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  PlayCircle,
  Lock,
}                                      from 'lucide-react'
import { useAuthStore }                from '@/store/authStore'
import { useMotionEnabled }            from '@/store/motionStore'
import { apiFetch }                    from '@/lib/api-client'
import { usePublicSchoolInfo }         from '@/hooks/usePublic'
import {
  LIST_CONTAINER_VARIANTS,
  LIST_ITEM_VARIANTS,
  reducedMotionVariants,
  reducedMotionTransition,
  DURATION,
  EASE,
}                                      from '@/lib/motion'
import type { PromotionPreview, StudentPromotionResult, PromotionOutcome, PromotionEligibility } from '@/server/services/promotionService'

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const OUTCOME_CONFIG: Record<PromotionOutcome, {
  label: string
  icon:  React.ElementType
  chip:  string
}> = {
  PROMOTED:        { label: 'Promoted',         icon: CheckCircle2,  chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  REPEATED:        { label: 'Repeats',          icon: XCircle,       chip: 'bg-brand-coral/10 text-brand-coral border-brand-coral/20' },
  AWAITING_MANEB:  { label: 'Awaiting MANEB',  icon: Clock,         chip: 'bg-brand-amber/10 text-brand-amber border-brand-amber/20' },
  ALREADY_AWAITING:{ label: 'Already Waiting', icon: Clock,         chip: 'bg-base text-muted border-base' },
  SKIPPED_NO_RESULT:{ label: 'Skipped',        icon: AlertTriangle, chip: 'bg-base text-muted border-base' },
}

function OutcomeBadge({ outcome }: { outcome: PromotionOutcome }) {
  const { label, icon: Icon, chip } = OUTCOME_CONFIG[outcome]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${chip}`}>
      <Icon className="w-3 h-3" aria-hidden />
      {label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIRM DIALOG
// ─────────────────────────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  preview:     PromotionPreview
  onConfirm:   () => void
  onCancel:    () => void
  committing:  boolean
}

function ConfirmDialog({ preview, onConfirm, onCancel, committing }: ConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="promo-confirm-title"
    >
      <div className="w-full max-w-md bg-surface rounded-3xl shadow-2xl border border-base p-7 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-brand-amber/15 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-brand-amber" aria-hidden />
          </div>
          <div>
            <h2 id="promo-confirm-title" className="font-heading font-bold text-body text-base">
              Confirm Promotion
            </h2>
            <p className="text-xs text-muted mt-0.5">Academic year {preview.academicYear}</p>
          </div>
        </div>

        <p className="text-sm text-body leading-relaxed">
          This will permanently update student records. Specifically:
        </p>

        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { label: 'Promoted',      value: preview.promoted,      color: 'text-emerald-600' },
            { label: 'Repeating',     value: preview.repeated,      color: 'text-brand-coral' },
            { label: 'Await MANEB',   value: preview.awaitingManeb, color: 'text-brand-amber' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-page rounded-xl p-3 border border-base">
              <p className={`text-xl font-bold font-heading ${color}`}>{value}</p>
              <p className="text-[10px] text-muted mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted bg-brand-amber/8 border border-brand-amber/20 rounded-xl px-3 py-2">
          This action cannot be undone. Ensure all Term 3 results are released before committing.
        </p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={committing}
            className="flex-1 min-h-[44px] rounded-xl text-sm font-heading font-semibold border border-base text-muted hover:bg-page transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={committing}
            className="flex-1 min-h-[44px] rounded-xl text-sm font-heading font-semibold bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {committing && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
            {committing ? 'Committing…' : 'Yes, Commit'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PROMOTION ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export function PromotionEngine() {
  const { role }         = useAuthStore()
  const motionEnabled    = useMotionEnabled()
  const { data: schoolInfo } = usePublicSchoolInfo()

  const [academicYear, setAcademicYear] = useState('')
  const [preview,      setPreview]      = useState<PromotionPreview | null>(null)
  const [committed,    setCommitted]    = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [committing,   setCommitting]   = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [showConfirm,  setShowConfirm]  = useState(false)
  const [eligibility,  setEligibility]  = useState<PromotionEligibility | null>(null)
  const [filterOutcome, setFilterOutcome] = useState<PromotionOutcome | 'ALL'>('ALL')
  const [search,       setSearch]       = useState('')

  const effectiveAcademicYear = academicYear || schoolInfo?.currentYear || ''
  const canCommit = role === 'admin' || role === 'exam_officer'

  // PR-2: promotion is only runnable in Term 3 once all Term 3 end-of-term
  // results are released. Fetch eligibility so the controls can disable and
  // explain why (the server enforces the same rule regardless).
  useEffect(() => {
    if (!effectiveAcademicYear) return
    let cancelled = false
    const encoded = encodeURIComponent(effectiveAcademicYear)
    apiFetch<PromotionEligibility>(`/promotion/${encoded}/eligibility`)
      .then((e) => { if (!cancelled) setEligibility(e) })
      .catch(() => { if (!cancelled) setEligibility(null) })
    return () => { cancelled = true }
  }, [effectiveAcademicYear])

  const blockedReason = eligibility && !eligibility.eligible ? eligibility.reason : null

  // ── API calls ─────────────────────────────────────────────────────────────

  const handlePreview = useCallback(async () => {
    if (!effectiveAcademicYear) return
    setLoading(true)
    setError(null)
    setPreview(null)
    setCommitted(false)
    try {
      const encoded = encodeURIComponent(effectiveAcademicYear)
      const result = await apiFetch<PromotionPreview>(`/promotion/${encoded}/preview`, { method: 'POST' })
      setPreview(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [effectiveAcademicYear])

  const handleCommit = useCallback(async () => {
    if (!preview || !effectiveAcademicYear) return
    setCommitting(true)
    setError(null)
    try {
      const encoded = encodeURIComponent(effectiveAcademicYear)
      await apiFetch<{ committed: number }>(`/promotion/${encoded}/commit`, { method: 'POST' })
      setCommitted(true)
      setShowConfirm(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setCommitting(false)
    }
  }, [effectiveAcademicYear, preview])

  // ── Filtered students ─────────────────────────────────────────────────────

  const filteredStudents: StudentPromotionResult[] = (preview?.students ?? []).filter((s) => {
    const matchSearch = !search || s.fullName.toLowerCase().includes(search.toLowerCase()) || s.registrationNo.includes(search)
    const matchOutcome = filterOutcome === 'ALL' || s.outcome === filterOutcome
    return matchSearch && matchOutcome
  })

  const containerVariants = reducedMotionVariants(motionEnabled, LIST_CONTAINER_VARIANTS)
  const itemVariants = reducedMotionVariants(motionEnabled, LIST_ITEM_VARIANTS)
  const itemTransition = reducedMotionTransition(motionEnabled, { duration: DURATION.fast, ease: EASE.out })

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-brand-navy">Promotion Engine</h1>
        <p className="text-sm text-muted mt-0.5">
          End-of-year student promotion — Form 1→2→3→4 and Form 4 to MANEB awaiting status.
        </p>
      </div>

      {/* Controls */}
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">
            Academic Year
          </label>
          <input
            value={effectiveAcademicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            placeholder="e.g. 2025/2026"
            className="border border-base rounded-xl px-4 py-2.5 text-sm bg-page text-body w-40 focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
          />
        </div>

        <button
          type="button"
          onClick={handlePreview}
          disabled={loading || committed || Boolean(blockedReason)}
          title={blockedReason ?? undefined}
          className="flex items-center gap-2 min-h-[44px] px-6 rounded-xl text-sm font-heading font-semibold bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors disabled:opacity-60"
        >
          {loading
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
            : <><PlayCircle className="w-4 h-4" /> Run Preview</>}
        </button>

        {preview && canCommit && !committed && (eligibility?.eligible ?? true) && (
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            className="flex items-center gap-2 min-h-[44px] px-6 rounded-xl text-sm font-heading font-semibold bg-brand-teal text-white hover:bg-brand-teal/90 transition-colors"
          >
            <Lock className="w-4 h-4" />
            Commit Promotion
          </button>
        )}

        {committed && (
          <div className="flex items-center gap-2 text-emerald-600 font-heading font-semibold text-sm">
            <CheckCircle2 className="w-5 h-5" />
            Promotion committed for {effectiveAcademicYear}
          </div>
        )}
      </div>

      {/* PR-2 eligibility notice */}
      {blockedReason && (
        <div role="status" className="flex items-start gap-2 bg-brand-amber/8 border border-brand-amber/20 rounded-xl px-4 py-3 text-sm text-body">
          <Lock className="w-4 h-4 shrink-0 mt-0.5 text-brand-amber" aria-hidden />
          <span>Promotion is locked: {blockedReason}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-brand-coral/8 border border-brand-coral/25 rounded-xl px-4 py-3 text-sm text-brand-coral">
          {error}
        </div>
      )}

      {/* Summary cards */}
      {preview && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Promoted',      value: preview.promoted,       color: 'text-emerald-600', bg: 'bg-emerald-50', outcome: 'PROMOTED' as PromotionOutcome },
            { label: 'Repeating',     value: preview.repeated,       color: 'text-brand-coral',  bg: 'bg-brand-coral/10', outcome: 'REPEATED' as PromotionOutcome },
            { label: 'Await MANEB',   value: preview.awaitingManeb,  color: 'text-brand-amber',  bg: 'bg-brand-amber/10', outcome: 'AWAITING_MANEB' as PromotionOutcome },
            { label: 'Skipped',       value: preview.skipped,        color: 'text-muted',         bg: 'bg-page', outcome: 'SKIPPED_NO_RESULT' as PromotionOutcome },
          ].map(({ label, value, color, outcome }) => (
            <button
              key={label}
              type="button"
              onClick={() => setFilterOutcome(filterOutcome === outcome ? 'ALL' : outcome)}
              className={`text-left border rounded-xl p-4 transition-all ${
                filterOutcome === outcome
                  ? 'border-brand-navy ring-2 ring-brand-navy/20'
                  : 'border-base hover:border-brand-navy/30'
              }`}
            >
              <p className={`text-2xl font-bold font-heading ${color}`}>{value}</p>
              <p className="text-xs text-muted mt-1">{label}</p>
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      {preview && (
        <div className="flex items-center gap-3 flex-wrap">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or reg no…"
            className="border border-base rounded-xl px-4 py-2.5 text-sm bg-page text-body flex-1 min-w-48 focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
          />
          {filterOutcome !== 'ALL' && (
            <button
              type="button"
              onClick={() => setFilterOutcome('ALL')}
              className="text-xs text-brand-teal font-heading font-semibold hover:underline"
            >
              Clear filter
            </button>
          )}
          <p className="text-xs text-muted">{filteredStudents.length} student(s)</p>
        </div>
      )}

      {/* Student list */}
      {preview && filteredStudents.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="hidden md:block border border-base rounded-xl overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-page border-b border-base">
                  {['Reg No.', 'Name', 'Current Form', 'Average', 'Passes', 'Outcome', 'Next Class'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <motion.tbody
                key={`tbody-${filteredStudents.length}`}
                initial="hidden"
                animate="visible"
                variants={reducedMotionVariants(motionEnabled, {
                  hidden: {},
                  visible: { transition: { staggerChildren: filteredStudents.length <= 15 ? 0.025 : 0 } },
                })}
                className="divide-y divide-base"
              >
                {filteredStudents.map((s) => (
                  <motion.tr
                    key={s.studentId}
                    variants={reducedMotionVariants(motionEnabled, {
                      hidden:   { opacity: 0, y: 4 },
                      visible:  { opacity: 1, y: 0, transition: { duration: 0.15, ease: 'easeOut' } },
                    })}
                    className="hover:bg-page transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs">{s.registrationNo}</td>
                    <td className="px-4 py-3 font-medium">{s.fullName}</td>
                    <td className="px-4 py-3">Form {s.currentForm} ({s.currentClass})</td>
                    <td className="px-4 py-3 tabular">{s.annualAverage.toFixed(1)}%</td>
                    <td className="px-4 py-3 text-center">{s.subjectPasses}</td>
                    <td className="px-4 py-3"><OutcomeBadge outcome={s.outcome} /></td>
                    <td className="px-4 py-3 text-muted text-xs">{s.nextClassName ?? '—'}</td>
                  </motion.tr>
                ))}
              </motion.tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <motion.ul
            key={`mobile-list-${filteredStudents.length}`}
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-2 md:hidden"
          >
            {filteredStudents.map((s) => (
              <motion.li
                key={s.studentId}
                variants={itemVariants}
                transition={itemTransition}
                className="bg-surface border border-base rounded-xl px-4 py-3 space-y-1.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-heading font-semibold text-sm text-body">{s.fullName}</p>
                    <p className="text-xs text-muted">{s.registrationNo} · Form {s.currentForm}</p>
                  </div>
                  <OutcomeBadge outcome={s.outcome} />
                </div>
                <div className="flex gap-3 text-xs text-muted">
                  <span>Avg: <strong className="text-body">{s.annualAverage.toFixed(1)}%</strong></span>
                  <span>Passes: <strong className="text-body">{s.subjectPasses}</strong></span>
                  {s.nextClassName && <span>→ <strong className="text-body">{s.nextClassName}</strong></span>}
                </div>
                <p className="text-[11px] text-muted italic">{s.reason}</p>
              </motion.li>
            ))}
          </motion.ul>
        </>
      )}

      {preview && filteredStudents.length === 0 && (
        <div className="text-center py-16 text-muted text-sm border border-base rounded-xl">
          No students match the current filter.
        </div>
      )}

      {/* Confirmation dialog */}
      <AnimatePresence>
        {showConfirm && preview && (
          <ConfirmDialog
            preview={preview}
            onConfirm={handleCommit}
            onCancel={() => setShowConfirm(false)}
            committing={committing}
          />
        )}
      </AnimatePresence>
    </div>
  )
}