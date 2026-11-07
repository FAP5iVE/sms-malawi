/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/guardians/GuardianLinkCard.tsx
 * [PHASE]: Guardian Portal — staff UI (T7a)
 * [PURPOSE]: One guardian link as a card: who, for which child, status, verification, any
 *   duplicate suspicion or re-verification flag, invitations, and the actions staff may take.
 *
 *   The buttons come from availableLinkActions(): exactly the moves the server's state machine
 *   would accept for this status, filtered by the staff member's own permissions. A button that
 *   would only ever fail is never drawn.
 * [DEPENDS ON]: @/hooks/useGuardians, @/hooks/usePermissions, @shared/constants/guardianPortal
 */
'use client'

import { useState } from 'react'
import {
  AlertTriangle, CheckCircle2, Mail, Phone, Send, ShieldOff, SlidersHorizontal, Users, XCircle,
} from 'lucide-react'
import {
  GUARDIAN_CAPABILITY_LABELS, GUARDIAN_EVIDENCE_LABELS, GUARDIAN_EVIDENCE_LEVELS, GUARDIAN_INVITATION_STATUS_LABELS,
  GUARDIAN_LINK_SOURCE_LABELS, GUARDIAN_LINK_STATUS_LABELS, availableLinkActions,
  type GuardianEvidenceValue, type GuardianLinkStatusValue,
} from '@shared/constants/guardianPortal'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { usePermissions } from '@/hooks/usePermissions'
import {
  useConfirmReverified, useReinstateGuardianProfile, useRepointLink, useRevokeInvitation, useSetLinkEvidence,
  type GuardianLinkDto, type LinkTransition,
} from '@/hooks/useGuardians'
import {
  ApproveDialog, CapabilitiesDialog, InviteDialog, ReasonDialog, SuspendProfileDialog,
  guardianName, studentName,
} from './GuardianLinkDialogs'

const STATUS_TONE: Record<GuardianLinkStatusValue, string> = {
  PENDING: 'bg-status-warning/10 text-status-warning',
  ACTIVE: 'bg-status-success/10 text-status-success',
  SUSPENDED: 'bg-brand-coral/10 text-brand-coral',
  REVOKED: 'bg-status-neutral/10 text-muted',
  REJECTED: 'bg-status-neutral/10 text-muted',
}

const MATCH_LABELS: Record<string, string> = {
  EMAIL_NAME: 'the same e-mail and a similar name',
  EMAIL: 'the same e-mail',
  PHONE_NAME: 'the same phone number and a similar name',
  PHONE_SHARED: 'the same phone number but a different name',
}

const BTN =
  'inline-flex items-center justify-center gap-1.5 min-h-11 px-3.5 rounded-xl text-sm font-heading font-semibold ' +
  'transition-colors disabled:opacity-60 disabled:pointer-events-none'
const BTN_PRIMARY = `${BTN} bg-brand-teal text-white hover:bg-brand-teal-light`
const BTN_OUTLINE = `${BTN} border border-base text-body hover:bg-page`
const BTN_DANGER_OUTLINE = `${BTN} border border-brand-coral/40 text-brand-coral hover:bg-brand-coral/10`

