/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/guardians/GuardianStudentTab.tsx
 * [PHASE]: Guardian Portal — staff UI (T7a)
 * [PURPOSE]: Look up one student, see the guardian contacts on their record, turn those
 *   contacts into pending guardian links ("Read contacts"), and act on each link.
 *
 *   This is the entry point for any student who is not part of a bulk onboarding batch, and the
 *   only place that shows the raw contact cards next to the links built from them.
 * [DEPENDS ON]: @/hooks/useGuardians, ./GuardianLinkCard, ./GuardianStudentPicker
 */
'use client'

import { useState } from 'react'
import { Loader2, RefreshCw, Users } from 'lucide-react'
import { usePermissions } from '@/hooks/usePermissions'
import { useGuardianStudentView, useSyncStudentGuardians, type GuardianSyncResult } from '@/hooks/useGuardians'
import { GuardianLinkCard } from './GuardianLinkCard'
import { GuardianStudentPicker, type PickedStudent } from './GuardianStudentPicker'

/** One plain sentence for what "Read contacts" did. Exported for its test. */
export function describeSync(r: GuardianSyncResult): string {
  const parts: string[] = []
  if (r.proposed > 0) parts.push(`${r.proposed} new guardian${r.proposed === 1 ? '' : 's'} added for review`)
  if (r.existing > 0) parts.push(`${r.existing} already on file`)
  if (r.skipped > 0) parts.push(`${r.skipped} skipped (no usable name)`)
  if (r.flagged > 0) parts.push(`${r.flagged} changed since approval and now need re-verifying`)
  return parts.length > 0 ? `${parts.join(', ')}.` : 'This student has no guardian contacts to read.'
}

export function GuardianStudentTab() {
  const { can } = usePermissions()
  const [student, setStudent] = useState<PickedStudent | null>(null)
  const view = useGuardianStudentView(student?.id ?? null)
  const sync = useSyncStudentGuardians()

  const data = view.data
  const profileNames = new Map<string, string>()
  for (const l of data?.links ?? []) if (l.profile) profileNames.set(l.profile.id, l.profile.fullName)

  return (
    <div className="space-y-4">
      <GuardianStudentPicker
        selected={student}
        onSelect={(s) => { sync.reset(); setStudent(s) }}
        onClear={() => { sync.reset(); setStudent(null) }}
      />

      {student && view.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted" role="status"><Loader2 className="w-4 h-4 animate-spin" aria-hidden />Loading guardians…</div>
      )}
      {student && view.isError && (
        <div role="alert" className="rounded-xl border border-brand-coral/40 bg-brand-coral/10 p-3 text-sm text-body">
          Could not load this student’s guardians.{' '}
          <button type="button" className="font-medium underline" onClick={() => view.refetch()}>Try again</button>
        </div>
      )}

      {data && (
        <>
          <section className="rounded-2xl border border-base bg-surface p-4 space-y-3" aria-label="Contacts on the student record">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-heading font-semibold text-body">Contacts on the student’s record</h2>
                <p className="text-sm text-muted">{data.cards.length === 0 ? 'None recorded.' : `${data.cards.length} recorded.`}</p>
              </div>
              {can('guardian.propose') && (
                <button
                  type="button" disabled={sync.isPending} onClick={() => sync.mutate(data.student.id)}
                  className="inline-flex items-center justify-center gap-1.5 min-h-11 px-3.5 rounded-xl text-sm font-heading font-semibold border border-base text-body hover:bg-page disabled:opacity-60"
                >
                  <RefreshCw className={`w-4 h-4 ${sync.isPending ? 'animate-spin' : ''}`} aria-hidden />
                  {sync.isPending ? 'Reading…' : 'Read contacts'}
                </button>
              )}
            </div>
            {sync.data && <p role="status" className="text-sm text-body rounded-xl bg-page px-3 py-2">{describeSync(sync.data)}</p>}
            {data.cards.length > 0 && (
              <ul className="divide-y divide-[var(--border-base,rgba(0,0,0,0.08))]">
                {data.cards.map((c) => (
                  <li key={c.id} className="py-2 text-sm">
                    <span className="font-medium text-body">{c.fullName}</span>
                    <span className="text-muted">{c.relation ? ` · ${c.relation}` : ''}{c.phone ? ` · ${c.phone}` : ''}{c.email ? ` · ${c.email}` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data.links.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-base p-8 text-center">
              <Users className="w-8 h-8 mx-auto text-muted mb-2" aria-hidden />
              <p className="font-medium text-body">No guardians linked yet</p>
              <p className="text-sm text-muted mt-1">
                {data.cards.length > 0
                  ? 'Use “Read contacts” to turn the contacts above into guardians you can review.'
                  : 'Add a guardian contact on the student’s record first, then read it here.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.links.map((l) => <GuardianLinkCard key={l.id} link={l} profileNames={profileNames} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
