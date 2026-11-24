'use client'

/**
 * apps/web/src/components/exams/ManebRegistrationPanel.tsx
 *
 * [PURPOSE]: The school's own list of MANEB candidates. Candidates register with MANEB online
 *   themselves (a teacher may help), so this screen is record keeping: who is registered, with
 *   which examination number, whether the fee is paid, and who helped. It shows every student who
 *   sits the exam this year (Form 2 for JCE, Form 4 for MSCE) as Registered or Not registered.
 *   Marks entry only accepts candidates on this list, so once all marks are entered the list is
 *   closed and nobody new can be added.
 */
import { useMemo, useState } from 'react'
import { Download, Hash, Lock, LockOpen, UserPlus, Users } from 'lucide-react'
import { MALAWI_SUBJECTS } from '@shared/constants/malawi'
import { Modal, MODAL_BTN_PRIMARY, MODAL_BTN_SECONDARY, MODAL_BTN_DANGER } from '@/components/shared/Modal'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { StatusText } from '@/components/shared/StatusText'
import { Field, inputCls } from '@/components/students/StudentFormSections'
import { usePermissions } from '@/hooks/usePermissions'
import { useAuthStore } from '@/store/authStore'
import {
  useManebBoard, useRegisterManebCandidate, useBulkRegisterManeb, useUpdateManebRegistration,
  useWithdrawManeb, useImportManebNumbers, useManebListLock,
  type ManebBoardRow, type ManebExamTypeKey,
} from '@/hooks/useManebRegistration'
import { chipClass } from '@/lib/hills/chip'
import { statusWord } from '@/lib/hills/statusWord'
import { formatDate } from '@/lib/reportFormat'

type Filter = 'all' | 'registered' | 'not'

interface Props { academicYear: string; examType: ManebExamTypeKey }

const EXAM_NAME: Record<ManebExamTypeKey, string> = { JCE: 'JCE', MSCE: 'MSCE' }

