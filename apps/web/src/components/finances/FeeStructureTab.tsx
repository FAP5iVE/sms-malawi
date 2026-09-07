"use client"

/**
 * apps/web/src/components/finances/FeeStructureTab.tsx
 *
 * [CHANGE TYPE]: MAJOR REWRITE
 * [PURPOSE]: This is the "Settings & Fee Catalog" screen from the
 *   requested redesign. Table/tab structure (category, mandatory/optional
 *   + schedule status, Active/Archived filtering, archive-not-delete) is
 *   adopted from the reference; visual styling uses this app's own design
 *   system (DataTable, StudentRiskBadge's literal-palette badge
 *   convention, ConfirmDialog) rather than the reference's look.
 *   Previously a bare name/amount/scope table with a single inline
 *   "Add Fee Item" form and no way to edit or archive an entry once
 *   created — this now surfaces every field FeeStructure actually has
 *   (code/category/mandatory/schedule/description, added to the schema
 *   2026-09-05) and adds real edit + archive/restore actions via the new
 *   PATCH /finances/fee-structures/:id route.
 * [DEPENDS ON]: useFinances.ts (useFeeStructures/useCreateFeeStructure/
 *   useUpdateFeeStructure), @shared/constants/malawi (category/schedule/
 *   payment-method labels), @/components/shared/{DataTable,ConfirmDialog}
 */

import { useMemo, useState } from 'react'
import { useFeeStructures, useCreateFeeStructure, useUpdateFeeStructure } from '@/hooks/useFinances'
import { useClasses } from '@/hooks/useClasses'
import { DataTable } from '@/components/shared/DataTable'
import type { DataColumn } from '@/components/shared/DataTable'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import {
  formatMWK,
  FEE_CATEGORY_OPTIONS,
  FEE_CATEGORY_LABELS,
  FEE_SCHEDULE_OPTIONS,
  formatFeeScheduleBadge,
  PAYMENT_METHOD_OPTIONS,
} from '@shared/constants/malawi'
import type { ApiFeeStructure } from '@shared/types/api'
import type { CreateFeeStructureInput } from '@shared/schemas/finance'
import { Plus, Loader2, Globe, Pencil, Archive, ArchiveRestore, X, Wallet } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────
// BADGE HELPERS — literal-palette + explicit dark: variants, following
// StudentRiskBadge.tsx's documented convention (a CSS-custom-property
// colour with an opacity modifier can silently fail to adapt in dark
// mode; this app's shared badges avoid that entirely).
// ─────────────────────────────────────────────────────────────────────────

const CATEGORY_TONE: Record<string, string> = {
  TUITION:   'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/25 dark:text-blue-400 dark:border-blue-800/50',
  TRANSPORT: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/25 dark:text-amber-400 dark:border-amber-800/50',
  UNIFORM:   'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/25 dark:text-purple-400 dark:border-purple-800/50',
  BOARDING:  'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/25 dark:text-cyan-400 dark:border-cyan-800/50',
  LEVY:      'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800/40 dark:text-slate-300 dark:border-slate-700',
  ACTIVITY:  'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/25 dark:text-emerald-400 dark:border-emerald-800/50',
  OTHER:     'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800/40 dark:text-gray-300 dark:border-gray-700',
}

function CategoryBadge({ category }: { category: string }) {
  const tone = CATEGORY_TONE[category] ?? CATEGORY_TONE.OTHER
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-heading font-semibold border ${tone}`}>
      {FEE_CATEGORY_LABELS[category as keyof typeof FEE_CATEGORY_LABELS] ?? category}
    </span>
  )
}

function ScheduleBadge({ mandatory, schedule }: { mandatory: boolean; schedule: string }) {
  const tone = mandatory
    ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/25 dark:text-amber-400 dark:border-amber-800/50'
    : 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/25 dark:text-blue-400 dark:border-blue-800/50'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-heading font-semibold border ${tone} whitespace-nowrap`}>
      {formatFeeScheduleBadge(mandatory, schedule as 'PER_TERM' | 'ANNUAL' | 'ONE_TIME')}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────

