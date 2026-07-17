'use client'

/*
 * apps/web/src/components/finances/BulkInvoiceGenerator.tsx — Phase D5
 *
 * Finance staff / admin UI for bulk term invoice generation.
 *
 * Flow:
 *   1. Select class (or "All Classes"), academic year, term
 *   2. Preview estimated revenue (from active fee structures)
 *   3. Click "Generate Invoices" → POST /finances/invoices/bulk-generate
 *   4. Results table shows per-student outcome: CREATED | EXISTING | SKIPPED | ERROR
 *   5. Summary stats: total created, existing, skipped, errors, MWK revenue
 */
/*
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R15 — UI/UX Polish: Shared Components, Dashboards,
 *   Confirmation Dialogs & Data-Display Consistency
 * [PURPOSE]:
 *   (1) "Generate Invoices" — which creates real financial records for an
 *       entire class or the whole school in one request — executed on a
 *       single unconfirmed tap. It now routes through the shared
 *       ConfirmDialog stating the scope (class/all classes, year, term)
 *       before the POST fires.
 *   (2) Fixed `import { apiClient } from '@/lib/api-client'` — no such
 *       export has ever existed in that file (only apiFetch, the R1
 *       canonical client): a confirmed build-breaking error of the same
 *       class R8 fixed in ExamGradingSettings.tsx. The call site already
 *       used apiFetch's exact signature; the fix is the import and the
 *       function name only.
 * [DEPENDS ON]: W/components/shared/ConfirmDialog.tsx (same phase),
 *   W/lib/api-client.ts (apiFetch)
 */

import { useState, useCallback }     from 'react'
import { motion }                     from 'framer-motion'
import {
  FileText,
  CheckCircle2,
  AlertTriangle,
  SkipForward,
  XCircle,
  Loader2,
  Banknote,
}                                     from 'lucide-react'
import { useMotionEnabled }           from '@/store/motionStore'
import {
  LIST_CONTAINER_VARIANTS,
  LIST_ITEM_VARIANTS,
  reducedMotionVariants,
  reducedMotionTransition,
  DURATION,
  EASE,
}                                     from '@/lib/motion'
import { apiFetch }                   from '@/lib/api-client'
import ConfirmDialog                  from '@/components/shared/ConfirmDialog'
import { useClasses }                 from '@/hooks/useClasses'
import { formatMWK }                  from '@shared/constants/malawi'
import type { BulkInvoiceResult, StudentInvoiceResult, InvoiceOutcome } from '@/server/services/bulkInvoiceService'

// ─────────────────────────────────────────────────────────────────────────────
// OUTCOME CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const OUTCOME_CONFIG: Record<InvoiceOutcome, {
  icon:  React.ElementType
  chip:  string
  label: string
}> = {
  CREATED:  { icon: CheckCircle2,   chip: 'bg-emerald-50 text-emerald-700 border-emerald-200',  label: 'Created'  },
  EXISTING: { icon: SkipForward,    chip: 'bg-blue-50 text-blue-600 border-blue-200',            label: 'Existing' },
  SKIPPED:  { icon: SkipForward,    chip: 'bg-base text-muted border-base',                      label: 'Skipped'  },
  ERROR:    { icon: XCircle,        chip: 'bg-brand-coral/10 text-brand-coral border-brand-coral/20', label: 'Error' },
}