type Open =
  | { kind: 'approve' } | { kind: 'invite' } | { kind: 'capabilities' } | { kind: 'suspendProfile' }
  | { kind: 'reason'; action: LinkTransition }
  | { kind: 'repoint' } | { kind: 'reinstateProfile' } | { kind: 'cancelInvitation'; id: string }
  | null

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function GuardianLinkCard({ link, showStudent = false, profileNames }: {
  link: GuardianLinkDto
  /** The queue mixes children, so it names the student; a single student's view does not. */
  showStudent?: boolean
  /** Names of guardians in the loaded list, so a "possible duplicate" can say who when it is known. */
  profileNames?: ReadonlyMap<string, string>
}) {
  const { can } = usePermissions()
  const [open, setOpen] = useState<Open>(null)
  const close = () => setOpen(null)

  const setEvidence = useSetLinkEvidence()
  const repoint = useRepointLink()
  const reverified = useConfirmReverified()
  const cancelInvitation = useRevokeInvitation()
  const reinstateProfile = useReinstateGuardianProfile()

  const actions = availableLinkActions(link.status, (p) => can(p))
  const live = link.status === 'PENDING' || link.status === 'ACTIVE' || link.status === 'SUSPENDED'
  const profile = link.profile
  const suggestedName = link.suggestion ? profileNames?.get(link.suggestion.profileId) : undefined
  const activeInvitation = link.invitations.find((i) => i.status === 'ACTIVE')
  const profileSuspended = profile?.status === 'SUSPENDED'

  return (
    <article className="rounded-2xl border border-base bg-surface p-4 space-y-3" aria-label={`${guardianName(link)}, ${GUARDIAN_LINK_STATUS_LABELS[link.status]}`}>
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-heading font-semibold text-body truncate">{profile?.fullName ?? 'Unnamed guardian'}</h3>
          <p className="text-sm text-muted">
            {link.relationship}
            {showStudent && link.student && <> · for <span className="text-body font-medium">{studentName(link)}</span> ({link.student.registrationNo})</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE[link.status]}`}>{GUARDIAN_LINK_STATUS_LABELS[link.status]}</span>
          {link.isPrimaryContact && <span className="rounded-full px-2.5 py-1 text-xs font-medium bg-brand-teal/10 text-brand-teal">Primary contact</span>}
          {link.isFinancialResponsible && <span className="rounded-full px-2.5 py-1 text-xs font-medium bg-brand-teal/10 text-brand-teal">Pays fees</span>}
          {profile?.hasAccount && <span className="rounded-full px-2.5 py-1 text-xs font-medium bg-status-info/10 text-status-info">Has portal account</span>}
          {profileSuspended && <span className="rounded-full px-2.5 py-1 text-xs font-medium bg-brand-coral/10 text-brand-coral">Guardian suspended</span>}
        </div>
      </header>

      {/* Contacts */}
      {profile && profile.contacts.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
          {profile.contacts.map((c) => (
            <li key={c.id} className="inline-flex items-center gap-1.5">
              {c.kind === 'EMAIL' ? <Mail className="w-3.5 h-3.5" aria-hidden /> : <Phone className="w-3.5 h-3.5" aria-hidden />}
              <span className="break-all">{c.value}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Flags */}
      {link.reverifyRequired && (
        <div role="note" className="flex items-start gap-2 rounded-xl border border-status-warning/40 bg-status-warning/10 p-3 text-sm text-body">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-status-warning" aria-hidden />
          <div className="space-y-2">
            <p><strong>Re-verify needed.</strong> {link.reverifyReason ?? 'This guardian’s details changed after they were approved.'}</p>
            {can('guardian.approve') && (
              <button type="button" className={BTN_OUTLINE} disabled={reverified.isPending} onClick={() => reverified.mutate(link.id)}>
                <CheckCircle2 className="w-4 h-4" aria-hidden />{reverified.isPending ? 'Saving…' : 'I have re-verified them'}
              </button>
            )}
          </div>
        </div>
      )}

      {link.suggestion && link.status === 'PENDING' && (
        <div role="note" className="flex items-start gap-2 rounded-xl border border-status-warning/40 bg-status-warning/10 p-3 text-sm text-body">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-status-warning" aria-hidden />
          <div className="space-y-2">
            <p>
              <strong>Possible duplicate.</strong> This entry has {MATCH_LABELS[link.suggestion.method ?? ''] ?? 'details in common'} with
              {suggestedName ? <> <strong>{suggestedName}</strong>, who is</> : ' a guardian'} already on file.
            </p>
            {can('guardian.propose') && (
              <button type="button" className={BTN_OUTLINE} disabled={repoint.isPending} onClick={() => setOpen({ kind: 'repoint' })}>
                <Users className="w-4 h-4" aria-hidden />They are the same person
              </button>
            )}
          </div>
        </div>
      )}

      {/* Verification + access */}
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted">Verification</dt>
          <dd>
            {live && can('guardian.propose') ? (
              <label className="sr-only" htmlFor={`ev-${link.id}`}>Verification level</label>
            ) : null}
            {live && can('guardian.propose') ? (
              <select
                id={`ev-${link.id}`} value={link.evidence} disabled={setEvidence.isPending}
                onChange={(e) => setEvidence.mutate({ linkId: link.id, evidence: e.target.value as GuardianEvidenceValue })}
                className="mt-0.5 w-full rounded-xl border border-base bg-page px-3 py-2 text-sm text-body min-h-11 focus:outline-none focus:ring-2 focus:ring-brand-teal/40"
              >
                {GUARDIAN_EVIDENCE_LEVELS.map((v) => <option key={v} value={v}>{GUARDIAN_EVIDENCE_LABELS[v]}</option>)}
              </select>
            ) : (
              <span className="text-body">{GUARDIAN_EVIDENCE_LABELS[link.evidence]}</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Source</dt>
          <dd className="text-body">{GUARDIAN_LINK_SOURCE_LABELS[link.source]}{link.approvedAt ? ` · approved ${fmtDate(link.approvedAt)}` : ''}</dd>
        </div>
        {link.status !== 'PENDING' && link.capabilities.length > 0 && (
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted">Can see</dt>
            <dd className="flex flex-wrap gap-1.5 mt-0.5">
              {link.capabilities.map((c) => (
                <span key={c} className="rounded-full bg-page border border-base px-2.5 py-0.5 text-xs text-body">{GUARDIAN_CAPABILITY_LABELS[c].label}</span>
              ))}
            </dd>
          </div>
        )}
        {link.statusReason && (
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted">Reason on record</dt>
            <dd className="text-body">{link.statusReason}</dd>
          </div>
        )}
      </dl>

      {/* Invitations */}
      {link.invitations.length > 0 && (
        <div>
          <p className="text-xs text-muted mb-1">Invitations</p>
          <ul className="space-y-1.5">
            {link.invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-base px-3 py-2 text-sm">
                <span className="text-body">
                  {i.channel === 'EMAIL' ? 'E-mail' : 'Slip'} <span className="text-muted">· ref {i.ref}</span>
                  <span className="text-muted"> · {GUARDIAN_INVITATION_STATUS_LABELS[i.status]}{i.status === 'ACTIVE' ? `, until ${fmtDate(i.expiresAt)}` : ''}</span>
                </span>
                {i.status === 'ACTIVE' && can('guardian.invite') && (
                  <button type="button" className="text-sm font-medium text-brand-coral hover:underline min-h-11 px-2" onClick={() => setOpen({ kind: 'cancelInvitation', id: i.id })}>
                    Cancel
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-1">
        {actions.includes('approve') && (
          <button type="button" className={BTN_PRIMARY} onClick={() => setOpen({ kind: 'approve' })}>
            <CheckCircle2 className="w-4 h-4" aria-hidden />Approve
          </button>
        )}
        {actions.includes('reject') && (
          <button type="button" className={BTN_DANGER_OUTLINE} onClick={() => setOpen({ kind: 'reason', action: 'reject' })}>
            <XCircle className="w-4 h-4" aria-hidden />Reject
          </button>
        )}
        {link.status === 'ACTIVE' && can('guardian.invite') && !profile?.hasAccount && (
          <button type="button" className={BTN_PRIMARY} onClick={() => setOpen({ kind: 'invite' })}>
            <Send className="w-4 h-4" aria-hidden />{activeInvitation ? 'Send a new invitation' : 'Invite'}
          </button>
        )}
        {link.status === 'ACTIVE' && can('guardian.restrict') && (
          <button type="button" className={BTN_OUTLINE} onClick={() => setOpen({ kind: 'capabilities' })}>
            <SlidersHorizontal className="w-4 h-4" aria-hidden />Edit access
          </button>
        )}
        {actions.includes('reinstate') && (
          <button type="button" className={BTN_PRIMARY} onClick={() => setOpen({ kind: 'reason', action: 'reinstate' })}>Reinstate</button>
        )}
        {actions.includes('reopen') && (
          <button type="button" className={BTN_OUTLINE} onClick={() => setOpen({ kind: 'reason', action: 'reopen' })}>Reopen</button>
        )}
        {actions.includes('suspend') && (
          <button type="button" className={BTN_DANGER_OUTLINE} onClick={() => setOpen({ kind: 'reason', action: 'suspend' })}>
            <ShieldOff className="w-4 h-4" aria-hidden />Suspend
          </button>
        )}
        {actions.includes('revoke') && (
          <button type="button" className={BTN_DANGER_OUTLINE} onClick={() => setOpen({ kind: 'reason', action: 'revoke' })}>Revoke</button>
        )}
        {profile && profile.status === 'ACTIVE' && live && can('guardian.restrict') && (
          <button type="button" className={`${BTN} text-muted hover:text-body hover:bg-page`} onClick={() => setOpen({ kind: 'suspendProfile' })}>
            Suspend guardian everywhere
          </button>
        )}
        {profileSuspended && can('guardian.approve') && (
          <button type="button" className={BTN_OUTLINE} onClick={() => setOpen({ kind: 'reinstateProfile' })}>Reinstate guardian everywhere</button>
        )}
      </div>

      {/* Dialogs */}
      {open?.kind === 'approve' && <ApproveDialog link={link} onClose={close} />}
      {open?.kind === 'invite' && <InviteDialog link={link} onClose={close} />}
      {open?.kind === 'capabilities' && <CapabilitiesDialog link={link} onClose={close} />}
      {open?.kind === 'suspendProfile' && <SuspendProfileDialog link={link} onClose={close} />}
      {open?.kind === 'reason' && <ReasonDialog link={link} action={open.action} onClose={close} />}

      <ConfirmDialog
        open={open?.kind === 'repoint'} title="Same person?"
        description={`This moves this child’s link to the guardian already on file${suggestedName ? ` (${suggestedName})` : ''}, so they have one profile across all their children. Only do this if you are sure they are the same person.`}
        confirmLabel="Yes, same person" confirming={repoint.isPending} confirmingLabel="Linking…"
        onCancel={close}
        onConfirm={() => { if (link.suggestion) repoint.mutate({ linkId: link.id, profileId: link.suggestion.profileId }, { onSuccess: close }) }}
      />
      <ConfirmDialog
        open={open?.kind === 'cancelInvitation'} destructive title="Cancel this invitation?"
        description="The code or link stops working immediately. You can issue a new one."
        confirmLabel="Cancel invitation" confirming={cancelInvitation.isPending} confirmingLabel="Cancelling…"
        onCancel={close}
        onConfirm={() => { if (open?.kind === 'cancelInvitation') cancelInvitation.mutate(open.id, { onSuccess: close }) }}
      />
      <ConfirmDialog
        open={open?.kind === 'reinstateProfile'} title="Reinstate this guardian?"
        description="Their access to children whose links are still active resumes. Links that were suspended individually stay suspended, and invitations cancelled earlier are not restored: issue a new one if needed."
        confirmLabel="Reinstate" confirming={reinstateProfile.isPending} confirmingLabel="Reinstating…"
        onCancel={close}
        onConfirm={() => { if (profile) reinstateProfile.mutate(profile.id, { onSuccess: close }) }}
      />
    </article>
  )
}
