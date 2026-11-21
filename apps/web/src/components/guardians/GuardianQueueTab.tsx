/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/guardians/GuardianQueueTab.tsx
 * [PHASE]: Guardian Portal — staff UI (T7a)
 * [PURPOSE]: The review queue: every guardian link across the school, filtered by status or by
 *   "needs re-verification", newest first, paged. Defaults to links awaiting approval, which is
 *   the work that blocks a parent from ever getting in. A search box finds one parent (name,
 *   phone, e-mail or national ID) or one student's guardians without paging; it works inside the
 *   chosen filter, and "All" removes the filter.
 * [DEPENDS ON]: @/hooks/useGuardians, ./GuardianLinkCard, ./GuardianSearchBox
 */
'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Inbox, Loader2 } from 'lucide-react'
import { GUARDIAN_LINK_STATUS_LABELS, type GuardianLinkStatusValue } from '@shared/constants/guardianPortal'
import { QUEUE_PAGE_SIZE, useGuardianQueue } from '@/hooks/useGuardians'
import { CHIP, CHIP_ON, CHIP_OFF } from '@/lib/hills/chip'
import { GuardianLinkCard } from './GuardianLinkCard'
import { GuardianSearchBox, useDebouncedValue } from './GuardianSearchBox'

const FILTERS: GuardianLinkStatusValue[] = ['PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'REVOKED']


export function GuardianQueueTab() {
  const [status, setStatus] = useState<GuardianLinkStatusValue | null>('PENDING')
  const [reverify, setReverify] = useState(false)
  const [skip, setSkip] = useState(0)
  const [text, setText] = useState('')
  const settled = useDebouncedValue(text.trim(), 300)
  const search = settled.length >= 2 ? settled : ''

  const queue = useGuardianQueue({ status: reverify ? null : status, reverify, skip, search })
  const items = queue.data?.items ?? []
  const hasNext = items.length === QUEUE_PAGE_SIZE

  const profileNames = new Map<string, string>()
  for (const l of items) if (l.profile) profileNames.set(l.profile.id, l.profile.fullName)

  const pick = (s: GuardianLinkStatusValue | null) => { setReverify(false); setStatus(s); setSkip(0) }
  const toggleReverify = () => { setReverify((v) => !v); setSkip(0) }
  const changeSearch = (next: string) => { setText(next); setSkip(0) }
  const scopeLabel = reverify ? 'among guardians needing re-verification' : status ? `among guardians marked “${GUARDIAN_LINK_STATUS_LABELS[status]}”` : 'anywhere in the queue'

  return (
    <div className="space-y-4">
      <GuardianSearchBox
        id="guardian-queue-search" label="Search guardians" value={text} onChange={changeSearch}
        placeholder="Guardian name, phone, e-mail or national ID, or a student"
      />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter guardians">
        <button type="button" aria-pressed={!reverify && status === null} onClick={() => pick(null)}
          className={`${CHIP} ${!reverify && status === null ? CHIP_ON : CHIP_OFF}`}>
          All
        </button>
        {FILTERS.map((s) => (
          <button key={s} type="button" aria-pressed={!reverify && status === s} onClick={() => pick(s)}
            className={`${CHIP} ${!reverify && status === s ? CHIP_ON : CHIP_OFF}`}>
            {GUARDIAN_LINK_STATUS_LABELS[s]}
          </button>
        ))}
        <button type="button" aria-pressed={reverify} onClick={toggleReverify}
          className={`${CHIP} ${reverify ? 'bg-status-warning text-white border-status-warning' : CHIP_OFF}`}>
          Needs re-verifying
        </button>
      </div>

      {queue.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted" role="status"><Loader2 className="w-4 h-4 animate-spin" aria-hidden />Loading…</div>
      )}
      {queue.isError && (
        <div role="alert" className="rounded-xl bg-brand-coral/10 p-3 text-sm text-body">
          Could not load the queue.{' '}
          <button type="button" className="font-medium underline" onClick={() => queue.refetch()}>Try again</button>
        </div>
      )}

      {queue.data && items.length === 0 && (
        <div className="app-tint rounded-xl p-10 text-center">
          <Inbox className="w-8 h-8 mx-auto text-muted mb-2" aria-hidden />
          <p className="font-medium text-body">
            {skip > 0
              ? 'No more guardians.'
              : search
                ? `No guardian or student matches “${search}” ${scopeLabel}.`
                : reverify ? 'Nobody needs re-verifying.' : status ? `Nothing ${GUARDIAN_LINK_STATUS_LABELS[status].toLowerCase()}.` : 'No guardians yet.'}
          </p>
          {search && skip === 0 && (reverify || status !== null) && (
            <button type="button" className="mt-2 font-medium underline text-sm text-body" onClick={() => pick(null)}>Search in every status</button>
          )}
          {status === 'PENDING' && !reverify && skip === 0 && !search && (
            <p className="text-sm text-muted mt-1">New guardians appear here once a student’s contacts have been read. Use the Student or Onboarding tab to bring them in.</p>
          )}
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-3">
          {items.map((l) => <GuardianLinkCard key={l.id} link={l} showStudent profileNames={profileNames} />)}
        </div>
      )}

      {(skip > 0 || hasNext) && (
        <nav className="flex items-center justify-between pt-1" aria-label="Pages">
          <button type="button" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - QUEUE_PAGE_SIZE))}
            className="inline-flex items-center gap-1.5 min-h-11 px-3.5 rounded-xl text-sm font-medium border border-base text-body hover:bg-page disabled:opacity-40">
            <ChevronLeft className="w-4 h-4" aria-hidden />Previous
          </button>
          <span className="text-sm text-muted">Showing {skip + 1}–{skip + items.length}</span>
          <button type="button" disabled={!hasNext} onClick={() => setSkip(skip + QUEUE_PAGE_SIZE)}
            className="inline-flex items-center gap-1.5 min-h-11 px-3.5 rounded-xl text-sm font-medium border border-base text-body hover:bg-page disabled:opacity-40">
            Next<ChevronRight className="w-4 h-4" aria-hidden />
          </button>
        </nav>
      )}
    </div>
  )
}
