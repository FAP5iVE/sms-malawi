/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/guardians/GuardianAccessLogTab.tsx
 * [PHASE]: Guardian Portal — staff UI (T7a)
 * [PURPOSE]: Who looked at (or was refused) a child's information, most recent first. The full
 *   log is scoped to one student because the API refuses an unscoped query, and names guardians by
 *   looking up the student's own links, since the log itself stores only ids.
 *
 *   With no student chosen the tab is not empty: the search box comes first, and below it the
 *   students whose information parents opened most recently, one row each. Choosing a row (or
 *   searching for someone else) opens that student's full log.
 * [DEPENDS ON]: @/hooks/useGuardians, ./GuardianStudentPicker
 */
'use client'

import { useState } from 'react'
import { Loader2, ScrollText } from 'lucide-react'
import { GUARDIAN_CAPABILITY_LABELS, denyReasonLabel, isGuardianCapability } from '@shared/constants/guardianPortal'
import { useGuardianAccessLog, useGuardianStudentView, useRecentGuardianAccess, type RecentGuardianAccessRow } from '@/hooks/useGuardians'
import { ListPager } from '@/components/shared/ListPager'
import { StatusText } from '@/components/shared/StatusText'
import { usePagedRows } from '@/lib/hills/usePagedRows'
import { GuardianStudentPicker, type PickedStudent } from './GuardianStudentPicker'

/** Sections that are logged on their own but are not a grantable capability. */
const EXTRA_MODULE_LABELS: Readonly<Record<string, string>> = { reportCard: 'Report card' }

function sectionLabel(module: string): string {
  return isGuardianCapability(module) ? GUARDIAN_CAPABILITY_LABELS[module].label : (EXTRA_MODULE_LABELS[module] ?? module)
}

/** The default view: one row per student, newest activity first. */
function RecentAccess({ onOpen }: { onOpen: (s: PickedStudent) => void }) {
  const recent = useRecentGuardianAccess()
  const rows: RecentGuardianAccessRow[] = recent.data?.items ?? []
  const paging = usePagedRows(rows, { resetKey: 'recent' })

  return (
    <section className="space-y-3" aria-label="Recently opened">
      <div>
        <h2 className="font-heading font-semibold text-body">Recently opened</h2>
        <p className="text-sm text-muted">The students whose information parents opened most recently. Choose one to see their full log.</p>
      </div>

      {recent.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted" role="status"><Loader2 className="w-4 h-4 animate-spin" aria-hidden />Loading…</div>
      )}
      {recent.isError && (
        <div role="alert" className="rounded-xl bg-brand-coral/10 p-3 text-sm text-body">
          Could not load recent activity.{' '}
          <button type="button" className="font-medium underline" onClick={() => recent.refetch()}>Try again</button>
        </div>
      )}
      {recent.data && rows.length === 0 && (
        <div className="app-tint rounded-xl p-10 text-center">
          <ScrollText className="w-8 h-8 mx-auto text-muted mb-2" aria-hidden />
          <p className="font-medium text-body">No activity yet</p>
          <p className="text-sm text-muted mt-1">Nobody has opened a child’s information through the parent portal.</p>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <ul className="rounded-xl border border-base bg-surface divide-y divide-[var(--border-base,rgba(0,0,0,0.08))] overflow-hidden">
            {paging.visible.map((r) => (
              <li key={r.student.id}>
                <button
                  type="button" className="w-full text-left px-4 py-3 min-h-11 hover:bg-page grid gap-x-4 gap-y-1 sm:grid-cols-[1fr_auto]"
                  onClick={() => onOpen({ id: r.student.id, name: `${r.student.firstName} ${r.student.lastName}`.trim(), registrationNo: r.student.registrationNo })}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-body">{r.student.firstName} {r.student.lastName}</span>
                    <span className="block text-xs text-muted">
                      {r.student.registrationNo} · {r.guardianName ?? 'Unknown guardian'} · {sectionLabel(r.module)}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 text-xs sm:justify-end">
                    {r.outcome === 'ALLOWED'
                      ? <StatusText tone="success">Viewed</StatusText>
                      : <StatusText tone="danger">Refused</StatusText>}
                    <span className="text-muted whitespace-nowrap">{fmtWhen(r.lastAccessAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <ListPager paging={paging} />
        </>
      )}
    </section>
  )
}

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
  // Paging is done here on the rows already loaded (no new request).
  const paging = usePagedRows(rows, { resetKey: student?.id ?? '' })

  return (
    <div className="space-y-4">
      <GuardianStudentPicker selected={student} onSelect={setStudent} onClear={() => setStudent(null)} inputId="guardian-log-student" />

      {!student && <RecentAccess onOpen={setStudent} />}

      {student && log.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted" role="status"><Loader2 className="w-4 h-4 animate-spin" aria-hidden />Loading…</div>
      )}
      {student && log.isError && (
        <div role="alert" className="rounded-xl bg-brand-coral/10 p-3 text-sm text-body">
          Could not load the access log.{' '}
          <button type="button" className="font-medium underline" onClick={() => log.refetch()}>Try again</button>
        </div>
      )}

      {log.data && rows.length === 0 && (
        <div className="app-tint rounded-xl p-10 text-center">
          <ScrollText className="w-8 h-8 mx-auto text-muted mb-2" aria-hidden />
          <p className="font-medium text-body">No activity yet</p>
          <p className="text-sm text-muted mt-1">Nobody has opened this child’s information through the parent portal.</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto">
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
              {paging.visible.map((r) => (
                <tr key={r.id} className="border-b border-base last:border-0 align-top">
                  <td className="px-4 py-3 whitespace-nowrap text-muted">{fmtWhen(r.createdAt)}</td>
                  <td className="px-4 py-3 text-body">{names.get(r.profileId) ?? 'Unknown guardian'}</td>
                  <td className="px-4 py-3 text-body">{sectionLabel(r.module)}</td>
                  <td className="px-4 py-3">
                    {r.outcome === 'ALLOWED'
                      ? <StatusText tone="success">Viewed</StatusText>
                      : <StatusText tone="danger">Refused</StatusText>}
                    {r.outcome !== 'ALLOWED' && r.reason && <span className="block text-xs text-muted mt-1">{denyReasonLabel(r.reason)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ListPager paging={paging} />
        </div>
      )}
      {rows.length === 100 && <p className="text-xs text-muted">Showing the most recent 100 entries.</p>}
    </div>
  )
}