function OutcomeBadge({ outcome }: { outcome: InvoiceOutcome }) {
  const { icon: Icon, chip, label } = OUTCOME_CONFIG[outcome]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${chip}`}>
      <Icon className="w-3 h-3" aria-hidden />
      {label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY CARDS
// ─────────────────────────────────────────────────────────────────────────────

function SummaryCards({ result }: { result: BulkInvoiceResult }) {
  const cards = [
    { label: 'Invoices Created', value: result.created,  color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Already Existed',  value: result.existing, color: 'text-blue-600',    bg: 'bg-blue-50'    },
    { label: 'Skipped',          value: result.skipped,  color: 'text-muted',       bg: 'bg-page'       },
    { label: 'Errors',           value: result.errors,   color: 'text-brand-coral', bg: 'bg-brand-coral/10' },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {cards.map(({ label, value, color, bg }) => (
        <div key={label} className={`${bg} border border-base rounded-xl p-4`}>
          <p className={`text-2xl font-bold font-heading ${color}`}>{value}</p>
          <p className="text-xs text-muted mt-1">{label}</p>
        </div>
      ))}
      <div className="col-span-2 sm:col-span-4 bg-brand-teal/8 border border-brand-teal/25 rounded-xl p-4 flex items-center gap-3">
        <Banknote className="w-5 h-5 text-brand-teal shrink-0" aria-hidden />
        <div>
          <p className="font-heading font-bold text-brand-navy text-lg tabular">
            {formatMWK(result.totalRevenue)}
          </p>
          <p className="text-xs text-muted">Total expected revenue from newly created invoices</p>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT ROW
// ─────────────────────────────────────────────────────────────────────────────

function StudentRow({ row }: { row: StudentInvoiceResult }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-base last:border-0 bg-surface">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-body truncate">{row.fullName}</p>
        <p className="text-xs text-muted">{row.registrationNo} · {row.className}</p>
        {row.error && (
          <p className="text-xs text-brand-coral mt-0.5">{row.error}</p>
        )}
      </div>
      <div className="text-right shrink-0 space-y-1">
        <OutcomeBadge outcome={row.outcome} />
        {row.totalAmount !== undefined && (
          <p className="text-xs text-muted tabular">{formatMWK(row.totalAmount)}</p>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// BULK INVOICE GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

export function BulkInvoiceGenerator() {
  const motionEnabled = useMotionEnabled()
  const { data: classes = [] } = useClasses()

  const [classId,      setClassId]      = useState<string>('ALL')
  const [academicYear, setAcademicYear] = useState('2025/2026')
  const [term,         setTerm]         = useState(1)
  const [result,       setResult]       = useState<BulkInvoiceResult | null>(null)
  const [generating,   setGenerating]   = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [filterOutcome, setFilterOutcome] = useState<InvoiceOutcome | 'ALL'>('ALL')
  // R15 — generate-confirmation dialog visibility
  const [confirmGenerateOpen, setConfirmGenerateOpen] = useState(false)

  const handleGenerate = useCallback(async () => {
    setConfirmGenerateOpen(false)
    setGenerating(true)
    setError(null)
    setResult(null)
    try {
      const data = await apiFetch<BulkInvoiceResult>(
        '/finances/invoices/bulk-generate',
        {
          method: 'POST',
          body: JSON.stringify({ classId: classId === 'ALL' ? undefined : classId, academicYear, term }),
        },
      )
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }, [classId, academicYear, term])

  const filteredStudents = (result?.students ?? []).filter(
    (s) => filterOutcome === 'ALL' || s.outcome === filterOutcome,
  )

  const containerVariants = reducedMotionVariants(motionEnabled, LIST_CONTAINER_VARIANTS)
  const itemVariants      = reducedMotionVariants(motionEnabled, LIST_ITEM_VARIANTS)
  const itemTransition    = reducedMotionTransition(motionEnabled, { duration: DURATION.fast, ease: EASE.out })

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h2 className="font-heading font-bold text-xl text-brand-navy flex items-center gap-2">
          <FileText className="w-5 h-5" aria-hidden />
          Bulk Invoice Generator
        </h2>
        <p className="text-sm text-muted mt-0.5">
          Generate term invoices for all students based on active fee structures.
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
            <option value="ALL">All Classes</option>
            {(classes as { id: string; name: string }[]).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">
            Academic Year
          </label>
          <input
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            placeholder="2025/2026"
            className="w-full min-h-[44px] border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
          />
        </div>

        <div>
          <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">
            Term
          </label>
          <select
            value={term}
            onChange={(e) => setTerm(Number(e.target.value))}
            className="w-full min-h-[44px] border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
          >
            <option value={1}>Term 1</option>
            <option value={2}>Term 2</option>
            <option value={3}>Term 3</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => setConfirmGenerateOpen(true)}
          disabled={generating}
          className="min-h-[44px] px-5 rounded-xl text-sm font-heading font-semibold bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {generating
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
            : <><FileText className="w-4 h-4" /> Generate Invoices</>}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-brand-coral/8 border border-brand-coral/25 rounded-xl px-4 py-3 text-sm text-brand-coral">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-5">
          <SummaryCards result={result} />

          {/* Filter chips */}
          <div className="flex gap-2 flex-wrap">
            {(['ALL', 'CREATED', 'EXISTING', 'SKIPPED', 'ERROR'] as const).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setFilterOutcome(o)}
                className={`px-3 py-1.5 rounded-full text-xs font-heading font-semibold border transition-colors min-h-[36px] ${
                  filterOutcome === o
                    ? 'bg-brand-navy text-white border-brand-navy'
                    : 'bg-surface border-base text-muted hover:border-brand-navy/30'
                }`}
              >
                {o === 'ALL' ? 'All' : o}
                {o !== 'ALL' && (
                  <span className="ml-1.5 opacity-75">
                    ({result.students.filter((s) => s.outcome === o).length})
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Student list */}
          <motion.div
            key={`invoice-list-${filteredStudents.length}`}
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="border border-base rounded-xl overflow-hidden"
          >
            {filteredStudents.length === 0 ? (
              <div className="text-center py-12 text-muted text-sm">
                No students match this filter.
              </div>
            ) : (
              filteredStudents.map((row) => (
                <motion.div
                  key={row.studentId}
                  variants={itemVariants}
                  transition={itemTransition}
                >
                  <StudentRow row={row} />
                </motion.div>
              ))
            )}
          </motion.div>
        </div>
      )}

      {!result && !generating && (
        <div className="text-center py-16 text-muted text-sm border border-dashed border-base rounded-xl">
          Configure the options above and click Generate Invoices to begin.
        </div>
      )}

      {/* R15 — confirmation before creating real financial records.
          (Completes the interrupted prior-session edit: the import, state
          and button wiring were present in the checkpoint, but the dialog
          element itself was never rendered — the button opened nothing.) */}
      <ConfirmDialog
        open={confirmGenerateOpen}
        title="Generate invoices?"
        description={`Term ${term} ${academicYear} invoices will be created for every active student in ${
          classId === 'ALL'
            ? 'ALL classes'
            : `class ${classes.find((c) => c.id === classId)?.name ?? classId}`
        } from the active fee structures. Students already invoiced for this term are skipped, but newly created invoices are real financial records.`}
        confirmLabel="Generate Invoices"
        onConfirm={() => void handleGenerate()}
        onCancel={() => setConfirmGenerateOpen(false)}
      />
    </div>
  )
}