'use client'

/*
 * apps/web/src/components/settings/ExamGradingSettings.tsx — Phase D15 / D4
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R8 — Academics IV: Report Cards, Transcripts, Promotion &
 *   Risk Assessment
 * [PURPOSE]: Repointed `import { apiClient } from '@/lib/api-client'` — no
 *   such export has ever existed in that file (only apiFetch, the R1
 *   canonical client) — a confirmed build-breaking error, not merely a
 *   style inconsistency. Every call site in this file already used the
 *   correct method/body signature apiFetch expects, so the fix is the
 *   import and the function name only. The promotion-threshold fields
 *   already read/write the same key names (promotion_min_average/
 *   promotion_required_passes) that promotionService.ts (this same phase)
 *   now reads through settingsService.get() — GET/PATCH /settings/exam
 *   (this same phase) is what makes the two sides of this path agree; no
 *   further change needed here.
 *
 * Admin and High Rank interface for configuring the grading scale.
 * Reads from and writes to the `grading_scales` table via gradeService.
 * Calls invalidateGradeCache() on save to flush the server-side cache.
 *
 * Exam types managed:
 *   MSCE          — Form 4 MANEB national (grades 1–9)
 *   JCE           — Form 2 MANEB national (grades A–F)
 *   INTERNAL_F1F2 — Internal exams Forms 1 & 2
 *   INTERNAL_F3F4 — Internal exams Forms 3 & 4
 *
 * Also manages:
 *   - Promotion thresholds (min average %, min subject passes) — informational
 *     context surfaced to admins; the real promotion determinant is the
 *     subject-count/English/distinction-tier MANEB rule in promotionService.ts
 *   - Results release policy (auto vs manual)
 */
/*
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R15 — UI/UX Polish: Shared Components, Dashboards,
 *   Confirmation Dialogs & Data-Display Consistency
 * [PURPOSE]: handleReset()'s blocking, non-accessible window.confirm() is
 *   replaced by the shared ConfirmDialog (same phase) — focus-trapped,
 *   Escape-dismissable, Cancel-focused by default, reduced-motion
 *   compliant.
 * [DEPENDS ON]: W/components/shared/ConfirmDialog.tsx (same phase)
 */

import { useState, useEffect }   from 'react'
import { Loader2, Save, RotateCcw, AlertTriangle } from 'lucide-react'
import { apiFetch }              from '@/lib/api-client'
import ConfirmDialog             from '@/components/shared/ConfirmDialog'
import { EXAM_TYPE_LABELS, type ExamTypeKey } from '@shared/constants/exams'

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface GradeRow {
  id:           string
  examType:     string
  grade:        string
  minPercent:   number
  maxPercent:   number
  pass:         boolean
  label:        string | null
  displayOrder: number
}


// ─────────────────────────────────────────────────────────────────────────────
// GRADE SCALE TABLE (editable)
// ─────────────────────────────────────────────────────────────────────────────

