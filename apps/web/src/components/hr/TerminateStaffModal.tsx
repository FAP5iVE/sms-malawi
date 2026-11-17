'use client'

/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/hr/TerminateStaffModal.tsx
 * [PURPOSE]: Collects the reason and date when HR ends a staff member's
 *   employment (hr.terminateStaff). Both are required: the reason feeds the
 *   staffing return and, with date of birth, tells a retirement from a
 *   resignation. Terminating does not disable the person's login: that is a
 *   separate step in User Management.
 * [DEPENDS ON]: hooks/useHR useTerminateStaff, shared TerminateStaffSchema
 */

import { useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { Modal } from '@/components/shared/Modal'
import { useTerminateStaff } from '@/hooks/useHR'
import { TerminateStaffSchema } from '@shared/schemas/hr'
import { STAFF_EXIT_REASONS, STAFF_EXIT_REASON_LABELS } from '@shared/constants/malawi'

const fieldCls =
  'w-full min-h-[44px] border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-teal/25 focus:border-brand-teal'
const labelCls = 'block text-xs font-heading font-semibold text-muted mb-1.5'

export function TerminateStaffModal({
  staffId,
  staffName,
  onClose,
}: {
  staffId: string
  staffName: string
  onClose: () => void
}) {
  const terminate = useTerminateStaff(staffId)
  const [exitReason, setExitReason] = useState('')
  const [exitDate, setExitDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [error, setError] = useState<string | null>(null)

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const parsed = TerminateStaffSchema.safeParse({ exitReason, exitDate })
    if (!parsed.success) {
      setError(exitReason ? (parsed.error.issues[0]?.message ?? 'Check the details.') : 'Choose the reason for leaving.')
      return
    }
    setError(null)
    terminate.mutate(parsed.data, {
      onSuccess: onClose,
      onError: (err) => setError(err instanceof Error ? err.message : 'Could not terminate this staff member.'),
    })
  }

  return (
    <Modal
      title={`Terminate ${staffName}?`}
      description="This ends their employment record. Their login stays active until it is disabled in User Management."
      onClose={onClose}
      size="m"
      busy={terminate.isPending}
      onSubmit={submit}
      bodyClassName="space-y-4"
      footer={
        <>
          <button type="button" disabled={terminate.isPending} onClick={onClose} className="min-h-[44px] px-4 rounded-xl border border-base text-sm font-semibold">Cancel</button>
          <button type="submit" disabled={terminate.isPending} className="min-h-[44px] px-4 rounded-xl bg-btn-danger text-btn-danger-fg text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-1.5">
            {terminate.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Terminate
          </button>
        </>
      }
    >
      <div>
        <label className={labelCls} htmlFor="term-reason">Reason for leaving</label>
        <select id="term-reason" className={fieldCls} value={exitReason} onChange={(e) => setExitReason(e.target.value)}>
          <option value="">Select…</option>
          {STAFF_EXIT_REASONS.map((r) => <option key={r} value={r}>{STAFF_EXIT_REASON_LABELS[r]}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls} htmlFor="term-date">Last day of service</label>
        <input
          id="term-date"
          type="date"
          className={fieldCls}
          value={exitDate}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setExitDate(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-tone-coral" role="alert">{error}</p>}
    </Modal>
  )
}
