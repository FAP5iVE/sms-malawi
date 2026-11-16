/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/guardians/GuardianLinkDialogs.tsx
 * [PHASE]: Guardian Portal — staff UI (T7a)
 * [PURPOSE]: The dialogs behind each staff decision on a guardian link: approve (with the
 *   capability choice), a reason prompt for reject / suspend / revoke / reinstate / reopen, issue
 *   an invitation (e-mail or printed slip), and edit what an approved guardian may see.
 *
 *   These collect input and call the hooks; the server remains the authority on every rule
 *   (evidence, re-verification, duplicate suspicion). A refusal comes back as a toast from the
 *   global mutation handler, so nothing here re-implements a check beyond what saves a round trip.
 * [DEPENDS ON]: @/hooks/useGuardians, @shared/constants/guardianPortal, @/lib/guardianSlip
 */
'use client'

import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Copy, Printer, ShieldAlert } from 'lucide-react'
import {
  GUARDIAN_CAPABILITIES, GUARDIAN_CAPABILITY_LABELS, GUARDIAN_EVIDENCE_LABELS,
  defaultCapabilitiesFor, invitationBlocker,
  type GuardianCapability,
} from '@shared/constants/guardianPortal'
import Modal, { MODAL_BTN_DANGER, MODAL_BTN_PRIMARY, MODAL_BTN_SECONDARY } from '@/components/shared/Modal'
import {
  useApproveLink, useIssueInvitation, useSetLinkCapabilities, useSuspendGuardianProfile, useTransitionLink,
  type GuardianLinkDto, type IssuedGuardianInvitation, type LinkTransition,
} from '@/hooks/useGuardians'
import { buildSlipHtml } from '@/lib/guardianSlip'

const INPUT =
  'w-full rounded-xl border border-base bg-page px-3 py-2.5 text-sm text-body placeholder:text-muted ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-teal/40 min-h-11'

export function guardianName(link: GuardianLinkDto): string {
  return link.profile?.fullName ?? 'this guardian'
}

export function studentName(link: GuardianLinkDto): string {
  return link.student ? `${link.student.firstName} ${link.student.lastName}`.trim() : 'the student'
}

// ─── Capability checkboxes (shared by approve + edit) ─────

function CapabilityPicker({ value, onChange, idPrefix }: {
  value: GuardianCapability[]; onChange: (next: GuardianCapability[]) => void; idPrefix: string
}) {
  const toggle = (c: GuardianCapability) =>
    onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c])
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium text-body mb-1">What this guardian can see for this child</legend>
      {GUARDIAN_CAPABILITIES.map((c) => (
        <label key={c} htmlFor={`${idPrefix}-${c}`} className="flex items-start gap-3 rounded-xl border border-base px-3 py-2.5 cursor-pointer hover:bg-page min-h-11">
          <input
            id={`${idPrefix}-${c}`} type="checkbox" checked={value.includes(c)} onChange={() => toggle(c)}
            className="mt-0.5 h-4 w-4 accent-brand-teal"
          />
          <span>
            <span className="block text-sm font-medium text-body">{GUARDIAN_CAPABILITY_LABELS[c].label}</span>
            <span className="block text-xs text-muted">{GUARDIAN_CAPABILITY_LABELS[c].hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  )
}

// ─── Approve ──────────────────────────────────────────────

export function ApproveDialog({ link, onClose }: { link: GuardianLinkDto; onClose: () => void }) {
  const approve = useApproveLink()
  const [caps, setCaps] = useState<GuardianCapability[]>(() =>
    defaultCapabilitiesFor({ isFinancialResponsible: link.isFinancialResponsible }))
  const [ack, setAck] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (caps.length === 0) return
    approve.mutate(
      { linkId: link.id, capabilities: caps, ...(link.suggestion ? { acknowledgeSuggestion: ack } : {}) },
      { onSuccess: onClose },
    )
  }

  return (
    <Modal
      title="Approve guardian" size="m" onClose={onClose} busy={approve.isPending} onSubmit={submit} bodyClassName="space-y-4"
      description={`${guardianName(link)} as ${link.relationship.toLowerCase()} of ${studentName(link)}.`}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={approve.isPending} className={MODAL_BTN_SECONDARY}>Cancel</button>
          <button type="submit" disabled={approve.isPending || caps.length === 0} className={MODAL_BTN_PRIMARY}>
            {approve.isPending ? 'Approving…' : 'Approve'}
          </button>
        </>
      }
    >
      <p className="text-sm text-muted">
        Verification so far: <span className="font-medium text-body">{GUARDIAN_EVIDENCE_LABELS[link.evidence]}</span>.
        {link.evidence === 'NONE' && ' Consider checking an ID or document before approving.'}
      </p>

      {link.suggestion && (
        <label className="flex items-start gap-3 rounded-xl border border-status-warning/40 bg-status-warning/10 px-3 py-3 cursor-pointer">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-teal" />
          <span className="text-sm text-body">
            This guardian may already be on file under another entry. I have checked and they are a different person.
          </span>
        </label>
      )}

      <CapabilityPicker value={caps} onChange={setCaps} idPrefix={`approve-${link.id}`} />
      {caps.length === 0 && <p role="alert" className="text-xs text-tone-coral">Choose at least one.</p>}
    </Modal>
  )
}

