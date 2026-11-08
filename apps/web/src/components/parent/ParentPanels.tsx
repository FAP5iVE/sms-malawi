/**
 * [CHANGE TYPE]: REWRITE
 * [FILE]: apps/web/src/components/parent/ParentPanels.tsx
 * [PHASE]: Guardian Portal — parent UI (T7c)
 * [PURPOSE]: The three sections a guardian can open for a child: Results, Fees, Attendance.
 *
 *   Design: these render inside the page's ModuleSurface and follow the system's flat style. No
 *   bordered boxes nested inside the surface (a box-within-a-box), sections are separated by
 *   headings and dividers, and status is shown by FONT COLOUR only, never a coloured block.
 *   Attendance is the one deliberate exception: it reproduces the student's own attendance
 *   page one-for-one (term summary tiles + month calendar) because that is the design the
 *   school chose for it, so a parent sees what their child sees.
 *
 *   Results: every released term, newest first, each with its headline figures (Average and
 *   Points-or-Grade, wording shared with the student view), subject table, and the child's
 *   released exams. An end-of-term exam opens that term's report card; any other exam opens its
 *   own detail. Release and fee rules are enforced by the server; this only displays.
 *
 *   Each panel handles the same states: loading, a refused section (the API answers 404, shown
 *   as "not available", not as a fault), and a real error with a retry.
 * [DEPENDS ON]: @/hooks/useParentPortal, @/lib/parentPortalFormat, @/components/shared/PrintableReportCard
 */
'use client'

import { useState, type ReactNode } from 'react'
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, FileText, Loader2, Lock, XCircle } from 'lucide-react'
import { ApiError } from '@/lib/api-client'
import { Modal } from '@/components/shared/Modal'
import { PrintableReportCard } from '@/components/shared/PrintableReportCard'
import {
  useChildAttendance, useChildFees, useChildReportCard, useChildResults,
  type ParentExam, type ParentResultsTerm,
} from '@/hooks/useParentPortal'
import {
  attendanceByDate, buildMonthGrid, examOpens, examTypeLabel, formatDay, formatMwk, gradeText, invoiceStatusLabel, invoiceStatusTone,
  isEndTermExam, isFutureMonth, monthLabel, paymentMethodLabel, percentText, shiftMonth, termHeadline, termLabel,
  termVerdict, type StatusTone,
} from '@/lib/parentPortalFormat'

/** Status by font colour only: the system does not use coloured blocks for status. */
const TONE_TEXT: Record<StatusTone, string> = {
  success: 'text-emerald-700 dark:text-emerald-400',
  warning: 'text-brand-amber',
  danger: 'text-brand-coral',
  neutral: 'text-muted',
}

const SECTION_TITLE = 'font-heading font-semibold text-body'
const DIVIDE_Y = 'divide-y divide-[var(--border-base,rgba(0,0,0,0.08))]'
const DIVIDE_X = 'divide-x divide-[var(--border-base,rgba(0,0,0,0.08))]'
const OUTLINE_BTN = 'inline-flex items-center gap-1.5 min-h-11 px-3.5 rounded-xl text-sm font-medium border border-base text-body hover:bg-page'

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
        <div className="flex items-start gap-3 py-4" role="status">
          <Lock className="w-5 h-5 mt-0.5 text-muted shrink-0" aria-hidden />
          <p className="text-sm text-body">This section is not available for your child right now. If you think it should be, please contact the school office.</p>
        </div>
      )
    }
    return (
      <div role="alert" className="flex items-start gap-2 py-4 text-sm text-body">
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
    <div className="py-10 text-center">
      <p className="font-medium text-body">{title}</p>
      <p className="text-sm text-muted mt-1">{body}</p>
    </div>
  )
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex-1 min-w-0 px-4 first:pl-0">
      <p className="text-xs text-muted">{label}</p>
      <p className="font-heading font-bold text-2xl text-body">{value}</p>
      {hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}
    </div>
  )
}