function GradeScaleTable({
  rows,
  onUpdate,
}: {
  rows:     GradeRow[]
  onUpdate: (id: string, field: 'minPercent' | 'maxPercent' | 'pass' | 'label', value: number | boolean | string) => void
}) {
  if (rows.length === 0) return null

  return (
    <div className="border border-base rounded-xl overflow-hidden">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-page border-b border-base">
            {['Grade', 'Min %', 'Max %', 'Label', 'Pass?'].map((h) => (
              <th key={h} className="px-3 py-2.5 text-left text-xs font-heading font-semibold text-muted uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-base">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-page">
              <td className="px-3 py-2.5 font-bold font-heading text-brand-navy">{row.grade}</td>
              <td className="px-3 py-2">
                <input
                  type="number"
                  min={0} max={100}
                  value={row.minPercent}
                  onChange={(e) => onUpdate(row.id, 'minPercent', Number(e.target.value))}
                  className="w-16 min-h-9 border border-base rounded-lg px-2 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
                />
              </td>
              <td className="px-3 py-2">
                <input
                  type="number"
                  min={0} max={100}
                  value={row.maxPercent}
                  onChange={(e) => onUpdate(row.id, 'maxPercent', Number(e.target.value))}
                  className="w-16 min-h-9 border border-base rounded-lg px-2 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
                />
              </td>
              <td className="px-3 py-2">
                <input
                  value={row.label ?? ''}
                  onChange={(e) => onUpdate(row.id, 'label', e.target.value)}
                  className="w-28 min-h-9 border border-base rounded-lg px-2 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
                />
              </td>
              <td className="px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={row.pass}
                  onChange={(e) => onUpdate(row.id, 'pass', e.target.checked)}
                  className="w-4 h-4 accent-brand-teal"
                  aria-label={`Grade ${row.grade} passes`}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EXAM GRADING SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

export function ExamGradingSettings() {
  const [scales,       setScales]       = useState<GradeRow[]>([])
  const [activeType,   setActiveType]   = useState<ExamTypeKey>('MSCE')
  const [promotionMin, setPromotionMin] = useState(35)
  const [promotionPasses, setPromotionPasses] = useState(4)
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [resetting,    setResetting]    = useState(false)
  const [confirmResetOpen, setConfirmResetOpen] = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  // R19 — `loading` now starts `true` above (the effect below always fetches
  // immediately on mount), so no setState is needed before starting the
  // request — the `.then/.catch/.finally` chain that follows was already
  // correctly deferred and never flagged.
  useEffect(() => {
    Promise.all([
      apiFetch<GradeRow[]>('/settings/grading-scales'),
      apiFetch<{ promotion_min_average: number; promotion_required_passes: number }>(
        '/settings/exam',
      ).catch(() => ({ promotion_min_average: 35, promotion_required_passes: 4 })),
    ])
      .then(([scaleData, examSettings]) => {
        setScales(scaleData)
        setPromotionMin(examSettings.promotion_min_average)
        setPromotionPasses(examSettings.promotion_required_passes)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load settings'))
      .finally(() => setLoading(false))
  }, [])

  function updateRow(
    id:    string,
    field: 'minPercent' | 'maxPercent' | 'pass' | 'label',
    value: number | boolean | string,
  ) {
    setScales((prev) =>
      prev.map((r) => r.id === id ? { ...r, [field]: value } : r),
    )
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const dirtyRows = scales.filter((r) => r.examType === activeType)
      await Promise.all([
        ...dirtyRows.map((r) =>
          apiFetch(`/settings/grading-scales/${r.id}`, {
            method: 'PATCH',
            body:   JSON.stringify({
              minPercent: r.minPercent,
              maxPercent: r.maxPercent,
              pass:       r.pass,
              label:      r.label,
            }),
          }),
        ),
        apiFetch('/settings/exam', {
          method: 'PATCH',
          body:   JSON.stringify({
            promotion_min_average:      promotionMin,
            promotion_required_passes:  promotionPasses,
          }),
        }),
      ])
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  async function handleReset() {
    // R15: confirmation moved to the shared ConfirmDialog — the button now
    // opens it, and this runs only from the dialog's onConfirm.
    setConfirmResetOpen(false)
    setResetting(true)
    try {
      const fresh = await apiFetch<GradeRow[]>('/settings/grading-scales/reset', { method: 'POST' })
      setScales(fresh)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reset failed')
    } finally {
      setResetting(false)
    }
  }

  const visibleRows = scales.filter((r) => r.examType === activeType)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading font-bold text-lg text-brand-navy">Exam & Grading Configuration</h2>
        <p className="text-sm text-muted mt-0.5">Configure grade boundaries and promotion thresholds.</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-brand-coral/8 border border-brand-coral/25 rounded-xl px-4 py-3 text-sm text-brand-coral">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-muted text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading settings…
        </div>
      ) : (
        <>
          {/* Exam type tabs */}
          <div className="flex gap-2 flex-wrap">
            {(Object.entries(EXAM_TYPE_LABELS) as [ExamTypeKey, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveType(key)}
                className={`px-3 py-2 rounded-xl text-xs font-heading font-semibold border transition-colors min-h-9 ${
                  activeType === key
                    ? 'bg-brand-navy text-white border-brand-navy'
                    : 'bg-surface border-base text-muted hover:border-brand-navy/30 hover:text-body'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Grade scale table */}
          <GradeScaleTable rows={visibleRows} onUpdate={updateRow} />

          {/* Promotion thresholds */}
          <div className="pt-4 border-t border-base">
            <h3 className="font-heading font-semibold text-sm text-body mb-4">
              Promotion Thresholds
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-sm">
              <div>
                <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">
                  Minimum Average (%)
                </label>
                <input
                  type="number" min={0} max={100}
                  value={promotionMin}
                  onChange={(e) => setPromotionMin(Number(e.target.value))}
                  className="w-full min-h-11 border border-base rounded-xl px-3 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
                />
              </div>
              <div>
                <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">
                  Min Subject Passes
                </label>
                <input
                  type="number" min={0} max={20}
                  value={promotionPasses}
                  onChange={(e) => setPromotionPasses(Number(e.target.value))}
                  className="w-full min-h-11 border border-base rounded-xl px-3 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="min-h-11 px-5 rounded-xl text-sm font-heading font-semibold bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors disabled:opacity-60 flex items-center gap-2"
            >
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                : <><Save className="w-4 h-4" /> Save Settings</>}
            </button>
            {saved && <span className="text-sm text-emerald-600 font-medium">Saved ✓</span>}
            <button
              type="button"
              onClick={() => setConfirmResetOpen(true)}
              disabled={resetting}
              className="min-h-11 px-4 rounded-xl text-sm font-heading font-semibold border border-base text-muted hover:bg-page hover:text-body transition-colors disabled:opacity-60 flex items-center gap-2 ml-auto"
            >
              {resetting
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <RotateCcw className="w-4 h-4" />}
              Reset to MANEB Defaults
            </button>
          </div>
        </>
      )}

      {/* R15 — shared confirmation dialog replaces window.confirm() */}
      <ConfirmDialog
        open={confirmResetOpen}
        title="Reset grading scales?"
        description="All grading scales will be restored to the MANEB defaults. Any custom grade boundaries you have configured will be lost. This cannot be undone."
        confirmLabel="Reset to Defaults"
        destructive
        onConfirm={() => void handleReset()}
        onCancel={() => setConfirmResetOpen(false)}
      />
    </div>
  )
}