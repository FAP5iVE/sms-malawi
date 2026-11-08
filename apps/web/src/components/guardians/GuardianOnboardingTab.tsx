/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/guardians/GuardianOnboardingTab.tsx
 * [PHASE]: Guardian Portal — staff UI (T7a)
 * [PURPOSE]: Bring existing students' guardian contacts into the portal in bulk: preview what
 *   would happen (nothing is created), create the guardians in chunks, and undo a batch.
 *
 *   Everything created is PENDING: no guardian gets access from onboarding alone; each still
 *   needs a staff decision in the Review queue. That is why a mistake here is cheap to undo and
 *   why the copy says so.
 * [DEPENDS ON]: @/hooks/useGuardians, @/hooks/useClasses
 */
'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Play, Undo2 } from 'lucide-react'
import { GUARDIAN_ONBOARDING_ACTIONS, GUARDIAN_ONBOARDING_ACTION_LABELS, type GuardianOnboardingActionValue } from '@shared/constants/guardianPortal'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { useClasses } from '@/hooks/useClasses'
import {
  useApplyOnboarding, useOnboardingDryRun, useOnboardingReport, useRollbackOnboarding,
  type OnboardingRollbackResult,
} from '@/hooks/useGuardians'

const APPLY_CHUNK = 100

const FLAG_LABELS: Record<string, string> = {
  MATCHES_EXISTING_PROFILE: 'Looks like a guardian already on file',
  MATCHES_EARLIER_IN_BATCH: 'Looks like another entry in this batch',
}

/** "SOME_FLAG_NAME" → "some flag name" for flags this screen has no wording for yet. */
export function flagLabel(flag: string): string {
  return FLAG_LABELS[flag] ?? flag.toLowerCase().replace(/_/g, ' ')
}

const STATUS_TEXT = {
  DRY_RUN: 'Preview only. Nothing has been created.',
  APPLYING: 'Partly created. Continue to finish.',
  APPLIED: 'Done. Every guardian in this batch is now waiting in the Review queue.',
  ROLLED_BACK: 'Undone.',
} as const

const BTN =
  'inline-flex items-center justify-center gap-1.5 min-h-11 px-4 rounded-xl text-sm font-heading font-semibold transition-colors disabled:opacity-60 disabled:pointer-events-none'

const ITEMS_PAGE = 100
const CHIP = 'inline-flex items-center min-h-11 px-3.5 rounded-full text-sm font-medium border transition-colors'