export function ManebRegistrationPanel({ academicYear, examType }: Props) {
  const { can } = usePermissions()
  const role = useAuthStore((s) => s.role)
  const canManage = can('exam.manageManebRecords')
  const canReopen = role === 'admin' || role === 'high_rank'

  const { data: board, isLoading, error, refetch, isFetching } = useManebBoard(academicYear, examType)
  const bulk = useBulkRegisterManeb()
  const lock = useManebListLock()

  const [filter, setFilter] = useState<Filter>('all')
  const [className, setClassName] = useState('')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<ManebBoardRow | null>(null)
  const [withdrawing, setWithdrawing] = useState<ManebBoardRow | null>(null)
  const [showNumbers, setShowNumbers] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const classNames = useMemo(
    () => Array.from(new Set((board?.rows ?? []).map((r) => r.className).filter(Boolean))).sort(),
    [board],
  )
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (board?.rows ?? []).filter((r) => {
      if (filter === 'registered' && !r.registered) return false
      if (filter === 'not' && r.registered) return false
      if (className && r.className !== className) return false
      if (q && !`${r.name} ${r.registrationNo} ${r.candidateNo ?? ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [board, filter, className, query])

  const registerable = shown.filter((r) => !r.registered)
  const locked = board?.locked ?? false

  function registerShown() {
    setNotice(null)
    bulk.mutate(
      { studentIds: registerable.map((r) => r.studentId), examType, academicYear, registeredVia: 'SCHOOL' },
      {
        onSuccess: (res) => setNotice(
          `Registered ${res.registered} ${res.registered === 1 ? 'student' : 'students'}` +
          (res.skipped.length ? `. ${res.skipped.length} could not be registered: ${res.skipped[0]?.reason}` : '.'),
        ),
      },
    )
  }

  function exportCsv() {
    const head = ['Registration number', 'Name', 'Class', 'Status', 'Examination number', 'Centre number', 'Invoice number', 'Fee paid', 'Registered by', 'Subjects']
    const lines = (board?.rows ?? []).map((r) => [
      r.registrationNo, r.name, r.className,
      r.registered ? 'Registered' : r.withdrawn ? 'Withdrawn' : 'Not registered',
      r.candidateNo ?? '', r.centerNo ?? board?.centreNumber ?? '', r.invoiceNo ?? '',
      r.registered ? (r.feePaid ? 'Yes' : 'No') : '',
      r.registeredVia === 'SELF' ? 'Candidate' : r.registeredVia === 'SCHOOL' ? 'School' : '',
      r.subjects.join('; '),
    ])
    const csv = [head, ...lines].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${EXAM_NAME[examType]}-candidates-${academicYear.replace('/', '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) return <div className="skeleton h-40 rounded-xl" aria-hidden />
  if (error || !board) {
    return (
      <div role="alert" className="app-tint rounded-xl px-4 py-4 space-y-3">
        <p className="text-sm font-heading font-semibold text-body">The candidate list could not be loaded.</p>
        <p className="text-sm text-muted">
          {error instanceof Error && error.message ? `${error.message}. ` : ''}
          If this keeps happening after you try again, the latest database update for MANEB registration may not have been applied yet.
          Ask the person who looks after the system to apply it.
        </p>
        <button type="button" className={MODAL_BTN_SECONDARY} disabled={isFetching} onClick={() => { void refetch() }}>
          {isFetching ? 'Trying…' : 'Try again'}
        </button>
      </div>
    )
  }

  const t = board.totals
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm text-body">
          <span className="font-heading font-semibold text-brand-navy">{t.registered} of {t.students}</span>{' '}
          Form {board.form} {t.students === 1 ? 'student is' : 'students are'} registered for {EXAM_NAME[examType]} {academicYear}.
        </p>
        <p className="text-xs text-muted flex flex-wrap gap-x-4 gap-y-1">
          <span>{t.notRegistered} not registered</span>
          <span>{t.withNumber} with an examination number</span>
          <span>{t.feePaid} fees paid</span>
          <span>{t.withResults} with marks entered</span>
          {board.deadline && <span>Registration deadline {formatDate(board.deadline)}</span>}
          {board.centreNumber && <span>Centre number {board.centreNumber}</span>}
        </p>
        <p className="text-xs text-muted">
          Candidates register with MANEB online themselves. This list is the school&apos;s own record, and marks can only be entered for candidates on it.
        </p>
      </div>

      {locked ? (
        <div className="flex flex-wrap items-center justify-between gap-3 app-tint rounded-xl px-4 py-3">
          <p className="text-sm text-body flex items-center gap-2">
            <Lock className="w-4 h-4 shrink-0" aria-hidden />
            List closed{board.lockedAt ? ` on ${formatDate(board.lockedAt)}` : ''}. Nobody new can be registered.
          </p>
          {canReopen && (
            <button type="button" className={MODAL_BTN_SECONDARY} disabled={lock.reopen.isPending}
              onClick={() => lock.reopen.mutate({ academicYear, examType })}>
              <LockOpen className="w-4 h-4 mr-1.5" aria-hidden /> Reopen list
            </button>
          )}
        </div>
      ) : canManage && t.registered > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 app-tint rounded-xl px-4 py-3">
          <p className="text-sm text-body">The list closes by itself when every registered candidate has their marks entered. You can also close it sooner so nobody new is added.</p>
          <button type="button" className={MODAL_BTN_SECONDARY} onClick={() => setConfirmClose(true)}>
            <Lock className="w-4 h-4 mr-1.5" aria-hidden /> Close list
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {([['all', 'Everyone'], ['registered', 'Registered'], ['not', 'Not registered']] as const).map(([k, label]) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={chipClass(filter === k)}>{label}</button>
        ))}
        {classNames.length > 1 && (
          <select aria-label="Filter by class" value={className} onChange={(e) => setClassName(e.target.value)} className={`${inputCls} !w-auto`}>
            <option value="">All classes</option>
            {classNames.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <input
          type="search" aria-label="Search candidates" placeholder="Search name or number"
          value={query} onChange={(e) => setQuery(e.target.value)} className={`${inputCls} !w-auto min-w-56`}
        />
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {canManage && !locked && registerable.length > 0 && (
            <button type="button" className={MODAL_BTN_PRIMARY} onClick={registerShown} disabled={bulk.isPending}>
              <Users className="w-4 h-4 mr-1.5" aria-hidden />
              {bulk.isPending ? 'Registering…' : `Register ${registerable.length} shown`}
            </button>
          )}
          {canManage && t.registered > 0 && (
            <button type="button" className={MODAL_BTN_SECONDARY} onClick={() => setShowNumbers(true)}>
              <Hash className="w-4 h-4 mr-1.5" aria-hidden /> Paste examination numbers
            </button>
          )}
          <button type="button" className={MODAL_BTN_SECONDARY} onClick={exportCsv}>
            <Download className="w-4 h-4 mr-1.5" aria-hidden /> Export list
          </button>
        </span>
      </div>
      {notice && <p role="status" className="text-sm text-body">{notice}</p>}

      {shown.length === 0 ? (
        <p className="text-center py-12 text-muted text-sm">
          {t.students === 0
            ? `No Form ${board.form} students for ${academicYear}. ${EXAM_NAME[examType]} is written by Form ${board.form} students.`
            : 'Nobody matches this filter.'}
        </p>
      ) : (
        <div className="table-scroll">
          <table className="w-full text-sm border-collapse min-w-160">
            <thead>
              <tr className="bg-page border-b border-base">
                {['Student', 'Class', 'Status', 'Examination number', 'Fee', 'Registered by', ''].map((h) => (
                  <th key={h || 'actions'} className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-base">
              {shown.map((r) => (
                <tr key={r.studentId} className="hover:bg-page">
                  <td className="px-4 py-3">
                    <span className="font-medium text-body">{r.name}</span>
                    <span className="block text-xs text-muted font-mono">{r.registrationNo}</span>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {r.className}
                    {r.studentStatus !== 'ACTIVE' && <span className="block text-xs">{statusWord(r.studentStatus)}</span>}
                  </td>
                  <td className="px-4 py-3">
                    {r.registered
                      ? <StatusText tone="success">Registered</StatusText>
                      : r.withdrawn
                        ? <StatusText tone="neutral">Withdrawn</StatusText>
                        : <StatusText tone="warning">Not registered</StatusText>}
                    {r.registered && (r.hasResult
                      ? <span className="block text-xs text-muted mt-0.5">Results entered</span>
                      : r.studentStatus === 'AWAITING_MANEB_RESULTS' && <span className="block text-xs text-muted mt-0.5">Results awaited</span>)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{r.registered ? (r.candidateNo ?? <span className="text-muted font-sans">Not issued yet</span>) : ''}</td>
                  <td className="px-4 py-3 text-xs">{r.registered ? (r.feePaid ? 'Paid' : 'Not paid') : ''}</td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {r.registered ? (r.registeredVia === 'SELF' ? 'The candidate' : 'The school') : ''}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {canManage && !r.registered && !locked && (
                      <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold text-tone-teal app-action min-h-11" onClick={() => setEditing(r)}>
                        <UserPlus className="w-3.5 h-3.5" aria-hidden /> Register
                      </button>
                    )}
                    {canManage && r.registered && (
                      <>
                        <button type="button" className="text-sm font-semibold text-tone-teal app-action min-h-11 px-2" onClick={() => setEditing(r)}>Edit</button>
                        {!r.hasResult && (
                          <button type="button" className="text-sm text-muted hover:text-tone-coral min-h-11 px-2" onClick={() => setWithdrawing(r)}>Withdraw</button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <RegistrationDialog row={editing} examType={examType} academicYear={academicYear} onClose={() => setEditing(null)} />
      )}
      {withdrawing && (
        <WithdrawDialog row={withdrawing} onClose={() => setWithdrawing(null)} />
      )}
      {showNumbers && (
        <NumbersDialog examType={examType} academicYear={academicYear} onClose={() => setShowNumbers(false)} />
      )}
      <ConfirmDialog
        open={confirmClose}
        title={`Close the ${EXAM_NAME[examType]} list?`}
        description={`After this nobody new can be registered for ${EXAM_NAME[examType]} ${academicYear}. Details can still be edited, and an administrator can reopen the list.`}
        confirmLabel="Close list"
        confirmingLabel="Closing…"
        confirming={lock.close.isPending}
        onConfirm={() => lock.close.mutate({ academicYear, examType }, { onSuccess: () => setConfirmClose(false) })}
        onCancel={() => setConfirmClose(false)}
      />
    </div>
  )
}

// ─── Register or edit one candidate ──────────────────────────────────────────

function RegistrationDialog({ row, examType, academicYear, onClose }: {
  row: ManebBoardRow; examType: ManebExamTypeKey; academicYear: string; onClose: () => void
}) {
  const register = useRegisterManebCandidate()
  const update = useUpdateManebRegistration()
  const isEdit = row.registered && row.registrationId !== null
  const [via, setVia] = useState<'SELF' | 'SCHOOL'>(row.registeredVia ?? 'SELF')
  const [candidateNo, setCandidateNo] = useState(row.candidateNo ?? '')
  const [centerNo, setCenterNo] = useState(row.centerNo ?? '')
  const [invoiceNo, setInvoiceNo] = useState(row.invoiceNo ?? '')
  const [feePaid, setFeePaid] = useState(row.feePaid)
  const [subjects, setSubjects] = useState<string[]>(row.subjects)
  const [notes, setNotes] = useState(row.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const busy = register.isPending || update.isPending

  function toggle(subject: string) {
    setSubjects((prev) => (prev.includes(subject) ? prev.filter((s) => s !== subject) : [...prev, subject]))
  }

  function submit() {
    setError(null)
    const fields = {
      registeredVia: via, candidateNo: candidateNo.trim(), centerNo: centerNo.trim(),
      invoiceNo: invoiceNo.trim(), feePaid, subjects, notes: notes.trim(),
    }
    const opts = {
      onSuccess: () => onClose(),
      onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Could not save.'),
    }
    if (isEdit && row.registrationId) update.mutate({ id: row.registrationId, patch: fields }, opts)
    else register.mutate({ studentId: row.studentId, examType, academicYear, ...fields }, opts)
  }

  return (
    <Modal
      title={isEdit ? `Edit ${row.name}` : `Register ${row.name}`}
      description={`${EXAM_NAME[examType]} ${academicYear} · ${row.className}`}
      onClose={onClose} busy={busy} size="l"
      onSubmit={(e) => { e.preventDefault(); submit() }}
      footer={
        <>
          <button type="button" className={MODAL_BTN_SECONDARY} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className={MODAL_BTN_PRIMARY} disabled={busy}>{busy ? 'Saving…' : isEdit ? 'Save changes' : 'Register candidate'}</button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Registered by">
          <select className={inputCls} value={via} onChange={(e) => setVia(e.target.value as 'SELF' | 'SCHOOL')}>
            <option value="SELF">The candidate registered themselves</option>
            <option value="SCHOOL">A teacher registered or helped</option>
          </select>
        </Field>
        <Field label="Examination number">
          <input className={inputCls} value={candidateNo} onChange={(e) => setCandidateNo(e.target.value)} placeholder="Add it when MANEB issues it" />
        </Field>
        <Field label="Invoice or payment number">
          <input className={inputCls} value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
        </Field>
        <Field label="Centre number">
          <input className={inputCls} value={centerNo} onChange={(e) => setCenterNo(e.target.value)} placeholder="Leave blank to use the school centre number" />
        </Field>
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm text-body min-h-11">
        <input type="checkbox" checked={feePaid} onChange={(e) => setFeePaid(e.target.checked)} className="accent-brand-navy w-4 h-4" />
        The MANEB fee is paid
      </label>
      <fieldset className="mt-3">
        <legend className="text-sm text-body mb-2">Subjects entered</legend>
        <div className="flex flex-wrap gap-2">
          {MALAWI_SUBJECTS.map((s) => (
            <button key={s} type="button" aria-pressed={subjects.includes(s)} onClick={() => toggle(s)} className={chipClass(subjects.includes(s))}>{s}</button>
          ))}
        </div>
      </fieldset>
      <Field label="Notes" className="mt-4">
        <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
      </Field>
      {error && <p role="alert" className="mt-3 text-sm text-tone-coral">{error}</p>}
    </Modal>
  )
}

// ─── Withdraw ────────────────────────────────────────────────────────────────

function WithdrawDialog({ row, onClose }: { row: ManebBoardRow; onClose: () => void }) {
  const withdraw = useWithdrawManeb()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  return (
    <Modal
      title={`Withdraw ${row.name}`}
      description="They will show as withdrawn and cannot have marks entered. You can register them again later."
      onClose={onClose} busy={withdraw.isPending} size="m"
      onSubmit={(e) => {
        e.preventDefault()
        setError(null)
        if (!row.registrationId) return
        withdraw.mutate({ id: row.registrationId, reason }, {
          onSuccess: onClose,
          onError: (err) => setError(err instanceof Error ? err.message : 'Could not withdraw.'),
        })
      }}
      footer={
        <>
          <button type="button" className={MODAL_BTN_SECONDARY} onClick={onClose} disabled={withdraw.isPending}>Cancel</button>
          <button type="submit" className={MODAL_BTN_DANGER} disabled={withdraw.isPending || reason.trim().length < 3}>
            {withdraw.isPending ? 'Withdrawing…' : 'Withdraw candidate'}
          </button>
        </>
      }
    >
      <Field label="Reason" required>
        <textarea className={inputCls} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
      </Field>
      {error && <p role="alert" className="mt-3 text-sm text-tone-coral">{error}</p>}
    </Modal>
  )
}

// ─── Paste examination numbers ───────────────────────────────────────────────

/** One candidate per line: the school registration number, then the examination number. */
export function parseNumberLines(text: string): Array<{ registrationNo: string; candidateNo: string }> {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/[\t,;]+|\s{2,}|\s+/).filter(Boolean))
    .filter((parts) => parts.length >= 2)
    .map((parts) => ({ registrationNo: parts[0]!, candidateNo: parts.slice(1).join('') }))
}

function NumbersDialog({ examType, academicYear, onClose }: { examType: ManebExamTypeKey; academicYear: string; onClose: () => void }) {
  const importNumbers = useImportManebNumbers()
  const [text, setText] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const rows = useMemo(() => parseNumberLines(text), [text])
  return (
    <Modal
      title="Paste examination numbers"
      description="One candidate per line: the school registration number, then the examination number MANEB issued."
      onClose={onClose} busy={importNumbers.isPending} size="m"
      onSubmit={(e) => {
        e.preventDefault()
        setResult(null)
        importNumbers.mutate({ academicYear, examType, rows }, {
          onSuccess: (res) => {
            if (res.errors.length === 0) onClose()
            else setResult(`Saved ${res.updated}. ${res.errors.length} not saved: ${res.errors.map((x) => `${x.registrationNo} (${x.error})`).slice(0, 5).join('; ')}`)
          },
        })
      }}
      footer={
        <>
          <button type="button" className={MODAL_BTN_SECONDARY} onClick={onClose} disabled={importNumbers.isPending}>Cancel</button>
          <button type="submit" className={MODAL_BTN_PRIMARY} disabled={importNumbers.isPending || rows.length === 0}>
            {importNumbers.isPending ? 'Saving…' : `Save ${rows.length} ${rows.length === 1 ? 'number' : 'numbers'}`}
          </button>
        </>
      }
    >
      <textarea
        className={`${inputCls} font-mono`} rows={8} value={text} onChange={(e) => setText(e.target.value)}
        placeholder={'SMS-2026-0001  M1042/001\nSMS-2026-0002  M1042/002'} aria-label="Registration numbers and examination numbers"
      />
      {result && <p role="status" className="mt-3 text-sm text-body">{result}</p>}
    </Modal>
  )
}
