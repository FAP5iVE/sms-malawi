'use client'

/**
 * apps/web/src/components/finances/BudgetWindowsPanel.tsx
 *
 * [CHANGE TYPE]: MOVED + FIXED (was `BudgetWindows` inside ProcurementWorkspace.tsx)
 * [PURPOSE]: Budget windows are the CALENDAR of the budgeting process (when
 *   submissions, review and approval are open); Budget allocations are the
 *   MONEY. They belong on one screen — see BudgetTab.tsx — not one under
 *   Finance and one buried in Procurement.
 *
 *   Fixes carried out in the move:
 *   - `term` was held in state (default '1') but never rendered, so every
 *     window, including ANNUAL ones, was saved as Term 1. There is now a
 *     real Term select, and ANNUAL/CUSTOM windows send no term at all.
 *   - The list is scoped to the viewing academic year instead of showing
 *     every year's windows next to a year-scoped budget table.
 *   - Only DRAFT→OPEN→CLOSED was reachable; the schema also has REVIEW and
 *     ARCHIVED. All transitions are now available.
 *   - The create form is a proper labelled form (it was five unlabelled
 *     inputs crammed into the page header) and surfaces server errors.
 * [DEPENDS ON]: hooks/useProcurement (useBudgetWindows & mutations)
 */

import { useState } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { PermissionGuard } from '@/components/shared/PermissionGuard'
import {
  useBudgetWindows, useCreateBudgetWindow, useOpenBudgetWindow,
  useCloseBudgetWindow, useSetBudgetWindowStatus,
} from '@/hooks/useProcurement'

const TYPES = ['ANNUAL', 'TERM', 'QUARTERLY', 'MONTHLY', 'CUSTOM'] as const
// Only a TERM window is tied to a single term; the rest are year-wide or date-based.
const TERM_SCOPED: ReadonlyArray<string> = ['TERM']

function humanize(s: string) {
  return s.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase())
}
function errMsg(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'bg-page text-muted',
  OPEN: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  REVIEW: 'bg-brand-amber/10 text-brand-amber',
  CLOSED: 'bg-brand-coral/10 text-brand-coral',
  ARCHIVED: 'bg-page text-muted',
}

export function BudgetWindowsPanel({ academicYear, term: viewingTerm }: { academicYear: string; term: number }) {
  const { data = [], isLoading } = useBudgetWindows(academicYear)
  const create = useCreateBudgetWindow()
  const open = useOpenBudgetWindow()
  const close = useCloseBudgetWindow()
  const setStatus = useSetBudgetWindowStatus()

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<(typeof TYPES)[number]>('TERM')
  const [term, setTerm] = useState(String(viewingTerm))
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  const termScoped = TERM_SCOPED.includes(type)
  const dateError = start && end && end < start ? 'The end date is before the start date.' : null
  const canSave = !!name.trim() && !!start && !!end && !dateError && !!academicYear

  function make() {
    if (!canSave) return
    create.mutate(
      {
        academicYear,
        // Year-wide / date-based windows are not tied to one term.
        term: termScoped ? Number(term) : undefined,
        type,
        name: name.trim(),
        submissionStart: start,
        submissionEnd: end,
      },
      { onSuccess: () => { setName(''); setStart(''); setEnd(''); setShowForm(false) } },
    )
  }

  const actionError = open.error || close.error || setStatus.error

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-heading font-semibold text-brand-navy">Budget windows — {academicYear}</h3>
          <p className="text-sm text-muted">
            When departments may submit budget requests and requisitions. A requisition can only be raised
            under a window that is <strong>Open</strong>.
          </p>
        </div>
        <PermissionGuard permission="finance.manageBudgetWindows">
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 bg-brand-teal text-white rounded-lg px-3.5 py-2 text-sm font-semibold hover:bg-brand-teal-light min-h-11"
          >
            <Plus className="w-4 h-4" /> {showForm ? 'Cancel' : 'New window'}
          </button>
        </PermissionGuard>
      </div>

      {showForm && (
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-muted block mb-1">Window name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="e.g. Term 1 requisitions" />
            </label>
            <label className="block">
              <span className="text-xs text-muted block mb-1">Type</span>
              <select value={type} onChange={(e) => setType(e.target.value as (typeof TYPES)[number])} className="input">
                {TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
              </select>
            </label>
            {termScoped && (
              <label className="block">
                <span className="text-xs text-muted block mb-1">Term</span>
                <select value={term} onChange={(e) => setTerm(e.target.value)} className="input">
                  <option value="1">Term 1</option>
                  <option value="2">Term 2</option>
                  <option value="3">Term 3</option>
                </select>
              </label>
            )}
            <label className="block">
              <span className="text-xs text-muted block mb-1">Submissions open</span>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="input" />
            </label>
            <label className="block">
              <span className="text-xs text-muted block mb-1">Submissions close</span>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="input" />
            </label>
          </div>
          {dateError && <p className="text-sm text-brand-coral">{dateError}</p>}
          <button
            type="button"
            onClick={make}
            disabled={create.isPending || !canSave}
            className="inline-flex items-center gap-2 bg-brand-deep text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60 min-h-11"
          >
            {create.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {create.isPending ? 'Creating…' : 'Create window'}
          </button>
          {create.isError && <p className="text-sm text-brand-coral">{errMsg(create.error, 'Could not create the window.')}</p>}
        </div>
      )}

      {actionError && <p className="text-sm text-brand-coral">{errMsg(actionError, 'Could not change the window status.')}</p>}

      {isLoading ? (
        <div className="p-8 text-center text-muted"><Loader2 className="inline w-5 h-5 animate-spin" /></div>
      ) : data.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted">No budget windows for {academicYear} yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-base bg-page">
                {['Window', 'Period', 'Dates', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wide text-muted font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((w) => (
                <tr key={w.id} className="border-b border-base">
                  <td className="px-4 py-3 font-medium">{w.name}</td>
                  <td className="px-4 py-3">{w.academicYear} · {w.term ? `Term ${w.term}` : humanize(w.type)}</td>
                  <td className="px-4 py-3 text-xs">
                    {new Date(w.submissionStart).toLocaleDateString()} – {new Date(w.submissionEnd).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[w.status] ?? ''}`}>
                      {humanize(w.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <PermissionGuard permission="finance.manageBudgetWindows">
                      <div className="flex justify-end gap-1 flex-wrap">
                        {w.status === 'DRAFT' && <Btn onClick={() => open.mutate({ id: w.id })}>Open</Btn>}
                        {w.status === 'OPEN' && <Btn onClick={() => setStatus.mutate({ id: w.id, data: { status: 'REVIEW' } })}>Move to review</Btn>}
                        {(w.status === 'OPEN' || w.status === 'REVIEW') && <Btn onClick={() => close.mutate({ id: w.id })}>Close</Btn>}
                        {w.status === 'REVIEW' && <Btn onClick={() => setStatus.mutate({ id: w.id, data: { status: 'OPEN' } })}>Reopen</Btn>}
                        {w.status === 'CLOSED' && <Btn onClick={() => setStatus.mutate({ id: w.id, data: { status: 'ARCHIVED' } })}>Archive</Btn>}
                      </div>
                    </PermissionGuard>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function Btn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center min-h-10 px-2.5 rounded-lg border border-base text-xs font-medium hover:bg-page"
    >
      {children}
    </button>
  )
}