// ─── Results ──────────────────────────────────────────────

function ReportCardModal({ linkId, academicYear, term, onClose }: { linkId: string; academicYear: string; term: number; onClose: () => void }) {
  const q = useChildReportCard(linkId, academicYear, term, true)
  return (
    <Modal ariaLabel="Report card" onClose={onClose} size="2xl">
      {q.isLoading && <div className="flex items-center justify-center gap-2 py-16 text-muted text-sm"><Loader2 className="w-4 h-4 animate-spin" aria-hidden />Loading report card…</div>}
      {q.isError && (
        <div className="flex flex-col items-center gap-2 py-16 text-center" role="alert">
          <AlertTriangle className="w-6 h-6 text-brand-coral" aria-hidden />
          <p className="text-sm text-body">The report card is not available right now. Please contact the school office if this continues.</p>
          <button type="button" onClick={onClose} className="mt-2 text-sm text-muted hover:text-body underline">Close</button>
        </div>
      )}
      {q.data && <PrintableReportCard data={q.data} onClose={onClose} />}
    </Modal>
  )
}

function ExamModal({ exam, termHasReportCard, onClose, onOpenReportCard }: {
  exam: ParentExam; termHasReportCard: boolean; onClose: () => void; onOpenReportCard: () => void
}) {
  return (
    <Modal
      title={exam.title} size="sm" onClose={onClose}
      description={`${exam.subject}${exam.subject ? ' · ' : ''}${examTypeLabel(exam.type)}${exam.date ? ` · ${formatDay(exam.date)}` : ''}`}
      footer={<button type="button" onClick={onClose} className={OUTLINE_BTN}>Close</button>}
      bodyClassName="space-y-3"
    >
      {exam.absent ? (
        <p className="text-sm text-body">Absent for this exam. No mark was recorded.</p>
      ) : (
        <dl className={`flex ${DIVIDE_X}`}>
          <Figure label="Mark" value={exam.mark !== null ? String(exam.mark) : '—'} {...(exam.maxMark !== null ? { hint: `out of ${exam.maxMark}` } : {})} />
          <Figure label="Percentage" value={percentText(exam.percent)} />
        </dl>
      )}
      {isEndTermExam(exam.type) && termHasReportCard && (
        <button type="button" onClick={onOpenReportCard} className={OUTLINE_BTN}><FileText className="w-4 h-4" aria-hidden />View report card</button>
      )}
    </Modal>
  )
}

