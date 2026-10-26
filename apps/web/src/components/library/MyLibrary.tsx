'use client'

/**
 * apps/web/src/components/library/MyLibrary.tsx
 *
 * What a person who has NO library-desk permissions (every student, teacher, finance,
 * HR … — anyone who is not library staff or a headteacher) sees on the Library page:
 *
 *   <MyBorrowingsPanel>        the books THEY have borrowed — now and in the past — with
 *                              due dates, what came back damaged or lost, and any late
 *                              fee building up or already charged.
 *   <FineWaiverRequestPanel>   the fines THEY owe (late, damaged and lost) so a waiver is
 *                              requested by picking a fine, not by typing a fine id.
 *
 * Both read GET /library/my/* — scoped on the server to the signed-in person — and are
 * styled like the rest of the Library page (flat lists / tables on the module panel).
 */

import { useState } from 'react'
import { formatMWK } from '@shared/constants/malawi'
import type { ApiLibraryFineKind, ApiMyBorrowing, ApiMyFine } from '@shared/types/api'
import { useCreateFineWaiver, useMyBorrowings, useMyFines } from '@/hooks/useLibrary'

const DAY_MS = 86_400_000
const DUE_SOON_DAYS = 3

export const FINE_KIND_LABEL: Record<ApiLibraryFineKind, string> = {
  LATE: 'Late return',
  DAMAGED: 'Damaged book',
  LOST: 'Lost book',
  OTHER: 'Other',
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

// ─── My borrowings ──────────────────────────────────────────────────────────

type DisplayStatus = 'OVERDUE' | 'DUE_SOON' | 'ON_LOAN' | 'RETURNED' | 'RETURNED_DAMAGED' | 'LOST'

function displayStatus(b: ApiMyBorrowing): DisplayStatus {
  if (b.status === 'LOST') return 'LOST'
  if (b.status === 'RETURNED') return b.condition === 'DAMAGED' ? 'RETURNED_DAMAGED' : 'RETURNED'
  if (b.status === 'OVERDUE') return 'OVERDUE'
  const left = new Date(b.dueDate).getTime() - Date.now()
  return left <= DUE_SOON_DAYS * DAY_MS ? 'DUE_SOON' : 'ON_LOAN'
}

const STATUS_LABEL: Record<DisplayStatus, string> = {
  OVERDUE: 'Overdue',
  DUE_SOON: 'Due soon',
  ON_LOAN: 'On loan',
  RETURNED: 'Returned',
  RETURNED_DAMAGED: 'Returned damaged',
  LOST: 'Lost',
}

const STATUS_TONE: Record<DisplayStatus, string> = {
  OVERDUE: 'text-status-danger',
  DUE_SOON: 'text-status-warning',
  ON_LOAN: 'text-status-success',
  RETURNED: 'text-muted',
  RETURNED_DAMAGED: 'text-status-warning',
  LOST: 'text-status-danger',
}

/** The due / returned line under a loan. */
function whenLabel(b: ApiMyBorrowing): string {
  if (b.returnedAt) return `${b.status === 'LOST' ? 'Recorded lost' : 'Returned'} ${fmtDate(b.returnedAt)}`
  if (b.status === 'OVERDUE') return `Due ${fmtDate(b.dueDate)} · ${b.daysOverdue} day${b.daysOverdue === 1 ? '' : 's'} overdue`
  const days = Math.ceil((new Date(b.dueDate).getTime() - Date.now()) / DAY_MS)
  return `Due ${fmtDate(b.dueDate)}${days >= 0 ? ` · ${days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}` : ''}`
}

/** The charges cell: a late fee still building up, or what was charged when it came back. */
function Charges({ b }: { b: ApiMyBorrowing }) {
  if (b.accruedLateFee > 0) {
    return (
      <span className="text-status-danger">
        {formatMWK(b.accruedLateFee)} so far <span className="text-muted">· charged when you return it</span>
      </span>
    )
  }
  if (b.chargedTotal > 0) {
    return (
      <span className="text-body">
        {formatMWK(b.chargedTotal)} charged
        {b.chargedPending > 0 && b.chargedPending < b.chargedTotal ? <span className="text-muted"> · {formatMWK(b.chargedPending)} to pay</span> : null}
        {b.chargedPending === 0 ? <span className="text-muted"> · settled</span> : null}
      </span>
    )
  }
  return <span className="text-muted">—</span>
}

type LoanFilter = 'current' | 'past' | 'all'

export function MyBorrowingsPanel() {
  const { data, isLoading, isError, refetch } = useMyBorrowings()
  const [filter, setFilter] = useState<LoanFilter>('current')

  const loans = data?.loans ?? []
  const isOpen = (b: ApiMyBorrowing) => b.returnedAt === null && b.status !== 'LOST'
  const shown = loans.filter((b) => (filter === 'all' ? true : filter === 'current' ? isOpen(b) : !isOpen(b)))
  const accruing = loans.reduce((sum, b) => sum + b.accruedLateFee, 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-heading font-semibold text-sm text-body">My borrowings</h3>
          <p className="text-xs text-muted">
            Books you have borrowed from the library
            {data ? ` · a late book costs ${formatMWK(data.finePerDay)} for each full day it is overdue, added when you return it` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-page rounded-xl p-1">
          {([['current', 'On loan'], ['past', 'Past'], ['all', 'All']] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${filter === id ? 'bg-brand-deep text-white' : 'text-muted hover:text-body'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {accruing > 0 && (
        <p role="note" className="text-xs rounded-lg px-3 py-2 bg-brand-coral/10 border border-brand-coral/25 text-brand-coral">
          {formatMWK(accruing)} in late fees is building up on books you still have. Return them to stop it growing.
        </p>
      )}

      {isLoading ? (
        <div className="space-y-2" role="status" aria-label="My borrowings — loading">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton h-12 w-full rounded-lg" aria-hidden />)}
        </div>
      ) : isError ? (
        <div role="alert" className="text-sm text-muted">
          Your borrowings could not be loaded.{' '}
          <button type="button" onClick={() => void refetch()} className="font-semibold text-brand-teal underline min-h-11">Retry</button>
        </div>
      ) : shown.length === 0 ? (
        <p className="text-center py-10 text-muted text-sm">
          {loans.length === 0 ? 'You have not borrowed any books yet.' : filter === 'current' ? 'You have no books out right now.' : 'No past borrowings.'}
        </p>
      ) : (
        <>
          {/* Mobile list */}
          <ul className="divide-y divide-base md:hidden">
            {shown.map((b) => {
              const st = displayStatus(b)
              return (
                <li key={b.id} className="py-3 space-y-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-heading font-semibold text-sm text-body">{b.bookTitle}</p>
                    <span className={`text-xs font-semibold shrink-0 ${STATUS_TONE[st]}`}>{STATUS_LABEL[st]}</span>
                  </div>
                  <p className="text-xs text-muted">{b.author} · borrowed {fmtDate(b.issuedAt)}</p>
                  <p className={`text-xs ${st === 'OVERDUE' ? 'text-brand-coral' : 'text-muted'}`}>{whenLabel(b)}</p>
                  <p className="text-xs"><Charges b={b} /></p>
                </li>
              )
            })}
          </ul>

          {/* Desktop table */}
          <table className="w-full text-sm border-collapse hidden md:table">
            <thead>
              <tr className="bg-page border-b border-base">
                {['Book', 'Borrowed', 'Due / Returned', 'Status', 'Late fee & charges'].map((h) => (
                  <th key={h} scope="col" className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-base">
              {shown.map((b) => {
                const st = displayStatus(b)
                return (
                  <tr key={b.id} className="hover:bg-page">
                    <td className="px-4 py-3">
                      <p className="text-body font-medium">{b.bookTitle}</p>
                      <p className="text-xs text-muted">{b.author}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{fmtDate(b.issuedAt)}</td>
                    <td className={`px-4 py-3 text-xs ${st === 'OVERDUE' ? 'text-brand-coral' : 'text-muted'}`}>{whenLabel(b)}</td>
                    <td className="px-4 py-3"><span className={`text-xs font-semibold ${STATUS_TONE[st]}`}>{STATUS_LABEL[st]}</span></td>
                    <td className="px-4 py-3 text-xs"><Charges b={b} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

// ─── My fines → request a waiver ────────────────────────────────────────────

const FINE_STATUS_LABEL: Record<ApiMyFine['status'], string> = { PENDING: 'To pay', PAID: 'Paid', WAIVED: 'Waived' }
const FINE_STATUS_TONE: Record<ApiMyFine['status'], string> = {
  PENDING: 'text-status-warning',
  PAID: 'text-status-success',
  WAIVED: 'text-muted',
}

function WaiverState({ fine }: { fine: ApiMyFine }) {
  const w = fine.waiver
  if (!w) return null
  if (w.status === 'PENDING') return <span className="text-xs font-semibold text-status-warning">Waiver requested — waiting for review</span>
  if (w.status === 'APPROVED') return <span className="text-xs font-semibold text-status-success">Waiver approved</span>
  return (
    <span className="text-xs text-brand-coral">
      <span className="font-semibold">Waiver declined</span>{w.reviewNotes ? ` — ${w.reviewNotes}` : ''}
    </span>
  )
}

export function FineWaiverRequestPanel() {
  const { data: fines = [], isLoading, isError, refetch } = useMyFines()
  const createWaiver = useCreateFineWaiver()
  const [openFineId, setOpenFineId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  // A fine can be sent for review while it is unpaid and has no request waiting.
  const canRequest = (f: ApiMyFine) => f.status === 'PENDING' && f.waiver?.status !== 'PENDING'

  function submit(fine: ApiMyFine) {
    const text = reason.trim()
    if (!text) return
    setMessage(null)
    createWaiver.mutate({ fineId: fine.id, reason: text }, {
      onSuccess: () => {
        setOpenFineId(null)
        setReason('')
        setMessage('Waiver request sent. Library staff will review it.')
      },
    })
  }

  const owed = fines.filter((f) => f.status === 'PENDING').reduce((sum, f) => sum + f.amount, 0)

  return (
    <div className="space-y-3 pb-4 border-b border-base">
      <div>
        <h3 className="font-heading font-semibold text-sm text-body">Request a Fine Waiver</h3>
        <p className="text-xs text-muted">
          These are the library fines charged to you, including damaged and lost books.
          Choose the one you would like reviewed and tell us why.
          {owed > 0 ? ` You currently owe ${formatMWK(owed)}.` : ''}
        </p>
      </div>

      {message && <p role="status" className="text-sm text-brand-teal">{message}</p>}

      {isLoading ? (
        <div className="space-y-2" role="status" aria-label="My fines — loading">
          {[1, 2].map((i) => <div key={i} className="skeleton h-14 w-full rounded-lg" aria-hidden />)}
        </div>
      ) : isError ? (
        <div role="alert" className="text-sm text-muted">
          Your fines could not be loaded.{' '}
          <button type="button" onClick={() => void refetch()} className="font-semibold text-brand-teal underline min-h-11">Retry</button>
        </div>
      ) : fines.length === 0 ? (
        <p className="text-sm text-muted py-4">You have no library fines.</p>
      ) : (
        <ul className="divide-y divide-base">
          {fines.map((f) => {
            const open = openFineId === f.id
            return (
              <li key={f.id} className="py-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-body">
                      {f.bookTitle}
                      <span className="ml-2 text-xs font-semibold text-muted">{FINE_KIND_LABEL[f.kind]}</span>
                    </p>
                    <p className="text-xs text-muted">{f.reason} · {fmtDate(f.createdAt)}</p>
                    <WaiverState fine={f} />
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-body">{formatMWK(f.amount)}</p>
                    <p className={`text-xs font-semibold ${FINE_STATUS_TONE[f.status]}`}>{FINE_STATUS_LABEL[f.status]}</p>
                    {canRequest(f) && !open && (
                      <button
                        type="button"
                        onClick={() => { setOpenFineId(f.id); setReason(''); setMessage(null); createWaiver.reset() }}
                        className="mt-1 text-xs font-semibold text-brand-teal underline min-h-11"
                      >
                        {f.waiver?.status === 'REJECTED' ? 'Ask again' : 'Request waiver'}
                      </button>
                    )}
                  </div>
                </div>

                {open && (
                  <div className="space-y-2">
                    <label htmlFor={`waiver-reason-${f.id}`} className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider">
                      Why should this fine be waived?
                    </label>
                    <textarea
                      id={`waiver-reason-${f.id}`}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={2}
                      placeholder="Explain the circumstance (e.g. financial hardship, verified flood damage, medical leave)…"
                      className="w-full border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
                    />
                    {createWaiver.error && (
                      <p role="alert" className="text-sm text-brand-coral">
                        {createWaiver.error instanceof Error ? createWaiver.error.message : 'Something went wrong.'}
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => submit(f)}
                        disabled={createWaiver.isPending || !reason.trim()}
                        className="min-h-11 px-5 rounded-xl text-sm font-heading font-semibold bg-brand-deep text-white hover:brightness-110 transition-colors disabled:opacity-60"
                      >
                        {createWaiver.isPending ? 'Submitting…' : 'Submit Waiver Request'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpenFineId(null); setReason('') }}
                        className="min-h-11 px-4 rounded-xl text-sm text-muted hover:text-body"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