type CatalogFilter = 'active' | 'archived' | 'all'

export function FeeStructureTab({ academicYear }: { academicYear: string }) {
  // Fetch the full set (active + archived) once; the three filter tabs
  // below are then instant, client-side, no extra round trip per switch.
  const { data: fees = [], isLoading } = useFeeStructures(academicYear, undefined, undefined, true)
  const { data: classes = [] } = useClasses(academicYear)

  const [filter, setFilter] = useState<CatalogFilter>('active')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ApiFeeStructure | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<ApiFeeStructure | null>(null)

  const updateFee = useUpdateFeeStructure()

  const counts = useMemo(
    () => ({
      active: fees.filter((f) => f.isActive).length,
      archived: fees.filter((f) => !f.isActive).length,
      all: fees.length,
    }),
    [fees]
  )

  const visibleFees = useMemo(() => {
    if (filter === 'active') return fees.filter((f) => f.isActive)
    if (filter === 'archived') return fees.filter((f) => !f.isActive)
    return fees
  }, [fees, filter])

  function openEdit(fee: ApiFeeStructure) {
    setEditing(fee)
    setShowForm(true)
  }

  function openCreate() {
    setEditing(null)
    setShowForm(true)
  }

  function confirmArchiveToggle() {
    if (!archiveTarget) return
    updateFee.mutate(
      { id: archiveTarget.id, data: { isActive: !archiveTarget.isActive } },
      { onSuccess: () => setArchiveTarget(null) }
    )
  }

  const columns: DataColumn<ApiFeeStructure>[] = [
    {
      key: 'code',
      label: 'Code',
      priority: 'important',
      render: (row) => <span className="font-mono text-xs text-muted">{row.code}</span>,
    },
    {
      key: 'name',
      label: 'Fee Name & Description',
      priority: 'critical',
      render: (row) => (
        <div className="min-w-0">
          <p className="font-medium text-body truncate">{row.name}</p>
          {row.description && <p className="text-xs text-muted truncate">{row.description}</p>}
          {!row.classId && !row.term && (
            <span className="text-[11px] text-brand-teal inline-flex items-center gap-1 mt-0.5">
              <Globe className="w-3 h-3" /> Applies to all classes &amp; terms
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'category',
      label: 'Category',
      priority: 'important',
      render: (row) => <CategoryBadge category={row.category} />,
    },
    {
      key: 'schedule',
      label: 'Status & Schedule',
      priority: 'important',
      render: (row) => <ScheduleBadge mandatory={row.mandatory} schedule={row.schedule} />,
    },
    {
      key: 'amount',
      label: 'Standard Rate',
      priority: 'critical',
      sortable: true,
      render: (row) => <span className="tabular font-semibold whitespace-nowrap">{formatMWK(row.amount)}</span>,
    },
    {
      key: 'id',
      label: 'Actions',
      priority: 'optional',
      render: (row) => (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => openEdit(row)}
            className="p-1.5 rounded-lg hover:bg-page text-muted hover:text-body"
            aria-label={`Edit ${row.name}`}
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => (row.isActive ? setArchiveTarget(row) : updateFee.mutate({ id: row.id, data: { isActive: true } }))}
            className="p-1.5 rounded-lg hover:bg-page text-muted hover:text-body"
            aria-label={row.isActive ? `Archive ${row.name}` : `Restore ${row.name}`}
          >
            {row.isActive ? <Archive className="w-4 h-4" /> : <ArchiveRestore className="w-4 h-4" />}
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading font-semibold text-body">Fee Catalog &amp; Accounting Settings</h2>
          <p className="text-xs text-muted mt-0.5">
            Configure fee categories, standard rates, and how each fee bills — sourced across invoices and fee structures.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 bg-brand-teal text-white rounded-lg px-3.5 py-2 text-sm font-semibold hover:bg-brand-teal-light min-h-11"
        >
          <Plus className="w-4 h-4" /> Add Fee Category
        </button>
      </div>

      {/* Ledger Preservation Policy — real behaviour, not decoration: see
          PATCH /finances/fee-structures/:id. Archiving only sets isActive
          false; every invoice and line item that already reference this
          fee are completely untouched. */}
      <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/50 rounded-xl p-3 text-xs text-blue-800 dark:text-blue-300 flex items-start gap-2">
        <Wallet className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          <strong>Ledger Preservation Policy:</strong> archiving a fee removes it from new invoice line-item pickers only —
          every existing invoice, line item, and receipt that already reference it stay exactly as they are, and an
          archived fee can be restored at any time.
        </p>
      </div>

      {/* Active / Archived / All filter tabs */}
      <div className="flex items-center gap-2">
        {(['active', 'archived', 'all'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize ${
              filter === f ? 'bg-brand-navy text-white' : 'bg-page text-muted hover:text-body'
            }`}
          >
            {f} ({counts[f]})
          </button>
        ))}
      </div>

      <DataTable<ApiFeeStructure>
        data={visibleFees}
        isLoading={isLoading}
        rowKey="id"
        columns={columns}
        emptyMessage={
          filter === 'archived'
            ? 'No archived fee categories.'
            : `No fee categories defined for ${academicYear} yet.`
        }
        mobileActions={[
          { label: 'Edit', icon: Pencil, onClick: openEdit },
          {
            label: 'Archive / Restore',
            icon: Archive,
            onClick: (row) => (row.isActive ? setArchiveTarget(row) : updateFee.mutate({ id: row.id, data: { isActive: true } })),
          },
        ]}
      />

      {/* System Configured Payment Modes — these are the channels the
          system itself supports end to end (receipts, allocation, ledger
          posting); not a free-text list an admin edits here. */}
      <div className="bg-surface border border-base rounded-xl p-4">
        <h3 className="font-heading text-sm font-semibold text-body mb-1">System Configured Payment Modes</h3>
        <p className="text-xs text-muted mb-3">
          These payment options populate the mode-of-payment picker in Invoice Entry &amp; Allocation.
        </p>
        <div className="flex flex-wrap gap-2">
          {PAYMENT_METHOD_OPTIONS.map((m) => (
            <span
              key={m.value}
              className="inline-flex items-center gap-1.5 bg-page border border-base rounded-full px-3 py-1.5 text-xs font-medium text-body"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {m.label}
            </span>
          ))}
        </div>
      </div>

      {showForm && (
        <FeeFormModal
          academicYear={academicYear}
          classes={classes}
          editing={editing}
          onClose={() => setShowForm(false)}
        />
      )}

      <ConfirmDialog
        open={!!archiveTarget}
        title={`Archive "${archiveTarget?.name ?? ''}"?`}
        description="This hides it from new invoice line-item pickers. Every existing invoice and line item that already reference it are unaffected, and you can restore it at any time."
        confirmLabel="Archive"
        destructive
        onConfirm={confirmArchiveToggle}
        onCancel={() => setArchiveTarget(null)}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// ADD / EDIT MODAL
// ─────────────────────────────────────────────────────────────────────────

function FeeFormModal({
  academicYear,
  classes,
  editing,
  onClose,
}: {
  academicYear: string
  classes: { id: string; name: string }[]
  editing: ApiFeeStructure | null
  onClose: () => void
}) {
  const createFee = useCreateFeeStructure()
  const updateFee = useUpdateFeeStructure()
  const isEditing = !!editing
  const isPending = createFee.isPending || updateFee.isPending
  const error = createFee.error ?? updateFee.error

  const [name, setName] = useState(editing?.name ?? '')
  const [code, setCode] = useState(editing?.code ?? '')
  const [category, setCategory] = useState(editing?.category ?? 'OTHER')
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '')
  const [mandatory, setMandatory] = useState(editing?.mandatory ?? true)
  const [schedule, setSchedule] = useState(editing?.schedule ?? 'PER_TERM')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [classId, setClassId] = useState(editing?.classId ?? '')
  const [term, setTerm] = useState(editing?.term ? String(editing.term) : '')

  const canSubmit = name.trim() && code.trim() && amount && Number(amount) > 0

  function handleSubmit() {
    if (!canSubmit) return
    if (isEditing) {
      updateFee.mutate(
        {
          id: editing.id,
          data: {
            name: name.trim(),
            code: code.trim(),
            category: category as CreateFeeStructureInput['category'],
            amount: Number(amount),
            mandatory,
            schedule: schedule as CreateFeeStructureInput['schedule'],
            description: description.trim() || undefined,
            classId: classId || null,
            term: term ? Number(term) : null,
          },
        },
        { onSuccess: onClose }
      )
    } else {
      createFee.mutate(
        {
          name: name.trim(),
          code: code.trim(),
          category: category as CreateFeeStructureInput['category'],
          amount: Number(amount),
          mandatory,
          schedule: schedule as CreateFeeStructureInput['schedule'],
          description: description.trim() || undefined,
          academicYear,
          classId: classId || undefined,
          term: term ? Number(term) : undefined,
        },
        { onSuccess: onClose }
      )
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
      <div className="bg-surface rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-base">
          <h3 className="font-heading font-semibold text-body">{isEditing ? 'Edit Fee Category' : 'Add Fee Category'}</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-page text-muted" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="fee-name" className="text-xs text-muted mb-1 block">Fee name</label>
              <input
                id="fee-name" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g. School Fee (Tuition)"
                className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
              />
            </div>
            <div>
              <label htmlFor="fee-code" className="text-xs text-muted mb-1 block">Code</label>
              <input
                id="fee-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. TUI-01"
                className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11 font-mono"
              />
            </div>
            <div>
              <label htmlFor="fee-category" className="text-xs text-muted mb-1 block">Category</label>
              <select
                id="fee-category" value={category} onChange={(e) => setCategory(e.target.value as typeof category)}
                className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
              >
                {FEE_CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="fee-amount" className="text-xs text-muted mb-1 block">Standard rate (MWK)</label>
              <input
                id="fee-amount" type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)}
                className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
              />
            </div>
            <div>
              <label htmlFor="fee-schedule" className="text-xs text-muted mb-1 block">Billing schedule</label>
              <select
                id="fee-schedule" value={schedule} onChange={(e) => setSchedule(e.target.value as typeof schedule)}
                className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
              >
                {FEE_SCHEDULE_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-base"
            />
            <span className="text-sm text-body">
              <span className="font-medium">Mandatory</span>
              <span className="block text-xs text-muted">
                {mandatory
                  ? 'Applies automatically to every student in scope — no per-student opt-in needed.'
                  : 'Optional add-on — students are billed only after being enrolled via Finance Fee Structure.'}
              </span>
            </span>
          </label>

          <div>
            <label htmlFor="fee-description" className="text-xs text-muted mb-1 block">
              Description <span className="text-muted/70">(optional)</span>
            </label>
            <textarea
              id="fee-description" value={description} onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page resize-none"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="fee-class" className="text-xs text-muted mb-1 block">
                Class <span className="text-muted/70">(optional — blank = all classes)</span>
              </label>
              <select
                id="fee-class" value={classId} onChange={(e) => setClassId(e.target.value)}
                className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
              >
                <option value="">All classes</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="fee-term" className="text-xs text-muted mb-1 block">
                Term <span className="text-muted/70">(optional — blank = all terms)</span>
              </label>
              <select
                id="fee-term" value={term} onChange={(e) => setTerm(e.target.value)}
                className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
              >
                <option value="">All terms</option>
                <option value="1">Term 1</option>
                <option value="2">Term 2</option>
                <option value="3">Term 3</option>
              </select>
            </div>
          </div>

          {error && (
            <p className="text-sm text-brand-coral">
              {error instanceof Error ? error.message : 'Failed to save fee category.'}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-base">
          <button
            type="button" onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-muted hover:text-body min-h-11"
          >
            Cancel
          </button>
          <button
            type="button" onClick={handleSubmit} disabled={isPending || !canSubmit}
            className="inline-flex items-center gap-2 bg-brand-navy text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60 min-h-11"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {isPending ? 'Saving…' : isEditing ? 'Save Changes' : 'Save Fee Category'}
          </button>
        </div>
      </div>
    </div>
  )
}
