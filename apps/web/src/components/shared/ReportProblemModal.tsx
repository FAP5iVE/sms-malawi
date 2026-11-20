/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/shared/ReportProblemModal.tsx
 * [PURPOSE]: The app-wide "Report a problem" dialog. Opened from the header
 *   user menu (desktop) and the More sheet (mobile), so EVERY signed-in role
 *   can report — including roles with no access to /monitoring, which
 *   previously had no way to report anything. Submitting requires the
 *   reporter's name / username and their employee number (staff) or student
 *   number (students); the server re-validates with the same shared schema
 *   and checks the number against the signed-in account's record.
 * [DEPENDS ON]: @/components/shared/Modal, @/hooks/useMonitoring
 *   (useSubmitFeedback), @shared/schemas/problemReport, @/store/authStore
 */
'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { CheckCircle2, Send } from 'lucide-react'
import { Modal, MODAL_BTN_PRIMARY, MODAL_BTN_SECONDARY } from '@/components/shared/Modal'
import { useSubmitFeedback } from '@/hooks/useMonitoring'
import { useAuthStore } from '@/store/authStore'
import { ProblemReportSchema, PROBLEM_REPORT_LIMITS, idLabelForRole } from '@shared/schemas/problemReport'

type FieldKey = 'name' | 'idNumber' | 'message'

const INPUT =
  'w-full rounded-xl border border-base bg-page px-3 py-2.5 text-sm text-body placeholder:text-muted ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-teal/40 min-h-11'

export function ReportProblemModal({ onClose }: { onClose: () => void }) {
  const { user, role } = useAuthStore()
  const pathname = usePathname()
  const submit = useSubmitFeedback()

  const idLabel = idLabelForRole(role)
  const [name, setName] = useState(user?.displayName ?? '')
  const [idNumber, setIdNumber] = useState('')
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setServerError(null)

    const parsed = ProblemReportSchema.safeParse({ name, idNumber, message, pageUrl: pathname ?? undefined })
    if (!parsed.success) {
      const next: Partial<Record<FieldKey, string>> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as FieldKey | undefined
        if (key && !next[key]) next[key] = issue.message
      }
      setErrors(next)
      return
    }
    setErrors({})

    submit.mutate(parsed.data, {
      onSuccess: () => setDone(true),
      onError: (err) => setServerError(err instanceof Error ? err.message : 'Could not send your report. Please try again.'),
    })
  }

  if (done) {
    return (
      <Modal
        title="Report a problem"
        onClose={onClose}
        size="sm"
        footer={<button type="button" onClick={onClose} className={MODAL_BTN_PRIMARY}>Close</button>}
      >
        <div className="flex flex-col items-center text-center py-4 gap-3">
          <CheckCircle2 className="w-10 h-10 text-status-success" aria-hidden />
          <p className="font-heading font-semibold text-body">Thank you. Your report was sent.</p>
          <p className="text-sm text-muted">The administrators can now see it, together with your name and {idLabel.toLowerCase()}.</p>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      title="Report a problem"
      description="Tell us what went wrong. Your name and number let us follow up with you."
      onClose={onClose}
      size="md"
      busy={submit.isPending}
      onSubmit={handleSubmit}
      bodyClassName="space-y-4"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={submit.isPending} className={MODAL_BTN_SECONDARY}>
            Cancel
          </button>
          <button type="submit" disabled={submit.isPending} className={MODAL_BTN_PRIMARY}>
            <Send className="w-4 h-4" aria-hidden />
            {submit.isPending ? 'Sending…' : 'Send report'}
          </button>
        </>
      }
    >
      <div>
        <label htmlFor="rp-name" className="block text-xs font-medium text-body mb-1">
          Name or username <span className="text-brand-coral" aria-hidden>*</span>
        </label>
        <input
          id="rp-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={PROBLEM_REPORT_LIMITS.nameMax}
          autoComplete="name"
          aria-required="true"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? 'rp-name-err' : undefined}
          className={INPUT}
        />
        {errors.name && <p id="rp-name-err" role="alert" className="text-xs text-brand-coral mt-1">{errors.name}</p>}
      </div>

      <div>
        <label htmlFor="rp-id" className="block text-xs font-medium text-body mb-1">
          {idLabel} <span className="text-brand-coral" aria-hidden>*</span>
        </label>
        <input
          id="rp-id"
          value={idNumber}
          onChange={(e) => setIdNumber(e.target.value)}
          maxLength={PROBLEM_REPORT_LIMITS.idMax}
          placeholder={role === 'student' ? 'Example: SMS-2025-0001' : 'Your employee number'}
          autoComplete="off"
          aria-required="true"
          aria-invalid={!!errors.idNumber}
          aria-describedby={errors.idNumber ? 'rp-id-err' : undefined}
          className={INPUT}
        />
        {errors.idNumber && <p id="rp-id-err" role="alert" className="text-xs text-brand-coral mt-1">{errors.idNumber}</p>}
      </div>

      <div>
        <label htmlFor="rp-message" className="block text-xs font-medium text-body mb-1">
          What went wrong? <span className="text-brand-coral" aria-hidden>*</span>
        </label>
        <textarea
          id="rp-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          maxLength={PROBLEM_REPORT_LIMITS.messageMax}
          placeholder="What were you trying to do, and what happened instead?"
          aria-required="true"
          aria-invalid={!!errors.message}
          aria-describedby={errors.message ? 'rp-message-err' : undefined}
          className={`${INPUT} resize-none`}
        />
        {errors.message && <p id="rp-message-err" role="alert" className="text-xs text-brand-coral mt-1">{errors.message}</p>}
      </div>

      {serverError && <p role="alert" className="text-sm text-brand-coral">{serverError}</p>}
    </Modal>
  )
}
