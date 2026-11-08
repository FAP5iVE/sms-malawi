/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/guardians/GuardianAccessLogTab.tsx
 * [PHASE]: Guardian Portal — staff UI (T7a)
 * [PURPOSE]: Who looked at (or was refused) a child's information, most recent first. Scoped to
 *   one student because the API refuses an unscoped query, and names guardians by looking up the
 *   student's own links, since the log itself stores only ids.
 * [DEPENDS ON]: @/hooks/useGuardians, ./GuardianStudentPicker
 */
'use client'

import { useState } from 'react'
import { Loader2, ScrollText } from 'lucide-react'
import { GUARDIAN_CAPABILITY_LABELS, denyReasonLabel, isGuardianCapability } from '@shared/constants/guardianPortal'
import { useGuardianAccessLog, useGuardianStudentView } from '@/hooks/useGuardians'
import { GuardianStudentPicker, type PickedStudent } from './GuardianStudentPicker'

/** Sections that are logged on their own but are not a grantable capability. */
const EXTRA_MODULE_LABELS: Readonly<Record<string, string>> = { reportCard: 'Report card' }

function fmtWhen(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function GuardianAccessLogTab() {
  const [student, setStudent] = useState<PickedStudent | null>(null)
  const log = useGuardianAccessLog({ studentId: student?.id ?? null })
  const view = useGuardianStudentView(student?.id ?? null)

  const names = new Map<string, string>()
  for (const l of view.data?.links ?? []) if (l.profile) names.set(l.profile.id, l.profile.fullName)

  const rows = log.data?.items ?? []

  return (
    <div className="space-y-4">
      <GuardianStudentPicker selected={student} onSelect={setStudent} onClear={() => setStudent(null)} inputId="guardian-log-student" />

      {!student && <p className="text-sm text-muted">Choose a student to see who has looked at their information.</p>}

      {student && log.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted" role="status"><Loader2 className="w-4 h-4 animate-spin" aria-hidden />Loading…</div>
      )}
      {student && log.isError && (
        <div role="alert" className="rounded-xl border border-brand-coral/40 bg-brand-coral/10 p-3 text-sm text-body">
          Could not load the access log.{' '}
          <button type="button" className="font-medium underline" onClick={() => log.refetch()}>Try again</button>
        </div>
      )}

      {log.data && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-base p-10 text-center">
          <ScrollText className="w-8 h-8 mx-auto text-muted mb-2" aria-hidden />
          <p className="font-medium text-body">No activity yet</p>
          <p className="text-sm text-muted mt-1">Nobody has opened this child’s information through the parent portal.</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="rounded-2xl border border-base bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Parent portal access for {student?.name}</caption>
            <thead>
              <tr className="text-left text-xs text-muted border-b border-base">
                <th scope="col" className="px-4 py-3 font-medium">When</th>
                <th scope="col" className="px-4 py-3 font-medium">Guardian</th>
                <th scope="col" className="px-4 py-3 font-medium">Section</th>
                <th scope="col" className="px-4 py-3 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-base last:border-0 align-top">
                  <td className="px-4 py-3 whitespace-nowrap text-muted">{fmtWhen(r.createdAt)}</td>
                  <td className="px-4 py-3 text-body">{names.get(r.profileId) ?? 'Unknown guardian'}</td>
                  <td className="px-4 py-3 text-body">{isGuardianCapability(r.module) ? GUARDIAN_CAPABILITY_LABELS[r.module].label : (EXTRA_MODULE_LABELS[r.module] ?? r.module)}</td>
                  <td className="px-4 py-3">
                    {r.outcome === 'ALLOWED'
                      ? <span className="rounded-full px-2.5 py-1 text-xs font-medium bg-status-success/10 text-status-success">Viewed</span>
                      : <span className="rounded-full px-2.5 py-1 text-xs font-medium bg-brand-coral/10 text-brand-coral">Refused</span>}
                    {r.outcome !== 'ALLOWED' && r.reason && <span className="block text-xs text-muted mt-1">{denyReasonLabel(r.reason)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length === 100 && <p className="text-xs text-muted">Showing the most recent 100 entries.</p>}
    </div>
  )
}
