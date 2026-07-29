'use client'

/**
 * apps/web/src/components/finances/FeeStructureTab.tsx
 *
 * [CHANGE TYPE]: NEW FILE (production fix, 2026-07-28)
 * [PURPOSE]: GET/POST /finances/fee-structures both already existed and
 *   worked — confirmed zero frontend callers anywhere. This is what
 *   /public/fee-structure (the Admissions page's real fee display, built
 *   earlier this session) actually reads from: school-wide items with no
 *   classId and no term. Class/term-specific items are also supported here
 *   for internal use, but only school-wide ones surface publicly — a
 *   public page can't sensibly show every class/term variant.
 * [DEPENDS ON]: useFinances.ts (useFeeStructures/useCreateFeeStructure)
 */

import { useState } from 'react'
import { useFeeStructures, useCreateFeeStructure } from '@/hooks/useFinances'
import { useClasses } from '@/hooks/useClasses'
import { formatMWK } from '@shared/constants/malawi'
import { Plus, Loader2, Globe } from 'lucide-react'

export function FeeStructureTab({ academicYear }: { academicYear: string }) {
  const { data: fees = [], isLoading } = useFeeStructures(academicYear)
  const { data: classes = [] } = useClasses(academicYear)
  const createFee = useCreateFeeStructure()

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [classId, setClassId] = useState('')
  const [term, setTerm] = useState('')

  function submitFee() {
    if (!name.trim() || !amount || Number(amount) <= 0) return
    createFee.mutate(
      {
        name: name.trim(),
        amount: Number(amount),
        academicYear,
        classId: classId || undefined,
        term: term ? Number(term) : undefined,
      },
      {
        onSuccess: () => {
          setShowForm(false)
          setName(''); setAmount(''); setClassId(''); setTerm('')
        },
      },
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading font-semibold text-body">Fee Structure — {academicYear}</h2>
          <p className="text-xs text-muted mt-0.5">
            School-wide items (no class, no term) are the ones shown on the public Admissions page.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 bg-brand-teal text-white rounded-lg px-3.5 py-2 text-sm font-semibold hover:bg-brand-teal-light min-h-11"
        >
          <Plus className="w-4 h-4" /> {showForm ? 'Cancel' : 'Add Fee Item'}
        </button>
      </div>

      {showForm && (
        <div className="bg-surface border border-base rounded-xl p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="fee-name" className="text-xs text-muted mb-1 block">Fee name</label>
              <input id="fee-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tuition, Boarding, Exam Fee"
                className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11" />
            </div>
            <div>
              <label htmlFor="fee-amount" className="text-xs text-muted mb-1 block">Amount (MWK)</label>
              <input id="fee-amount" type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)}
                className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11" />
            </div>
            <div>
              <label htmlFor="fee-class" className="text-xs text-muted mb-1 block">
                Class <span className="text-muted/70">(optional — blank = applies to all classes)</span>
              </label>
              <select id="fee-class" value={classId} onChange={(e) => setClassId(e.target.value)}
                className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11">
                <option value="">All classes</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="fee-term" className="text-xs text-muted mb-1 block">
                Term <span className="text-muted/70">(optional — blank = applies to all terms)</span>
              </label>
              <select id="fee-term" value={term} onChange={(e) => setTerm(e.target.value)}
                className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11">
                <option value="">All terms</option>
                <option value="1">Term 1</option>
                <option value="2">Term 2</option>
                <option value="3">Term 3</option>
              </select>
            </div>
          </div>
          {!classId && !term && (
            <p className="text-xs text-brand-teal flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" /> This item will show on the public Admissions page.
            </p>
          )}
          <button
            type="button"
            onClick={submitFee}
            disabled={createFee.isPending || !name.trim() || !amount}
            className="inline-flex items-center gap-2 bg-brand-navy text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60 min-h-11"
          >
            {createFee.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {createFee.isPending ? 'Saving…' : 'Save Fee Item'}
          </button>
          {createFee.isError && (
            <p className="text-sm text-brand-coral">
              {createFee.error instanceof Error ? createFee.error.message : 'Failed to create fee item.'}
            </p>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="skeleton h-48 rounded-xl" />
      ) : fees.length === 0 ? (
        <div className="bg-surface border border-base rounded-xl p-12 text-center text-muted text-sm">
          No fee structure defined for {academicYear} yet.
        </div>
      ) : (
        <div className="bg-surface border border-base rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-base bg-page">
                <th className="text-left px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">Name</th>
                <th className="text-left px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">Scope</th>
                <th className="text-right px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {fees.map((f) => (
                <tr key={f.id} className="border-b border-base last:border-0 hover:bg-page">
                  <td className="px-4 py-3 font-medium">{f.name}</td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {!f.classId && !f.term ? (
                      <span className="text-brand-teal font-medium flex items-center gap-1"><Globe className="w-3 h-3" /> Public / All</span>
                    ) : (
                      [f.classId && classes.find((c) => c.id === f.classId)?.name, f.term && `Term ${f.term}`].filter(Boolean).join(' · ') || 'All'
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular font-semibold">{formatMWK(f.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}