function TermSection({ t, first, onReportCard, onExam }: {
  t: ParentResultsTerm; first: boolean; onReportCard: () => void; onExam: (e: ParentExam) => void
}) {
  const heading = termLabel(t.academicYear, t.term)
  const headline = termHeadline(t)
  const verdict = termVerdict(t)
  return (
    <section aria-label={heading} className={`space-y-4 ${first ? '' : 'pt-6 border-t border-base'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={`${SECTION_TITLE} text-lg`}>{heading}</h3>
        {t.reportCard && (
          <button type="button" onClick={onReportCard} className={OUTLINE_BTN}><FileText className="w-4 h-4" aria-hidden />Report card</button>
        )}
      </div>

      {t.withheld ? (
        <div className="flex items-start gap-2 text-sm text-body" role="note">
          <Lock className="w-4 h-4 mt-0.5 shrink-0 text-muted" aria-hidden />
          <p>These results are not available to view right now. This usually means school fees are outstanding. Please contact the school office.</p>
        </div>
      ) : (
        <>
          {t.hasSummary && (
            <>
              <div className={`flex ${DIVIDE_X}`}>
                <Figure label="Average" value={percentText(t.average)} />
                <Figure label={headline.label} value={headline.value} hint={headline.hint} />
                {t.classPosition !== null && t.classSize !== null && <Figure label="Position" value={`${t.classPosition} of ${t.classSize}`} />}
              </div>

              {verdict && (
                <p className="text-sm" role="note">
                  <span className={`font-semibold ${verdict.passed ? TONE_TEXT.success : TONE_TEXT.warning}`}>{verdict.headline}</span>
                  <span className="text-muted"> · {verdict.detail}</span>
                </p>
              )}

              {t.gradingTrack === 'MSCE' && t.aggregateSubjects.length > 0 && (
                <p className="text-xs text-muted">Points are the sum of the six best subjects (lower is better): {t.aggregateSubjects.join(', ')}.</p>
              )}

              {t.subjects.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Subject results for {heading}</caption>
                    <thead>
                      <tr className="text-left text-xs text-muted border-b border-base">
                        <th scope="col" className="py-2 pr-3 font-medium">Subject</th>
                        <th scope="col" className="py-2 pr-3 font-medium text-right">Average</th>
                        <th scope="col" className="py-2 pr-3 font-medium text-right">Grade</th>
                        <th scope="col" className="py-2 font-medium text-right">Result</th>
                      </tr>
                    </thead>
                    <tbody className={DIVIDE_Y}>
                      {t.subjects.map((s) => (
                        <tr key={s.subject}>
                          <td className="py-2 pr-3 text-body">{s.subject}{t.aggregateSubjects.includes(s.subject) && <span className="text-xs text-muted"> · counted</span>}</td>
                          <td className="py-2 pr-3 text-right tabular-nums text-body">{percentText(s.average)}</td>
                          <td className="py-2 pr-3 text-right text-body">{gradeText(s.grade) ?? '—'}</td>
                          <td className={`py-2 text-right ${s.pass === null ? 'text-muted' : s.pass ? TONE_TEXT.success : TONE_TEXT.warning}`}>{s.pass === null ? '—' : s.pass ? 'Pass' : 'Fail'}</td>
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
            </>
          )}

          {t.exams.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted uppercase tracking-wide mb-1">Exams</h4>
              <ul className={DIVIDE_Y}>
                {t.exams.map((e) => (
                  <li key={e.id}>
                    <button type="button" onClick={() => onExam(e)} className="flex w-full min-h-14 items-center justify-between gap-3 py-2.5 text-left hover:bg-page rounded-lg -mx-2 px-2">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-body truncate">{e.title}</span>
                        <span className="block text-xs text-muted truncate">
                          {e.subject}{e.subject ? ' · ' : ''}{examTypeLabel(e.type)}{e.date ? ` · ${formatDay(e.date)}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        {e.absent
                          ? <span className="text-sm text-muted">Absent</span>
                          : <>
                              <span className="block text-sm font-semibold tabular-nums text-body">{e.mark !== null ? e.mark : '—'}{e.maxMark !== null ? <span className="font-normal text-muted"> / {e.maxMark}</span> : null}</span>
                              <span className="block text-xs tabular-nums text-muted">{percentText(e.percent)}</span>
                            </>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  )
}

export function ResultsPanel({ linkId }: { linkId: string }) {
  const q = useChildResults(linkId, true)
  const [card, setCard] = useState<{ academicYear: string; term: number } | null>(null)
  const [exam, setExam] = useState<{ exam: ParentExam; reportCard: boolean; academicYear: string; term: number } | null>(null)
  const terms = q.data?.terms ?? []

  return (
    <QueryState query={q}>
      {q.data && terms.length === 0
        ? <Empty title="No results yet" body="Results appear here once the school has released them." />
        : (
          <div className="space-y-6">
            {terms.map((t, i) => (
              <TermSection
                key={`${t.academicYear}-${t.term}`} t={t} first={i === 0}
                onReportCard={() => { if (t.academicYear && t.term !== null) setCard({ academicYear: t.academicYear, term: t.term }) }}
                onExam={(e) => {
                  if (!t.academicYear || t.term === null) return
                  // An end-of-term exam IS the term's report card; every other exam opens its own detail.
                  if (examOpens(e.type, t.reportCard) === 'reportCard') setCard({ academicYear: t.academicYear, term: t.term })
                  else setExam({ exam: e, reportCard: t.reportCard, academicYear: t.academicYear, term: t.term })
                }}
              />
            ))}
          </div>
        )}

      {card && <ReportCardModal linkId={linkId} academicYear={card.academicYear} term={card.term} onClose={() => setCard(null)} />}
      {exam && (
        <ExamModal
          exam={exam.exam} termHasReportCard={exam.reportCard} onClose={() => setExam(null)}
          onOpenReportCard={() => { setCard({ academicYear: exam.academicYear, term: exam.term }); setExam(null) }}
        />
      )}
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
        <div className="space-y-6">
          <section aria-label="Balance">
            <p className="text-xs text-muted">Outstanding balance</p>
            <p className={`font-heading font-bold text-3xl mt-1 ${d.totalOutstanding > 0 ? TONE_TEXT.warning : TONE_TEXT.success}`}>{formatMwk(d.totalOutstanding)}</p>
            <p className="text-sm text-muted mt-1">{d.totalOutstanding > 0 ? 'Across all unpaid invoices below.' : 'Nothing is owed. Thank you.'}</p>
          </section>

          <section aria-label="Invoices" className="pt-6 border-t border-base">
            <h3 className={`${SECTION_TITLE} mb-1`}>Invoices</h3>
            {d.invoices.length === 0 ? <Empty title="No invoices" body="The school has not issued any invoices yet." /> : (
              <ul className={DIVIDE_Y}>
                {d.invoices.map((i, idx) => (
                  <li key={`${i.invoiceNumber ?? 'inv'}-${idx}`} className="py-3 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-body">{termLabel(i.academicYear, i.term)}</span>
                      {i.status && <span className={`text-sm font-medium ${TONE_TEXT[invoiceStatusTone(i.status)]}`}>{invoiceStatusLabel(i.status)}</span>}
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

          <section aria-label="Payments" className="pt-6 border-t border-base">
            <h3 className={`${SECTION_TITLE} mb-1`}>Payments received</h3>
            {d.payments.length === 0 ? <p className="text-sm text-muted py-2">No payments recorded yet.</p> : (
              <ul className={DIVIDE_Y}>
                {d.payments.map((p, idx) => (
                  <li key={`${p.paidAt ?? 'p'}-${idx}`} className="flex items-center justify-between gap-3 py-3 text-sm">
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

// ─── Attendance (the student's own design, reproduced) ────

const STATUS_STYLE: Record<'PRESENT' | 'ABSENT' | 'LATE', { dot: string; bg: string; text: string }> = {
  PRESENT: { dot: 'bg-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400' },
  ABSENT:  { dot: 'bg-brand-coral', bg: 'bg-brand-coral/10', text: 'text-brand-coral' },
  LATE:    { dot: 'bg-brand-amber', bg: 'bg-brand-amber/10', text: 'text-brand-amber' },
}
const isStatus = (s: string | undefined): s is keyof typeof STATUS_STYLE => s === 'PRESENT' || s === 'ABSENT' || s === 'LATE'

export function AttendancePanel({ linkId }: { linkId: string }) {
  const [period, setPeriod] = useState<{ academicYear: string; term: number } | undefined>(undefined)
  const q = useChildAttendance(linkId, true, period)
  const now = new Date()
  const [view, setView] = useState({ year: now.getFullYear(), monthIndex: now.getMonth() })
  const d = q.data

  const grid = buildMonthGrid(view.year, view.monthIndex)
  const byDate = attendanceByDate(d?.records ?? [])
  const todayKey = now.toLocaleDateString('en-CA')
  const next = shiftMonth(view.year, view.monthIndex, 1)

  return (
    <QueryState query={q}>
      {d && (
        <div className="space-y-6">
          <div className="bg-surface rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <p className="font-heading font-semibold text-sm text-body">Term Summary</p>
              <div className="flex items-center gap-1" role="group" aria-label="Term shown">
                {[1, 2, 3].map((t) => (
                  <button
                    key={t} type="button" aria-pressed={d.period.term === t}
                    onClick={() => setPeriod({ academicYear: d.period.academicYear, term: t })}
                    className={`min-h-11 px-3 rounded-lg text-xs ${d.period.term === t ? 'font-semibold text-body bg-page' : 'text-muted hover:text-body'}`}
                  >Term {t}</button>
                ))}
                <span className="text-xs text-muted pl-2" aria-label="Period shown">{d.period.academicYear}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-page">
                <p className="text-xs text-muted mb-1">Present</p>
                <p className="text-2xl font-heading font-bold text-emerald-600 dark:text-emerald-400">{d.summary.present}</p>
              </div>
              <div className="p-3 rounded-lg bg-page">
                <p className="text-xs text-muted mb-1">Absent</p>
                <p className="text-2xl font-heading font-bold text-brand-coral">{d.summary.absent}</p>
              </div>
              <div className="p-3 rounded-lg bg-page">
                <p className="text-xs text-muted mb-1">Late</p>
                <p className="text-2xl font-heading font-bold text-brand-amber">{d.summary.late}</p>
              </div>
              <div className="p-3 rounded-lg bg-page">
                <p className="text-xs text-muted mb-1">Attendance Rate</p>
                <p className="text-2xl font-heading font-bold text-brand-navy dark:text-white">{d.summary.recorded === 0 || d.summary.attendanceRate === null ? '—' : `${d.summary.attendanceRate}%`}</p>
              </div>
            </div>
          </div>

          <div className="bg-surface rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <button
                type="button" onClick={() => setView(shiftMonth(view.year, view.monthIndex, -1))}
                aria-label="Previous month"
                className="p-2 rounded-lg hover:bg-page text-muted hover:text-body min-h-11 min-w-11 flex items-center justify-center"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden />
              </button>
              <p className="font-heading font-semibold text-body flex items-center gap-2"><CalendarDays className="w-4 h-4 text-brand-teal" aria-hidden />{monthLabel(view.year, view.monthIndex)}</p>
              <button
                type="button" onClick={() => setView(next)}
                disabled={isFutureMonth(next.year, next.monthIndex, now)}
                aria-label="Next month"
                className="p-2 rounded-lg hover:bg-page text-muted hover:text-body disabled:opacity-30 min-h-11 min-w-11 flex items-center justify-center"
              >
                <ChevronRight className="w-4 h-4" aria-hidden />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div key={day} className="text-center text-[11px] font-heading font-semibold text-muted uppercase py-1">{day}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: grid.leadingBlanks }).map((_, i) => <div key={`blank-${i}`} />)}
              {grid.days.map(({ day, key }) => {
                const status = byDate.get(key)
                const style = isStatus(status) ? STATUS_STYLE[status] : null
                return (
                  <div
                    key={key}
                    className={`aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-xs ${style ? style.bg : 'bg-page'} ${key === todayKey ? 'ring-2 ring-brand-teal' : ''}`}
                    {...(status ? { title: status.charAt(0) + status.slice(1).toLowerCase() } : {})}
                  >
                    <span className={`font-medium ${style ? style.text : 'text-muted'}`}>{day}</span>
                    {style && <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} aria-hidden />}
                  </div>
                )
              })}
            </div>

            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-base flex-wrap">
              <span className="flex items-center gap-1.5 text-xs text-muted"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" aria-hidden /> Present</span>
              <span className="flex items-center gap-1.5 text-xs text-muted"><XCircle className="w-3.5 h-3.5 text-brand-coral" aria-hidden /> Absent</span>
              <span className="flex items-center gap-1.5 text-xs text-muted"><Clock3 className="w-3.5 h-3.5 text-brand-amber" aria-hidden /> Late</span>
              <span className="flex items-center gap-1.5 text-xs text-muted"><span className="w-3.5 h-3.5 rounded bg-page border border-base inline-block" /> No record</span>
            </div>
          </div>
        </div>
      )}
    </QueryState>
  )
}
