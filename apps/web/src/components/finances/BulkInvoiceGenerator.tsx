'use client'

/**
 * apps/web/src/components/finances/BulkInvoiceGenerator.tsx
 *
 * [CHANGE TYPE]: MAJOR REWRITE
 * [PURPOSE]: This is the "Bulk Invoice Generator" tab from the requested
 *   redesign, now promoted to its own top-level tab (see finances/page.tsx)
 *   instead of a modal opened from inside the Invoice Entry screen via
 *   ?action=bulk. Section/table structure (cohort selection, accounting
 *   rule checkboxes, financial impact projection, pre-execution dry-run
 *   roster with per-student checkboxes) is adopted from the reference;
 *   visuals stay this app's own (this file's existing motion/ConfirmDialog/
 *   AcademicYearSelect conventions are kept, not replaced).
 *
 *   Rewired end to end against the fixed backend
 *   (bulkInvoiceService.bulkGenerateInvoices() — see its header comment for
 *   the confirmed no-line-items bug this replaced):
 *     - Now goes through useBulkGenerateInvoices() (the Phase 4 hook)
 *       instead of calling apiFetch directly, and uses
 *       ApiBulkInvoiceResult/ApiBulkInvoiceStudentResult from
 *       @shared/types/api instead of importing type-only from
 *       @/server/services/bulkInvoiceService — a client component
 *       shouldn't reach into server/ at all, even for types only.
 *     - Adds the real two-step dry-run -> commit flow the reference
 *       requires: "Preview Roster" runs dryRun: true and shows exactly
 *       which students would be billed, for how much, with their
 *       scholarship/credit figures -- all real numbers from
 *       feeService.computeInvoiceCharges(), not estimates. The bursar can
 *       uncheck specific students before "Generate N Invoices" actually
 *       commits (dryRun: false, studentIds: the checked rows).
 *     - Adds the four real accounting-rule checkboxes
 *       (includeMandatory / includeEnrolledOptional / applyScholarships /
 *       consumeAdvanceCredit) that BulkGenerateInvoicesSchema already
 *       validates -- previously not exposed in the UI at all.
 *     - The hardcoded FALLBACK_YEAR '2025/2026' is gone; the year/term
 *       pickers now seed from useCurrentAcademicPeriod() and stay
 *       user-overridable (unlike most tabs, deliberately: bulk generation
 *       is often run for a specific past/future term on purpose, not only
 *       "now").
 * [DEPENDS ON]: @/hooks/useFinances (useBulkGenerateInvoices), @/hooks/
 *   useSettings (useCurrentAcademicPeriod), @shared/types/api
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  FileText,
  CheckCircle2,
  AlertTriangle,
  SkipForward,
  XCircle,
  Loader2,
  Banknote,
  Eye,
  PiggyBank,
  Wallet2,
  Users,
} from 'lucide-react'
import { useMotionEnabled } from '@/store/motionStore'
import {
  LIST_CONTAINER_VARIANTS,
  LIST_ITEM_VARIANTS,
  reducedMotionVariants,
  reducedMotionTransition,
  DURATION,
  EASE,
} from '@/lib/motion'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { AcademicYearSelect } from '@/components/shared/AcademicYearSelect'
import { useClasses } from '@/hooks/useClasses'
import { useCurrentAcademicPeriod } from '@/hooks/useSettings'
import { useBulkGenerateInvoices } from '@/hooks/useFinances'
import { formatMWK } from '@shared/constants/malawi'
import type { ApiBulkInvoiceResult, ApiBulkInvoiceStudentResult } from '@shared/types/api'
import type { BulkGenerateInvoicesInput } from '@shared/schemas/finance'

type Outcome = ApiBulkInvoiceStudentResult['outcome']

// ─────────────────────────────────────────────────────────────────────────
// OUTCOME CONFIG (unchanged from the previous version of this file)
// ─────────────────────────────────────────────────────────────────────────

const OUTCOME_CONFIG: Record<Outcome, { icon: React.ElementType; chip: string; label: string }> = {
  CREATED: {
    icon: CheckCircle2,
    chip: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/25 dark:text-emerald-400 dark:border-emerald-800/50',
    label: 'Created',
  },
  EXISTING: {
    icon: SkipForward,
    chip: 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/25 dark:text-blue-400 dark:border-blue-800/50',
    label: 'Existing',
  },
  SKIPPED: { icon: SkipForward, chip: 'bg-page text-muted border-base', label: 'Skipped' },
  ERROR: {
    icon: XCircle,
    chip: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/25 dark:text-rose-400 dark:border-rose-800/50',
    label: 'Error',
  },
}

function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  const { icon: Icon, chip, label } = OUTCOME_CONFIG[outcome]
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${chip}`}
    >
      <Icon className="w-3 h-3" aria-hidden /> {label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// SUMMARY CARDS (post-commit result — unchanged shape, retyped)
// ─────────────────────────────────────────────────────────────────────────

function SummaryCards({ result }: { result: ApiBulkInvoiceResult }) {
  const cards = [
    {
      label: 'Invoices Created',
      value: result.created,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50 dark:bg-emerald-950/20',
    },
    {
      label: 'Already Existed',
      value: result.existing,
      color: 'text-blue-600',
      bg: 'bg-blue-50 dark:bg-blue-950/20',
    },
    { label: 'Skipped', value: result.skipped, color: 'text-muted', bg: 'bg-page' },
    {
      label: 'Errors',
      value: result.errors,
      color: 'text-rose-600',
      bg: 'bg-rose-50 dark:bg-rose-950/20',
    },
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
          <p className="text-xs text-muted">Total revenue from newly created invoices</p>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// COMPACT RESULT ROW (post-commit list — unchanged shape, retyped)
// ─────────────────────────────────────────────────────────────────────────

function ResultRow({ row }: { row: ApiBulkInvoiceStudentResult }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-base last:border-0 bg-surface">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-body truncate">{row.fullName}</p>
        <p className="text-xs text-muted">
          {row.registrationNo} &middot; {row.className}
        </p>
        {row.error && <p className="text-xs text-rose-600 mt-0.5">{row.error}</p>}
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

// ─────────────────────────────────────────────────────────────────────────
// PRE-EXECUTION DRY-RUN ROSTER ROW
// ─────────────────────────────────────────────────────────────────────────

function RosterRow({
  row,
  checked,
  onToggle,
}: {
  row: ApiBulkInvoiceStudentResult
  checked: boolean
  onToggle: () => void
}) {
  const selectable = row.outcome === 'CREATED'
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 border-b border-base last:border-0 ${selectable ? 'bg-surface' : 'bg-page/60'}`}
    >
      <input
        type="checkbox"
        checked={selectable && checked}
        disabled={!selectable}
        onChange={onToggle}
        className="w-4 h-4 rounded border-base shrink-0 disabled:opacity-30"
        aria-label={`Include ${row.fullName}`}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-body truncate">{row.fullName}</p>
        <p className="text-xs text-muted">
          {row.registrationNo} &middot; {row.className}
        </p>
        {row.error && <p className="text-xs text-rose-600 mt-0.5">{row.error}</p>}
      </div>
      <div className="text-right shrink-0 space-y-1">
        <OutcomeBadge outcome={row.outcome} />
        {row.totalAmount !== undefined && (
          <p className="text-xs text-muted tabular">Net: {formatMWK(row.totalAmount)}</p>
        )}
        {!!row.priorArrears && (
          <p className="text-[11px] text-rose-600 tabular">
            Arrears: +{formatMWK(row.priorArrears)}
          </p>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// FINANCIAL IMPACT PROJECTION — every figure here is a real aggregate of
// the dry-run preview's per-student numbers (feeService.computeInvoiceCharges()
// under the hood), not a placeholder.
// ─────────────────────────────────────────────────────────────────────────

function ImpactProjection({
  preview,
  selected,
}: {
  preview: ApiBulkInvoiceResult | null
  selected: Set<string>
}) {
  const eligible = preview?.students.filter((s) => s.outcome === 'CREATED') ?? []
  const readyToGenerate = eligible.filter((s) => selected.has(s.studentId))
  const scholarshipTotal = eligible.reduce((sum, r) => sum + (r.scholarshipAbsorbed ?? 0), 0)
  const creditTotal = eligible.reduce((sum, r) => sum + (r.advanceCreditConsumed ?? 0), 0)
  const netReceivable = readyToGenerate.reduce((sum, r) => sum + (r.totalAmount ?? 0), 0)

  const stats = [
    { label: 'Target Cohort Count', value: preview ? `${preview.students.length} Students` : '—' },
    { label: 'Ready to Generate', value: preview ? `${readyToGenerate.length} Invoices` : '—' },
    { label: 'Scholarships Absorbed', value: preview ? `-${formatMWK(scholarshipTotal)}` : '—' },
    { label: 'Advance Credit Consumed', value: preview ? `-${formatMWK(creditTotal)}` : '—' },
  ]

  return (
    <div className="bg-brand-navy rounded-xl p-4 text-white space-y-2.5">
      <h3 className="font-heading text-xs font-semibold uppercase tracking-wide text-white/70 flex items-center gap-1.5">
        <PiggyBank className="w-3.5 h-3.5" /> Financial Impact Projection
      </h3>
      {stats.map((s) => (
        <div key={s.label} className="flex items-center justify-between text-sm">
          <span className="text-white/70">{s.label}</span>
          <span className="font-medium tabular">{s.value}</span>
        </div>
      ))}
      <div className="border-t border-white/15 pt-2.5 flex items-center justify-between">
        <span className="text-xs text-white/70">Net Projected Receivable</span>
        <span className="font-heading font-bold text-lg tabular">
          {preview ? formatMWK(netReceivable) : formatMWK(0)}
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// BULK INVOICE GENERATOR
// ─────────────────────────────────────────────────────────────────────────

export function BulkInvoiceGenerator() {
  const motionEnabled = useMotionEnabled()
  const { data: classes = [] } = useClasses()
  const { academicYear: currentYear, term: currentTerm } = useCurrentAcademicPeriod()

  const [classId, setClassId] = useState('ALL')
  const [academicYear, setAcademicYear] = useState(currentYear ?? '')
  const [term, setTerm] = useState(currentTerm ?? 1)

  const [includeMandatory, setIncludeMandatory] = useState(true)
  const [includeEnrolledOptional, setIncludeEnrolledOptional] = useState(true)
  const [applyScholarships, setApplyScholarships] = useState(true)
  const [consumeAdvanceCredit, setConsumeAdvanceCredit] = useState(true)

  const [preview, setPreview] = useState<ApiBulkInvoiceResult | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [finalResult, setFinalResult] = useState<ApiBulkInvoiceResult | null>(null)
  const [filterOutcome, setFilterOutcome] = useState<'ALL' | Outcome>('ALL')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const bulkGenerate = useBulkGenerateInvoices()

  function baseRequest(dryRun: boolean, studentIds?: string[]): BulkGenerateInvoicesInput {
    return {
      classId,
      academicYear,
      term,
      includeMandatory,
      includeEnrolledOptional,
      applyScholarships,
      consumeAdvanceCredit,
      dryRun,
      studentIds,
    }
  }

  async function runPreview() {
    setError(null)
    setFinalResult(null)
    try {
      const result = await bulkGenerate.mutateAsync(baseRequest(true))
      setPreview(result)
      setSelected(
        new Set(result.students.filter((s) => s.outcome === 'CREATED').map((s) => s.studentId))
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed.')
    }
  }

  async function commit() {
    if (!preview) return
    setError(null)
    try {
      const studentIds = preview.students
        .filter((s) => s.outcome === 'CREATED' && selected.has(s.studentId))
        .map((s) => s.studentId)
      const result = await bulkGenerate.mutateAsync(baseRequest(false, studentIds))
      setFinalResult(result)
      setPreview(null)
      setConfirmOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed.')
      setConfirmOpen(false)
    }
  }

  const eligibleRows = preview?.students.filter((s) => s.outcome === 'CREATED') ?? []
  const nonEligibleRows = preview?.students.filter((s) => s.outcome !== 'CREATED') ?? []

  function toggleRow(studentId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(studentId)) next.delete(studentId)
      else next.add(studentId)
      return next
    })
  }

  const filteredFinalStudents = (finalResult?.students ?? []).filter(
    (s) => filterOutcome === 'ALL' || s.outcome === filterOutcome
  )
  const containerVariants = reducedMotionVariants(motionEnabled, LIST_CONTAINER_VARIANTS)
  const itemVariants = reducedMotionVariants(motionEnabled, LIST_ITEM_VARIANTS)
  const itemTransition = reducedMotionTransition(motionEnabled, {
    duration: DURATION.fast,
    ease: EASE.out,
  })
  const selectedClassName =
    classId === 'ALL'
      ? 'ALL classes'
      : `class ${classes.find((c) => c.id === classId)?.name ?? classId}`

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading font-bold text-xl text-brand-navy flex items-center gap-2">
          <FileText className="w-5 h-5" aria-hidden /> Bulk Invoice Generator
        </h2>
        <p className="text-sm text-muted mt-0.5">
          Generate term invoices across a cohort, with a full preview before anything is committed.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 items-start">
        {/* 1. Cohort & target selection */}
        <div className="bg-surface border border-base rounded-xl p-4 space-y-3">
          <h3 className="font-heading text-xs font-semibold uppercase tracking-wide text-muted flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Cohort &amp; Target Selection
          </h3>
          <div>
            <label className="block text-xs text-muted mb-1">Academic Year</label>
            <AcademicYearSelect
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="w-full min-h-11 border border-base rounded-lg px-3 py-2 text-sm bg-page"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Billing Term</label>
            <select
              value={term}
              onChange={(e) => setTerm(Number(e.target.value))}
              className="w-full min-h-11 border border-base rounded-lg px-3 py-2 text-sm bg-page"
            >
              <option value={1}>Term 1</option>
              <option value={2}>Term 2</option>
              <option value={3}>Term 3</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Target Student Cohort</label>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="w-full min-h-11 border border-base rounded-lg px-3 py-2 text-sm bg-page"
            >
              <option value="ALL">Entire School (All Grades &amp; Forms)</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 2. Accounting rules & fee automation */}
        <div className="bg-surface border border-base rounded-xl p-4 space-y-2.5">
          <h3 className="font-heading text-xs font-semibold uppercase tracking-wide text-muted flex items-center gap-1.5">
            <Wallet2 className="w-3.5 h-3.5" /> Accounting Rules &amp; Fee Automation
          </h3>
          <RuleCheckbox
            label="Include Mandatory Core Levies"
            hint="Tuition, statutory levies, and other required fees per term schedule."
            checked={includeMandatory}
            onChange={setIncludeMandatory}
          />
          <RuleCheckbox
            label="Include Enrolled Optional Services"
            hint="Bill students only for the add-ons (transport, boarding, uniform, ...) they're actually enrolled in."
            checked={includeEnrolledOptional}
            onChange={setIncludeEnrolledOptional}
          />
          <RuleCheckbox
            label="Apply Scholarship &amp; Staff Discounts"
            hint="Deduct each student's active scholarship from their tuition line automatically."
            checked={applyScholarships}
            onChange={setApplyScholarships}
          />
          <RuleCheckbox
            label="Consume Prior Advance Credit"
            hint="Offset new bills against any overpayment carried over from a prior term."
            checked={consumeAdvanceCredit}
            onChange={setConsumeAdvanceCredit}
          />
        </div>

        {/* 3. Financial impact projection */}
        <ImpactProjection preview={preview} selected={selected} />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs text-muted flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          Double-Billing Safe — students already invoiced for this term are automatically skipped.
        </p>
        <button
          type="button"
          onClick={runPreview}
          disabled={bulkGenerate.isPending || !academicYear}
          className="inline-flex items-center gap-2 min-h-11 px-5 rounded-xl text-sm font-heading font-semibold bg-brand-navy text-white hover:bg-brand-navy-light disabled:opacity-60"
        >
          {bulkGenerate.isPending && !finalResult ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Eye className="w-4 h-4" />
          )}
          {bulkGenerate.isPending && !finalResult ? 'Running preview…' : 'Preview Roster'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/50 rounded-xl px-4 py-3 text-sm text-rose-700 dark:text-rose-400">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Pre-execution dry-run roster */}
      {preview && !finalResult && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-heading text-sm font-semibold text-body">
              Pre-Execution Dry Run Roster ({preview.students.length} students projected)
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelected(new Set(eligibleRows.map((s) => s.studentId)))}
                className="text-xs font-medium text-brand-teal hover:underline"
              >
                Select All Eligible
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-xs font-medium text-muted hover:underline"
              >
                Deselect All
              </button>
            </div>
          </div>
          <div className="border border-base rounded-xl overflow-hidden">
            {[...eligibleRows, ...nonEligibleRows].map((row) => (
              <RosterRow
                key={row.studentId}
                row={row}
                checked={selected.has(row.studentId)}
                onToggle={() => toggleRow(row.studentId)}
              />
            ))}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={selected.size === 0 || bulkGenerate.isPending}
              className="inline-flex items-center gap-2 min-h-11 px-5 rounded-xl text-sm font-heading font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              <FileText className="w-4 h-4" />
              Generate {selected.size} Invoice{selected.size === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}

      {/* Final committed result */}
      {finalResult && (
        <div className="space-y-5">
          <SummaryCards result={finalResult} />
          <div className="flex gap-2 flex-wrap">
            {(['ALL', 'CREATED', 'EXISTING', 'SKIPPED', 'ERROR'] as const).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setFilterOutcome(o)}
                className={`px-3 py-1.5 rounded-full text-xs font-heading font-semibold border min-h-9 ${
                  filterOutcome === o
                    ? 'bg-brand-navy text-white border-brand-navy'
                    : 'bg-surface border-base text-muted hover:border-brand-navy/30'
                }`}
              >
                {o === 'ALL' ? 'All' : o}
                {o !== 'ALL' && (
                  <span className="ml-1.5 opacity-75">
                    ({finalResult.students.filter((s) => s.outcome === o).length})
                  </span>
                )}
              </button>
            ))}
          </div>
          <motion.div
            key={`bulk-result-${filteredFinalStudents.length}`}
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="border border-base rounded-xl overflow-hidden"
          >
            {filteredFinalStudents.length === 0 ? (
              <div className="text-center py-12 text-muted text-sm">
                No students match this filter.
              </div>
            ) : (
              filteredFinalStudents.map((row) => (
                <motion.div key={row.studentId} variants={itemVariants} transition={itemTransition}>
                  <ResultRow row={row} />
                </motion.div>
              ))
            )}
          </motion.div>
        </div>
      )}

      {!preview && !finalResult && !bulkGenerate.isPending && (
        <div className="text-center py-16 text-muted text-sm border border-dashed border-base rounded-xl">
          Configure the options above and click Preview Roster to see exactly who would be billed
          before generating anything.
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Generate invoices?"
        description={`${selected.size} invoice(s) will be created for the selected students in ${selectedClassName}, Term ${term} ${academicYear}. This creates real financial records.`}
        confirmLabel={`Generate ${selected.size} Invoices`}
        onConfirm={() => void commit()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}

function RuleCheckbox({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 rounded border-base shrink-0"
      />
      <span className="text-sm text-body">
        <span className="font-medium">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </label>
  )
}
