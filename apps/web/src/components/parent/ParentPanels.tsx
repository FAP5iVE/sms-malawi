/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/parent/ParentPanels.tsx
 * [PHASE]: Guardian Portal — parent UI (T7c)
 * [PURPOSE]: The three sections a guardian can open for a child: Results, Fees, Attendance.
 *   Each fetches only when its tab is shown, and each handles the same three states: loading,
 *   a refused section (the API answers 404, shown as "not available", not as a fault), and a
 *   real error with a retry.
 *
 *   Display rules (money, rate, wording) live in lib/parentPortalFormat.ts where they are tested.
 *   Nothing here derives a number the API did not send, except the attendance rate, which the
 *   tested attendanceFigures() computes and names exactly ("attended" = present or late).
 * [DEPENDS ON]: @/hooks/useParentPortal, @/lib/parentPortalFormat
 */
'use client'

import type { ReactNode } from 'react'
import { AlertTriangle, Loader2, Lock } from 'lucide-react'
import { ApiError } from '@/lib/api-client'
import {
  useChildAttendance, useChildFees, useChildResults,
  type ParentResultsTerm,
} from '@/hooks/useParentPortal'
import {
  attendanceFigures, attendanceLabel, attendanceTone, formatDay, formatMwk, gradeText, invoiceStatusLabel,
  invoiceStatusTone, paymentMethodLabel, percentText, termLabel, type StatusTone,
} from '@/lib/parentPortalFormat'

const TONE: Record<StatusTone, string> = {
  success: 'bg-status-success/10 text-status-success',
  warning: 'bg-status-warning/10 text-status-warning',
  danger: 'bg-brand-coral/10 text-brand-coral',
  neutral: 'bg-status-neutral/10 text-muted',
}