// ─── Reason prompt ────────────────────────────────────────

const REASON_COPY: Record<LinkTransition, {
  title: string; body: string; button: string; busy: string; required: boolean; danger: boolean
}> = {
  reject:    { title: 'Reject guardian', body: 'This guardian will not get access. You can reopen the request later.', button: 'Reject', busy: 'Rejecting…', required: true, danger: true },
  suspend:   { title: 'Suspend access', body: 'Access stops immediately. The guardian’s other children are not affected.', button: 'Suspend', busy: 'Suspending…', required: true, danger: true },
  revoke:    { title: 'Revoke access', body: 'Access ends and any unused invitations for this link are cancelled. You can reopen it later.', button: 'Revoke', busy: 'Revoking…', required: true, danger: true },
  reinstate: { title: 'Reinstate access', body: 'Access resumes with the same permissions as before. Reinstating also confirms the guardian’s details as checked.', button: 'Reinstate', busy: 'Reinstating…', required: false, danger: false },
  reopen:    { title: 'Reopen request', body: 'This puts the guardian back in the review queue. It does not grant access.', button: 'Reopen', busy: 'Reopening…', required: false, danger: false },
}

export function ReasonDialog({ link, action, onClose }: {
  link: GuardianLinkDto; action: LinkTransition; onClose: () => void
}) {
  const copy = REASON_COPY[action]
  const transition = useTransitionLink()
  const [reason, setReason] = useState('')
  const trimmed = reason.trim()
  const tooShort = copy.required && trimmed.length < 3

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (tooShort) return
    transition.mutate({ linkId: link.id, action, ...(trimmed ? { reason: trimmed } : {}) }, { onSuccess: onClose })
  }

  return (
    <Modal
      title={copy.title} size="s" onClose={onClose} busy={transition.isPending} onSubmit={submit} bodyClassName="space-y-3"
      description={`${guardianName(link)} · ${studentName(link)}`}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={transition.isPending} className={MODAL_BTN_SECONDARY}>Cancel</button>
          <button type="submit" disabled={transition.isPending || tooShort} className={copy.danger ? MODAL_BTN_DANGER : MODAL_BTN_PRIMARY}>
            {transition.isPending ? copy.busy : copy.button}
          </button>
        </>
      }
    >
      <p className="text-sm text-muted">{copy.body}</p>
      <div>
        <label htmlFor={`reason-${link.id}`} className="block text-xs font-medium text-body mb-1">
          Reason {copy.required ? <span className="text-tone-coral" aria-hidden>*</span> : <span className="text-muted">(optional)</span>}
        </label>
        <textarea
          id={`reason-${link.id}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={3}
          className={`${INPUT} min-h-24 resize-y`} aria-required={copy.required}
          placeholder="Recorded in the audit log"
        />
      </div>
    </Modal>
  )
}

// ─── Invitation ───────────────────────────────────────────

export function InviteDialog({ link, onClose }: { link: GuardianLinkDto; onClose: () => void }) {
  const issue = useIssueInvitation()
  const emails = (link.profile?.contacts ?? []).filter((c) => c.kind === 'EMAIL')
  const [channel, setChannel] = useState<'EMAIL' | 'SLIP'>(emails.length > 0 ? 'EMAIL' : 'SLIP')
  const [contactId, setContactId] = useState<string>(emails.find((c) => c.isPreferred)?.id ?? emails[0]?.id ?? '')
  const [issued, setIssued] = useState<IssuedGuardianInvitation | null>(null)
  const blocker = invitationBlocker(link)
  const claimUrl = typeof window === 'undefined' ? '/login?claim=1' : `${window.location.origin}/login?claim=1`

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (blocker) return
    issue.mutate(
      { linkId: link.id, channel, ...(channel === 'EMAIL' && contactId ? { contactId } : {}) },
      {
        onSuccess: (res) => {
          if (res.channel === 'EMAIL') { toast.success('Invitation e-mailed'); onClose(); return }
          setIssued(res)
        },
      },
    )
  }

  const printSlip = () => {
    if (!issued?.code) return
    const w = window.open('', '_blank', 'width=720,height=860')
    if (!w) { toast.error('Allow pop-ups for this site to print the slip.'); return }
    w.document.write(buildSlipHtml({
      guardianName: guardianName(link), studentName: studentName(link),
      code: issued.code, expiresAt: issued.expiresAt, claimUrl,
    }))
    w.document.close()
  }

  const copyCode = async () => {
    if (!issued?.code) return
    try { await navigator.clipboard.writeText(issued.code); toast.success('Code copied') }
    catch { toast.error('Could not copy. Select the code and copy it by hand.') }
  }

  // ── After a slip is issued: the code is on screen once and nowhere else.
  if (issued?.code) {
    return (
      <Modal
        title="Invitation ready" size="m" onClose={onClose} closeOnBackdrop={false} bodyClassName="space-y-4"
        description={`For ${guardianName(link)} · ${studentName(link)}`}
        footer={<button type="button" onClick={onClose} className={MODAL_BTN_PRIMARY}>Done</button>}
      >
        <div className="flex items-start gap-2 rounded-xl border border-status-warning/40 bg-status-warning/10 p-3 text-sm text-body">
          <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 text-status-warning" aria-hidden />
          <p>This code is shown <strong>only now</strong>. It is not stored and cannot be looked up later. Print or copy it before closing.</p>
        </div>
        <p data-testid="claim-code" className="text-center font-mono text-2xl tracking-widest font-bold text-body bg-page rounded-xl py-4 break-all select-all">
          {issued.code}
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          <button type="button" onClick={printSlip} className={MODAL_BTN_PRIMARY}><Printer className="w-4 h-4" aria-hidden />Print slip</button>
          <button type="button" onClick={copyCode} className={MODAL_BTN_SECONDARY}><Copy className="w-4 h-4" aria-hidden />Copy code</button>
        </div>
        <p className="text-xs text-muted text-center">Reference {issued.ref}. The guardian uses it at {claimUrl}</p>
      </Modal>
    )
  }

  return (
    <Modal
      title="Invite to the portal" size="m" onClose={onClose} busy={issue.isPending} onSubmit={submit} bodyClassName="space-y-4"
      description={`${guardianName(link)} · ${studentName(link)}`}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={issue.isPending} className={MODAL_BTN_SECONDARY}>Cancel</button>
          <button type="submit" disabled={issue.isPending || Boolean(blocker) || (channel === 'EMAIL' && !contactId)} className={MODAL_BTN_PRIMARY}>
            {issue.isPending ? 'Issuing…' : channel === 'EMAIL' ? 'Send e-mail' : 'Create slip'}
          </button>
        </>
      }
    >
      {blocker ? (
        <p role="alert" className="rounded-xl border border-status-warning/40 bg-status-warning/10 p-3 text-sm text-body">{blocker}</p>
      ) : (
        <>
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-body mb-1">How should they receive it?</legend>
            <label className={`flex items-start gap-3 rounded-xl border border-base px-3 py-2.5 min-h-11 ${emails.length ? 'cursor-pointer hover:bg-page' : 'opacity-60'}`}>
              <input type="radio" name="inv-channel" checked={channel === 'EMAIL'} disabled={emails.length === 0} onChange={() => setChannel('EMAIL')} className="mt-0.5 accent-brand-teal" />
              <span>
                <span className="block text-sm font-medium text-body">E-mail</span>
                <span className="block text-xs text-muted">{emails.length ? 'Sends a link and a code.' : 'No e-mail address on file for this guardian.'}</span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-base px-3 py-2.5 min-h-11 cursor-pointer hover:bg-page">
              <input type="radio" name="inv-channel" checked={channel === 'SLIP'} onChange={() => setChannel('SLIP')} className="mt-0.5 accent-brand-teal" />
              <span>
                <span className="block text-sm font-medium text-body">Printed slip</span>
                <span className="block text-xs text-muted">Shows a code once, to hand over in person.</span>
              </span>
            </label>
          </fieldset>

          {channel === 'EMAIL' && emails.length > 1 && (
            <div>
              <label htmlFor="inv-contact" className="block text-xs font-medium text-body mb-1">Send to</label>
              <select id="inv-contact" value={contactId} onChange={(e) => setContactId(e.target.value)} className={INPUT}>
                {emails.map((c) => <option key={c.id} value={c.id}>{c.value}</option>)}
              </select>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}

// ─── Capabilities ─────────────────────────────────────────

export function CapabilitiesDialog({ link, onClose }: { link: GuardianLinkDto; onClose: () => void }) {
  const save = useSetLinkCapabilities()
  const [caps, setCaps] = useState<GuardianCapability[]>(link.capabilities)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (caps.length === 0) return
    save.mutate({ linkId: link.id, capabilities: caps }, { onSuccess: onClose })
  }

  return (
    <Modal
      title="What can they see?" size="m" onClose={onClose} busy={save.isPending} onSubmit={submit} bodyClassName="space-y-4"
      description={`${guardianName(link)} · ${studentName(link)}`}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={save.isPending} className={MODAL_BTN_SECONDARY}>Cancel</button>
          <button type="submit" disabled={save.isPending || caps.length === 0} className={MODAL_BTN_PRIMARY}>
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <CapabilityPicker value={caps} onChange={setCaps} idPrefix={`caps-${link.id}`} />
      {caps.length === 0 && <p role="alert" className="text-xs text-tone-coral">Choose at least one.</p>}
    </Modal>
  )
}

// ─── Suspend a guardian everywhere ────────────────────────

/** Suspends the person, not one link: every child they can see stops at once, and signed-in sessions end. */
export function SuspendProfileDialog({ link, onClose }: { link: GuardianLinkDto; onClose: () => void }) {
  const suspend = useSuspendGuardianProfile()
  const [reason, setReason] = useState('')
  const trimmed = reason.trim()
  if (!link.profile) return null
  const profileId = link.profile.id

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (trimmed.length < 3) return
    suspend.mutate({ profileId, reason: trimmed }, { onSuccess: onClose })
  }

  return (
    <Modal
      title="Suspend this guardian everywhere" size="s" onClose={onClose} busy={suspend.isPending} onSubmit={submit} bodyClassName="space-y-3"
      description={guardianName(link)}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={suspend.isPending} className={MODAL_BTN_SECONDARY}>Cancel</button>
          <button type="submit" disabled={suspend.isPending || trimmed.length < 3} className={MODAL_BTN_DANGER}>
            {suspend.isPending ? 'Suspending…' : 'Suspend everywhere'}
          </button>
        </>
      }
    >
      <p className="text-sm text-muted">
        Use this when the person is the concern, not one child’s link. Their access to <strong>every</strong> child stops
        on their next request, and any unused invitations are cancelled. To stop access for this child only, use Suspend on the link instead.
      </p>
      <div>
        <label htmlFor={`sp-reason-${profileId}`} className="block text-xs font-medium text-body mb-1">
          Reason <span className="text-tone-coral" aria-hidden>*</span>
        </label>
        <textarea
          id={`sp-reason-${profileId}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={3}
          className={`${INPUT} min-h-24 resize-y`} aria-required placeholder="Recorded in the audit log"
        />
      </div>
    </Modal>
  )
}