/** Who each row is about, with a filter by what would happen to it. Names come from the report itself. */
function BatchItems({ batchId }: { batchId: string }) {
  const [action, setAction] = useState<GuardianOnboardingActionValue | null>(null)
  const [skip, setSkip] = useState(0)
  const q = useOnboardingReport(batchId, action, skip)
  const items = q.data?.items ?? []
  const pick = (a: GuardianOnboardingActionValue | null) => { setAction(a); setSkip(0) }
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-body">Who is in this preview</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by what will happen">
        {[null, ...GUARDIAN_ONBOARDING_ACTIONS].map((a) => (
          <button key={a ?? 'all'} type="button" aria-pressed={action === a} onClick={() => pick(a)}
            className={`${CHIP} ${action === a ? 'bg-brand-teal text-white border-brand-teal' : 'border-base text-muted hover:text-body hover:bg-page'}`}>
            {a ? GUARDIAN_ONBOARDING_ACTION_LABELS[a] : 'All'}
          </button>
        ))}
      </div>
      {q.isLoading && <p className="text-sm text-muted" role="status">Loading…</p>}
      {q.isError && <p role="alert" className="text-sm text-body">Could not load the list. <button type="button" className="font-medium underline" onClick={() => q.refetch()}>Try again</button></p>}
      {q.data && items.length === 0 && <p className="text-sm text-muted">{skip > 0 ? 'No more.' : 'Nobody matches this filter.'}</p>}
      {items.length > 0 && (
        <ul className="divide-y divide-[var(--border-base,rgba(0,0,0,0.08))]">
          {items.map((i) => (
            <li key={i.id} className="py-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
              <span className="min-w-0">
                <span className="block text-sm font-medium text-body truncate">{i.studentName ?? 'Unknown student'}{i.registrationNo ? <span className="font-normal text-muted"> · {i.registrationNo}</span> : null}</span>
                <span className="block text-sm text-muted truncate">{i.guardianName ?? 'Unknown guardian'}{i.relation ? ` · ${i.relation}` : ''}</span>
              </span>
              <span className="text-right">
                <span className="block text-sm text-body">{GUARDIAN_ONBOARDING_ACTION_LABELS[i.action]}</span>
                {i.flags.length > 0 && <span className="block text-xs text-muted">{i.flags.map(flagLabel).join(', ')}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {(skip > 0 || items.length === ITEMS_PAGE) && (
        <nav className="flex items-center justify-between" aria-label="Pages">
          <button type="button" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - ITEMS_PAGE))} className={`${BTN} border border-base text-body hover:bg-page`}><ChevronLeft className="w-4 h-4" aria-hidden />Previous</button>
          <span className="text-sm text-muted">Showing {skip + 1}–{skip + items.length}</span>
          <button type="button" disabled={items.length < ITEMS_PAGE} onClick={() => setSkip(skip + ITEMS_PAGE)} className={`${BTN} border border-base text-body hover:bg-page`}>Next<ChevronRight className="w-4 h-4" aria-hidden /></button>
        </nav>
      )}
    </div>
  )
}

export function GuardianOnboardingTab() {
  const classes = useClasses()
  const dryRun = useOnboardingDryRun()
  const apply = useApplyOnboarding()
  const rollback = useRollbackOnboarding()

  const [classId, setClassId] = useState('')
  const [includeNotEnrolled, setIncludeNotEnrolled] = useState(false)
  const [batchId, setBatchId] = useState<string | null>(null)
  const [totals, setTotals] = useState({ created: 0, skipped: 0 })
  const [running, setRunning] = useState(false)
  const [rolled, setRolled] = useState<OnboardingRollbackResult | null>(null)
  const [confirm, setConfirm] = useState<'apply' | 'rollback' | null>(null)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  const report = useOnboardingReport(batchId, null)
  const status = report.data?.batch.status
  const summary = dryRun.data
  const creatable = summary ? summary.byAction.CREATE_NEW + summary.byAction.SUGGEST_MATCH : 0

  const preview = () => {
    setRolled(null); setTotals({ created: 0, skipped: 0 })
    dryRun.mutate(
      { ...(classId ? { classId } : {}), ...(includeNotEnrolled ? { includeNotEnrolled: true } : {}) },
      { onSuccess: (r) => setBatchId(r.batchId) },
    )
  }

  /** Create in chunks until nothing remains. A failed chunk stops the loop; progress so far is kept server-side. */
  const run = async () => {
    if (!batchId) return
    setConfirm(null); setRunning(true)
    try {
      for (;;) {
        const r = await apply.mutateAsync({ batchId, maxItems: APPLY_CHUNK })
        if (!alive.current) return
        setTotals((t) => ({ created: t.created + r.created, skipped: t.skipped + r.skipped }))
        if (r.remaining === 0 || r.processed === 0) break
      }
    } catch { /* the global handler already toasted the reason; the batch can be continued */ }
    finally { if (alive.current) setRunning(false) }
  }

  const undo = () => {
    if (!batchId) return
    rollback.mutate(batchId, { onSuccess: (r) => { setRolled(r); setConfirm(null) } })
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-base bg-surface p-4 space-y-4" aria-label="Choose who to include">
        <div>
          <h2 className="font-heading font-semibold text-body">Bring existing guardians into the portal</h2>
          <p className="text-sm text-muted mt-1">
            Reads the guardian contacts already recorded on students and prepares them for review. Nobody gets access from this step:
            each guardian still has to be approved in the Review queue.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="ob-class" className="block text-xs font-medium text-body mb-1">Class</label>
            <select id="ob-class" value={classId} onChange={(e) => setClassId(e.target.value)}
              className="w-full rounded-xl border border-base bg-page px-3 py-2.5 text-sm text-body min-h-11 focus:outline-none focus:ring-2 focus:ring-brand-teal/40">
              <option value="">Whole school</option>
              {(classes.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <label className="flex items-start gap-3 rounded-xl border border-base px-3 py-2.5 min-h-11 cursor-pointer hover:bg-page self-end">
            <input type="checkbox" checked={includeNotEnrolled} onChange={(e) => setIncludeNotEnrolled(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-teal" />
            <span className="text-sm text-body">Include students who are no longer enrolled</span>
          </label>
        </div>
        <button type="button" disabled={dryRun.isPending || running} onClick={preview} className={`${BTN} bg-brand-teal text-white hover:bg-brand-teal-light`}>
          {dryRun.isPending ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden />Preparing…</> : 'Preview'}
        </button>
      </section>

      {summary && (
        <section className="rounded-2xl border border-base bg-surface p-4 space-y-4" aria-label="Preview">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-heading font-semibold text-body">{summary.cards} guardian contact{summary.cards === 1 ? '' : 's'} found</h2>
            {status && <span className="text-sm text-muted" role="status">{STATUS_TEXT[status]}</span>}
          </div>

          <dl className="grid gap-2 sm:grid-cols-2">
            {GUARDIAN_ONBOARDING_ACTIONS.map((a) => (
              <div key={a} className="flex items-center justify-between rounded-xl border border-base px-3 py-2.5">
                <dt className="text-sm text-body">{GUARDIAN_ONBOARDING_ACTION_LABELS[a]}</dt>
                <dd className="font-heading font-semibold text-body tabular-nums">{summary.byAction[a]}</dd>
              </div>
            ))}
          </dl>

          {Object.keys(summary.byFlag).length > 0 && (
            <div>
              <p className="text-xs font-medium text-body mb-1">Things to be aware of</p>
              <ul className="space-y-1">
                {Object.entries(summary.byFlag).sort((a, b) => b[1] - a[1]).map(([f, n]) => (
                  <li key={f} className="flex justify-between text-sm text-muted"><span>{flagLabel(f)}</span><span className="tabular-nums">{n}</span></li>
                ))}
              </ul>
            </div>
          )}

          <BatchItems batchId={summary.batchId} />

          {summary.truncated && (
            <p role="note" className="rounded-xl border border-status-warning/40 bg-status-warning/10 p-3 text-sm text-body">
              This batch hit its size limit, so only the first part is included. After creating these, run the preview again to pick up the rest.
            </p>
          )}

          {totals.created + totals.skipped > 0 && (
            <p role="status" className="rounded-xl bg-page px-3 py-2 text-sm text-body">
              {totals.created} guardian{totals.created === 1 ? '' : 's'} created{totals.skipped > 0 ? `, ${totals.skipped} skipped` : ''}.
            </p>
          )}
          {rolled && (
            <p role="status" className="rounded-xl bg-page px-3 py-2 text-sm text-body">
              Undone: {rolled.removed} removed{rolled.kept > 0 ? `, ${rolled.kept} kept because someone had already acted on them` : ''}.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {(status === 'DRY_RUN' || status === 'APPLYING') && creatable > 0 && (
              <button type="button" disabled={running} onClick={() => setConfirm('apply')} className={`${BTN} bg-brand-teal text-white hover:bg-brand-teal-light`}>
                {running ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden />Creating…</> : <><Play className="w-4 h-4" aria-hidden />{status === 'APPLYING' ? 'Continue creating' : `Create ${creatable} guardian${creatable === 1 ? '' : 's'}`}</>}
              </button>
            )}
            {(status === 'APPLYING' || status === 'APPLIED') && (
              <button type="button" disabled={running || rollback.isPending} onClick={() => setConfirm('rollback')} className={`${BTN} border border-brand-coral/40 text-brand-coral hover:bg-brand-coral/10`}>
                <Undo2 className="w-4 h-4" aria-hidden />Undo this batch
              </button>
            )}
          </div>
        </section>
      )}

      <ConfirmDialog
        open={confirm === 'apply'} title="Create these guardians?"
        description={`This adds ${creatable} guardian${creatable === 1 ? '' : 's'} to the Review queue as awaiting approval. None of them can sign in or see anything until you approve them.`}
        confirmLabel="Create" onCancel={() => setConfirm(null)} onConfirm={run}
      />
      <ConfirmDialog
        open={confirm === 'rollback'} destructive title="Undo this batch?"
        description="Guardians from this batch that nobody has acted on are removed. Any that were already verified, approved, rejected or invited are kept."
        confirmLabel="Undo batch" confirming={rollback.isPending} confirmingLabel="Undoing…"
        onCancel={() => setConfirm(null)} onConfirm={undo}
      />
    </div>
  )
}
