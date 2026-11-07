/**
 * [FILE]: apps/web/src/server/lib/guardian/linkStateMachine.ts
 * [PURPOSE]: Every legal change of a GuardianLink's status, the permission each needs,
 *   and the preconditions for granting access. Pure, so the rules are tested directly
 *   and the service cannot drift from them.
 *
 *     PENDING   --approve-->   ACTIVE        (guardian.approve)
 *     PENDING   --reject-->    REJECTED      (guardian.approve)
 *     ACTIVE    --suspend-->   SUSPENDED     (guardian.restrict)
 *     SUSPENDED --reinstate--> ACTIVE        (guardian.approve)
 *     ACTIVE|SUSPENDED --revoke--> REVOKED   (guardian.restrict)
 *     REJECTED|REVOKED --reopen--> PENDING   (guardian.approve)  fresh verification required
 *
 *   Making access EASIER (approve, reinstate, reopen) needs guardian.approve; making it
 *   HARDER (suspend, revoke, change capabilities) needs guardian.restrict.
 */
import type { Permission } from '@shared/types/permissions'
import type { GuardianLinkStatusValue, GuardianEvidenceValue } from '@shared/constants/guardianPortal'
import { sanitizeCapabilities } from '@shared/constants/guardianPortal'
import { isStrongMatch } from './matching'

export type LinkAction = 'approve' | 'reject' | 'suspend' | 'reinstate' | 'revoke' | 'reopen'

interface Transition { from: readonly GuardianLinkStatusValue[]; to: GuardianLinkStatusValue; permission: Permission }

export const LINK_TRANSITIONS: Readonly<Record<LinkAction, Transition>> = {
  approve:   { from: ['PENDING'],              to: 'ACTIVE',    permission: 'guardian.approve' },
  reject:    { from: ['PENDING'],              to: 'REJECTED',  permission: 'guardian.approve' },
  suspend:   { from: ['ACTIVE'],               to: 'SUSPENDED', permission: 'guardian.restrict' },
  reinstate: { from: ['SUSPENDED'],            to: 'ACTIVE',    permission: 'guardian.approve' },
  revoke:    { from: ['ACTIVE', 'SUSPENDED'],  to: 'REVOKED',   permission: 'guardian.restrict' },
  reopen:    { from: ['REJECTED', 'REVOKED'],  to: 'PENDING',   permission: 'guardian.approve' },
}

/** The status `action` would move a link to, or null when it is not allowed from `current`. */
export function nextStatus(action: LinkAction, current: unknown): GuardianLinkStatusValue | null {
  const t = LINK_TRANSITIONS[action]
  if (!t || typeof current !== 'string') return null
  return (t.from as readonly string[]).includes(current) ? t.to : null
}

export function permissionFor(action: LinkAction): Permission {
  return LINK_TRANSITIONS[action].permission
}

/** The status that confers access. Nothing else ever does. */
export function grantsAccess(status: unknown): boolean {
  return status === 'ACTIVE'
}

export interface Problem { code: string; message: string }

export interface ApprovalInput {
  link: {
    status: string
    evidence: GuardianEvidenceValue | string
    reverifyRequired?: boolean
    suggestedProfileId?: string | null
    suggestedMethod?: string | null
  }
  profile: { status: string }
  capabilities: unknown
  acknowledgeSuggestion?: boolean
}

/** Everything that must be true before a PENDING link may become ACTIVE. Empty = allowed. */
export function evaluateApproval(i: ApprovalInput): Problem[] {
  const problems: Problem[] = []
  if (i.link.status !== 'PENDING') {
    problems.push({ code: 'NOT_PENDING', message: 'Only a pending link can be approved.' })
  }
  if (i.link.evidence === 'NONE') {
    problems.push({ code: 'NO_EVIDENCE', message: 'Record how this guardian was verified (document seen or in person) before approving.' })
  }
  if (i.profile.status !== 'ACTIVE') {
    problems.push({ code: 'PROFILE_NOT_ACTIVE', message: 'This guardian profile is suspended or merged.' })
  }
  if (sanitizeCapabilities(i.capabilities).length === 0) {
    problems.push({ code: 'NO_CAPABILITIES', message: 'Choose at least one thing this guardian may see.' })
  }
  if (
    i.link.suggestedProfileId &&
    i.link.suggestedMethod &&
    isStrongMatch({ method: i.link.suggestedMethod as 'EMAIL_NAME' | 'EMAIL' | 'PHONE_NAME' | 'PHONE_SHARED' }) &&
    i.acknowledgeSuggestion !== true
  ) {
    problems.push({ code: 'UNRESOLVED_MATCH', message: 'This looks like a guardian who is already on file. Link to that profile, or confirm they are a different person.' })
  }
  return problems
}

/** A suspended link may be reinstated only while its person is in good standing and evidence exists. */
export function evaluateReinstatement(i: { link: { status: string; evidence: string }; profile: { status: string } }): Problem[] {
  const problems: Problem[] = []
  if (i.link.status !== 'SUSPENDED') problems.push({ code: 'NOT_SUSPENDED', message: 'Only a suspended link can be reinstated.' })
  if (i.profile.status !== 'ACTIVE') problems.push({ code: 'PROFILE_NOT_ACTIVE', message: 'This guardian profile is suspended or merged.' })
  if (i.link.evidence === 'NONE') problems.push({ code: 'NO_EVIDENCE', message: 'Record how this guardian was verified before reinstating.' })
  return problems
}