function Pill({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${TONE[tone]}`}>{children}</span>
}

const CARD = 'rounded-2xl border border-base bg-surface p-4'

/** Loading / refused / error wrapper shared by every panel. */
function QueryState({ query, children }: {
  query: { isLoading: boolean; isError: boolean; error: unknown; refetch: () => void }
  children: ReactNode
}) {
  if (query.isLoading) {
    return <div className="flex items-center gap-2 text-sm text-muted py-6" role="status"><Loader2 className="w-4 h-4 animate-spin" aria-hidden />Loading…</div>
  }
  if (query.isError) {
    const refused = query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 403)
    if (refused) {
      return (
        <div className={`${CARD} flex items-start gap-3`} role="status">
          <Lock className="w-5 h-5 mt-0.5 text-muted shrink-0" aria-hidden />
          <p className="text-sm text-body">This section is not available for your child right now. If you think it should be, please contact the school office.</p>
        </div>
      )
    }
    return (
      <div role="alert" className="rounded-xl border border-brand-coral/40 bg-brand-coral/10 p-3 text-sm text-body flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-brand-coral" aria-hidden />
        <span>We could not load this just now.{' '}
          <button type="button" className="font-medium underline" onClick={() => query.refetch()}>Try again</button>
        </span>
      </div>
    )
  }
  return <>{children}</>
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-base p-8 text-center">
      <p className="font-medium text-body">{title}</p>
      <p className="text-sm text-muted mt-1">{body}</p>
    </div>
  )
}

// ─── Results ──────────────────────────────────────────────

function TermCard({ t }: { t: ParentResultsTerm }) {
  const heading = termLabel(t.academicYear, t.term)
  if (t.withheld) {
    return (
      <article className={CARD} aria-label={heading}>
        <h3 className="font-heading font-semibold text-body">{heading}</h3>
        <div className="mt-2 flex items-start gap-2 rounded-xl bg-page p-3 text-sm text-body" role="note">
          <Lock className="w-4 h-4 mt-0.5 shrink-0 text-muted" aria-hidden />
          <p>These results are not available to view right now. This usually means school fees are outstanding. Please contact the school office.</p>
        </div>
      </article>
    )
  }
  const grade = gradeText(t.grade)
  return (
    <article className={`${CARD} space-y-3`} aria-label={heading}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-heading font-semibold text-body">{heading}</h3>
        {t.passStatus !== null && <Pill tone={t.passStatus ? 'success' : 'warning'}>{t.passStatus ? 'Pass' : 'Not passed'}</Pill>}
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
        <div><dt className="text-xs text-muted">Average</dt><dd className="font-heading font-semibold text-body text-lg">{percentText(t.average)}</dd></div>
        {grade && <div><dt className="text-xs text-muted">Grade</dt><dd className="font-heading font-semibold text-body text-lg">{grade}</dd></div>}
        {t.classPosition !== null && t.classSize !== null && (
          <div><dt className="text-xs text-muted">Class position</dt><dd className="font-heading font-semibold text-body text-lg">{t.classPosition} of {t.classSize}</dd></div>
        )}
        {t.attendanceDays !== null && (
          <div><dt className="text-xs text-muted">Days at school</dt><dd className="text-body">{t.attendanceDays}{t.absentDays ? ` (${t.absentDays} absent)` : ''}</dd></div>
        )}
      </dl>

      {t.subjects.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Subject results for {heading}</caption>
            <thead>
              <tr className="text-left text-xs text-muted border-b border-base">
                <th scope="col" className="py-2 pr-3 font-medium">Subject</th>
                <th scope="col" className="py-2 pr-3 font-medium text-right">Average</th>
                <th scope="col" className="py-2 font-medium text-right">Grade</th>
              </tr>
            </thead>
            <tbody>
              {t.subjects.map((s) => (
                <tr key={s.subject} className="border-b border-base last:border-0">
                  <td className="py-2 pr-3 text-body">{s.subject}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-body">{percentText(s.average)}</td>
                  <td className="py-2 text-right text-body">{gradeText(s.grade) ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(t.teacherComment || t.headComment) && (
        <div className="space-y-2 text-sm">
          {t.teacherComment && <p><span className="text-xs text-muted block">Class teacher</span><span className="text-body">{t.teacherComment}</span></p>}
          {t.headComment && <p><span className="text-xs text-muted block">Head teacher</span><span className="text-body">{t.headComment}</span></p>}
        </div>
      )}
    </article>
  )
}

export function ResultsPanel({ linkId }: { linkId: string }) {
  const q = useChildResults(linkId, true)
  return (
    <QueryState query={q}>
      {q.data && q.data.terms.length === 0
        ? <Empty title="No results yet" body="Term results will appear here once the school has published them." />
        : <div className="space-y-3">{q.data?.terms.map((t) => <TermCard key={`${t.academicYear}-${t.term}`} t={t} />)}</div>}
    </QueryState>
  )
}

// ─── Fees ─────────────────────────────────────────────────

export function FeesPanel({ linkId }: { linkId: string }) {
  const q = useChildFees(linkId, true)
  const d = q.data
  return (
    <QueryState query={q}>
      {d && (
        <div className="space-y-4">
          <section className={CARD} aria-label="Balance">
            <p className="text-xs text-muted">Outstanding balance</p>
            <p className="font-heading font-bold text-3xl text-body mt-1">{formatMwk(d.totalOutstanding)}</p>
            <p className="text-sm text-muted mt-1">{d.totalOutstanding > 0 ? 'Across all unpaid invoices below.' : 'Nothing is owed. Thank you.'}</p>
          </section>

          <section aria-label="Invoices" className="space-y-2">
            <h3 className="font-heading font-semibold text-body">Invoices</h3>
            {d.invoices.length === 0 ? <Empty title="No invoices" body="The school has not issued any invoices yet." /> : (
              <ul className="space-y-2">
                {d.invoices.map((i, idx) => (
                  <li key={`${i.invoiceNumber ?? 'inv'}-${idx}`} className={`${CARD} space-y-2`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-body">{termLabel(i.academicYear, i.term)}</span>
                      {i.status && <Pill tone={invoiceStatusTone(i.status)}>{invoiceStatusLabel(i.status)}</Pill>}
                    </div>
                    <dl className="grid grid-cols-3 gap-2 text-sm">
                      <div><dt className="text-xs text-muted">Charged</dt><dd className="text-body tabular-nums">{formatMwk(i.totalAmount)}</dd></div>
                      <div><dt className="text-xs text-muted">Paid</dt><dd className="text-body tabular-nums">{formatMwk(i.paidAmount)}</dd></div>
                      <div><dt className="text-xs text-muted">Balance</dt><dd className="text-body tabular-nums font-medium">{formatMwk(i.balance)}</dd></div>
                    </dl>
                    <p className="text-xs text-muted">
                      {i.invoiceNumber ? `Invoice ${i.invoiceNumber}` : ''}{i.invoiceNumber && i.dueDate ? ' · ' : ''}{i.dueDate ? `due ${formatDay(i.dueDate)}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Payments" className="space-y-2">
            <h3 className="font-heading font-semibold text-body">Payments received</h3>
            {d.payments.length === 0 ? <p className="text-sm text-muted">No payments recorded yet.</p> : (
              <ul className="divide-y divide-[var(--border-base,rgba(0,0,0,0.08))] rounded-2xl border border-base bg-surface">
                {d.payments.map((p, idx) => (
                  <li key={`${p.paidAt ?? 'p'}-${idx}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <span className="text-body">{formatDay(p.paidAt)}<span className="text-muted">{p.method ? ` · ${paymentMethodLabel(p.method)}` : ''}</span></span>
                    <span className="font-medium tabular-nums text-body">{formatMwk(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </QueryState>
  )
}

// ─── Attendance ───────────────────────────────────────────

export function AttendancePanel({ linkId }: { linkId: string }) {
  const q = useChildAttendance(linkId, true)
  const d = q.data
  const f = d ? attendanceFigures(d.summary) : null
  return (
    <QueryState query={q}>
      {d && f && (f.total === 0
        ? <Empty title="No attendance recorded yet" body="Daily attendance will appear here once the school starts recording it." />
        : (
          <div className="space-y-4">
            <section className={CARD} aria-label="Attendance summary">
              <p className="text-xs text-muted">Attended (present or late)</p>
              <p className="font-heading font-bold text-3xl text-body mt-1">{percentText(f.attendedPercent)}</p>
              <p className="text-sm text-muted mt-1">Over the last {f.total} recorded school day{f.total === 1 ? '' : 's'}.</p>
              <dl className="grid grid-cols-3 gap-2 mt-3 text-sm">
                <div><dt className="text-xs text-muted">Present</dt><dd className="text-body font-medium">{f.present}</dd></div>
                <div><dt className="text-xs text-muted">Late</dt><dd className="text-body font-medium">{f.late}</dd></div>
                <div><dt className="text-xs text-muted">Absent</dt><dd className="text-body font-medium">{f.absent}</dd></div>
              </dl>
            </section>

            <section aria-label="Recent days" className="space-y-2">
              <h3 className="font-heading font-semibold text-body">Recent days</h3>
              <ul className="divide-y divide-[var(--border-base,rgba(0,0,0,0.08))] rounded-2xl border border-base bg-surface">
                {d.recent.map((r, idx) => (
                  <li key={`${r.date ?? 'd'}-${idx}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <span className="text-body">{formatDay(r.date)}</span>
                    <Pill tone={attendanceTone(r.status)}>{attendanceLabel(r.status) || 'Unknown'}</Pill>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        ))}
    </QueryState>
  )
}
