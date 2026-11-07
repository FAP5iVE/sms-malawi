/**
 * [FILE]: packages/shared/constants/guardianPortal.ts
 * [PURPOSE]: One vocabulary for the guardian (parent) portal, shared by the API,
 *   the parent UI and the tests, so a capability or status can never be spelled
 *   two ways. Pure: no imports of server or client code.
 *
 * The relationship vocabulary is NOT redefined here: use GUARDIAN_RELATIONSHIPS
 * from ./admissions (the school's existing list).
 */

// ─── ENUM VOCABULARIES ────────────────────────────────────
// Mirrors of the Prisma enums, so services, UI and tests can name a status without
// depending on `prisma generate` having run. A test fails if these drift from
// prisma/schema.prisma.
export const GUARDIAN_PROFILE_STATUSES = ['ACTIVE', 'SUSPENDED', 'MERGED'] as const
export const GUARDIAN_CONTACT_KINDS = ['PHONE', 'EMAIL'] as const
export const GUARDIAN_CONTACT_VERIFICATIONS = ['UNVERIFIED', 'STAFF_CONFIRMED', 'CODE_VERIFIED'] as const
export const GUARDIAN_LINK_STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED', 'REJECTED'] as const
export const GUARDIAN_LINK_SOURCES = ['ADMISSION', 'STAFF', 'BACKFILL', 'PARENT_REQUEST'] as const
export const GUARDIAN_EVIDENCE_LEVELS = ['NONE', 'DOCUMENT_SEEN', 'IN_PERSON_VERIFIED'] as const
export const GUARDIAN_INVITATION_CHANNELS = ['EMAIL', 'SLIP'] as const
export const GUARDIAN_INVITATION_STATUSES = ['ACTIVE', 'CLAIMED', 'REVOKED', 'EXPIRED', 'LOCKED'] as const
export const GUARDIAN_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const
export const GUARDIAN_BATCH_STATUSES = ['DRY_RUN', 'APPLYING', 'APPLIED', 'ROLLED_BACK'] as const

export type GuardianLinkStatusValue = (typeof GUARDIAN_LINK_STATUSES)[number]
export type GuardianLinkSourceValue = (typeof GUARDIAN_LINK_SOURCES)[number]
export type GuardianEvidenceValue = (typeof GUARDIAN_EVIDENCE_LEVELS)[number]
export type GuardianInvitationChannelValue = (typeof GUARDIAN_INVITATION_CHANNELS)[number]
export type GuardianInvitationStatusValue = (typeof GUARDIAN_INVITATION_STATUSES)[number]

// ─── CAPABILITIES ─────────────────────────────────────────
// What a verified link lets the guardian see. A link that is ACTIVE with an empty
// list can see nothing. Each module on the parent API names the ONE capability it
// requires.
export const GUARDIAN_CAPABILITIES = [
  'results',     // published term results and report cards
  'fees',        // invoices, payments, balance
  'attendance',  // attendance summary and recent records
  'notices',     // school and class notices for this child
  'profile',     // the child's basic profile (name, class, admission number)
  'documents',   // downloadable documents tied to the child (receipts, report cards)
] as const
export type GuardianCapability = (typeof GUARDIAN_CAPABILITIES)[number]

/**
 * Granted when a link is approved unless staff choose otherwise. `fees` and
 * `documents` are deliberately NOT default: money and downloadable files are
 * opted into (fees is added automatically for a financially responsible guardian,
 * see defaultCapabilitiesFor).
 */
export const DEFAULT_GUARDIAN_CAPABILITIES: readonly GuardianCapability[] = [
  'results', 'attendance', 'notices', 'profile',
]

export function isGuardianCapability(v: unknown): v is GuardianCapability {
  return typeof v === 'string' && (GUARDIAN_CAPABILITIES as readonly string[]).includes(v)
}

/** Drops unknown values, removes duplicates, returns a stable order. */
export function sanitizeCapabilities(input: unknown): GuardianCapability[] {
  if (!Array.isArray(input)) return []
  const set = new Set<GuardianCapability>()
  for (const v of input) if (isGuardianCapability(v)) set.add(v)
  return GUARDIAN_CAPABILITIES.filter((c) => set.has(c))
}

export function defaultCapabilitiesFor(opts: { isFinancialResponsible: boolean }): GuardianCapability[] {
  const caps = new Set<GuardianCapability>(DEFAULT_GUARDIAN_CAPABILITIES)
  if (opts.isFinancialResponsible) caps.add('fees')
  return sanitizeCapabilities([...caps])
}

// ─── STUDENT STATUS ───────────────────────────────────────
// A guardian sees data for a child only while the child is enrolled. A linked child
// who has left (GRADUATED / ARCHIVED) is still listed, marked "no longer enrolled",
// with no data behind it. Welfare, exit and identity fields are never exposed at all.
export const PARENT_VISIBLE_STUDENT_STATUSES = ['ACTIVE', 'AWAITING_MANEB_RESULTS'] as const

export function isEnrolledForParent(status: unknown): boolean {
  return typeof status === 'string' && (PARENT_VISIBLE_STUDENT_STATUSES as readonly string[]).includes(status)
}

// ─── INVITATIONS ──────────────────────────────────────────
// A code is "<REF>-<SECRET>". The ref locates the invitation, the secret proves
// possession; wrong secrets count against that invitation and lock it.
export const INVITATION_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ' // 31 chars: no 0 O 1 I L
export const INVITATION_REF_LENGTH = 6
export const INVITATION_SECRET_LENGTH = 10
export const INVITATION_MAX_FAILED_ATTEMPTS = 5
export const INVITATION_TTL_HOURS = { EMAIL: 72, SLIP: 24 * 14 } as const

// ─── AUDIT ────────────────────────────────────────────────
export const GUARDIAN_AUDIT_ACTIONS = [
  'guardian.profile_created',
  'guardian.profile_suspended',
  'guardian.profile_reinstated',
  'guardian.profile_merged',
  'guardian.link_proposed',
  'guardian.link_approved',
  'guardian.link_rejected',
  'guardian.link_capabilities_changed',
  'guardian.link_suspended',
  'guardian.link_reinstated',
  'guardian.link_revoked',
  'guardian.link_reverify_flagged',
  'guardian.link_reverified',
  'guardian.link_repointed',
  'guardian.link_reopened',
  'guardian.evidence_recorded',
  'guardian.invitation_issued',
  'guardian.invitation_revoked',
  'guardian.invitation_locked',
  'guardian.claim_succeeded',
  'guardian.claim_failed',
  'guardian.request_submitted',
  'guardian.request_approved',
  'guardian.request_rejected',
  'guardian.onboarding_dry_run',
  'guardian.onboarding_applied',
  'guardian.onboarding_rolled_back',
  'guardian.directory_synced',
] as const
export type GuardianAuditAction = (typeof GUARDIAN_AUDIT_ACTIONS)[number]

// ─── UI VOCABULARY ────────────────────────────────────────
// Plain-language labels for the staff screen and the parent portal, kept next to the
// vocabularies they describe so a new status or capability cannot ship without a label
// (guardianPortalConstants.test.ts fails if a key is missing).
export const GUARDIAN_LINK_STATUS_LABELS: Readonly<Record<GuardianLinkStatusValue, string>> = {
  PENDING: 'Awaiting approval',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  REVOKED: 'Revoked',
  REJECTED: 'Rejected',
}

export const GUARDIAN_CAPABILITY_LABELS: Readonly<Record<GuardianCapability, { label: string; hint: string }>> = {
  results: { label: 'Results', hint: 'Published term results' },
  fees: { label: 'Fees', hint: 'Invoices, payments and balance' },
  attendance: { label: 'Attendance', hint: 'Attendance summary and recent days' },
  notices: { label: 'Notices', hint: 'School and class notices (not available yet)' },
  profile: { label: 'Profile', hint: 'Name, class and admission number' },
  documents: { label: 'Documents', hint: 'Receipts and report cards (not available yet)' },
}

export const GUARDIAN_EVIDENCE_LABELS: Readonly<Record<GuardianEvidenceValue, string>> = {
  NONE: 'Not verified',
  DOCUMENT_SEEN: 'Document seen',
  IN_PERSON_VERIFIED: 'Verified in person',
}

export const GUARDIAN_LINK_SOURCE_LABELS: Readonly<Record<GuardianLinkSourceValue, string>> = {
  ADMISSION: 'Admission',
  STAFF: 'Staff',
  BACKFILL: 'Existing records',
  PARENT_REQUEST: 'Parent request',
}

export const GUARDIAN_INVITATION_STATUS_LABELS: Readonly<Record<GuardianInvitationStatusValue, string>> = {
  ACTIVE: 'Waiting to be used',
  CLAIMED: 'Used',
  REVOKED: 'Cancelled',
  EXPIRED: 'Expired',
  LOCKED: 'Locked (too many wrong attempts)',
}

export const GUARDIAN_ONBOARDING_ACTIONS = ['CREATE_NEW', 'SUGGEST_MATCH', 'SKIP_EXISTING', 'SKIP_INVALID'] as const
export type GuardianOnboardingActionValue = (typeof GUARDIAN_ONBOARDING_ACTIONS)[number]
export const GUARDIAN_ONBOARDING_ACTION_LABELS: Readonly<Record<GuardianOnboardingActionValue, string>> = {
  CREATE_NEW: 'Will create a new guardian',
  SUGGEST_MATCH: 'May be someone already on file',
  SKIP_EXISTING: 'Already proposed',
  SKIP_INVALID: 'Skipped: no usable name',
}

// ─── LINK ACTIONS (what the staff screen may offer) ───────
// A UI mirror of the server's state machine (server/lib/guardian/linkStateMachine.ts):
// the buttons shown must be exactly the moves the server would accept. The server stays
// the authority; guardianPortalConstants.test.ts fails if this table drifts from it.
export type GuardianLinkActionName = 'approve' | 'reject' | 'suspend' | 'reinstate' | 'revoke' | 'reopen'
export type GuardianStaffPermission = 'guardian.approve' | 'guardian.restrict'

export const GUARDIAN_LINK_ACTION_RULES: Readonly<Record<GuardianLinkActionName, {
  from: readonly GuardianLinkStatusValue[]
  permission: GuardianStaffPermission
}>> = {
  approve:   { from: ['PENDING'],             permission: 'guardian.approve' },
  reject:    { from: ['PENDING'],             permission: 'guardian.approve' },
  suspend:   { from: ['ACTIVE'],              permission: 'guardian.restrict' },
  reinstate: { from: ['SUSPENDED'],           permission: 'guardian.approve' },
  revoke:    { from: ['ACTIVE', 'SUSPENDED'], permission: 'guardian.restrict' },
  reopen:    { from: ['REJECTED', 'REVOKED'], permission: 'guardian.approve' },
}

/** The actions legal from `status` that this staff member holds the permission for, in display order. */
export function availableLinkActions(
  status: unknown, can: (permission: GuardianStaffPermission) => boolean,
): GuardianLinkActionName[] {
  if (typeof status !== 'string') return []
  return (Object.keys(GUARDIAN_LINK_ACTION_RULES) as GuardianLinkActionName[]).filter((a) => {
    const rule = GUARDIAN_LINK_ACTION_RULES[a]
    return (rule.from as readonly string[]).includes(status) && can(rule.permission)
  })
}

/**
 * Why an ACTIVE link cannot get an invitation yet, or null when it can. Mirrors the checks in
 * issueInvitation so the button explains itself instead of failing after the click.
 */
export function invitationBlocker(link: {
  status: string; reverifyRequired: boolean; profile: { status: string; hasAccount: boolean } | null
}): string | null {
  if (link.status !== 'ACTIVE') return 'Approve this guardian first.'
  if (!link.profile) return 'This link has no guardian profile.'
  if (link.profile.status !== 'ACTIVE') return 'This guardian is suspended or merged.'
  if (link.profile.hasAccount) return 'Already has a portal account. The child appears there once access is approved.'
  if (link.reverifyRequired) return 'Re-verify this guardian first: their details changed.'
  return null
}

// ─── ACCESS LOG WORDING ───────────────────────────────────
// Why a guardian's request was refused, in words staff can act on. Keys are the DenyReason
// codes written by guardianAccess.ts; an unknown code falls back to a readable form of itself.
export const GUARDIAN_DENY_REASON_LABELS: Readonly<Record<string, string>> = {
  NO_PROFILE: 'No guardian profile for this account',
  PROFILE_INACTIVE: 'Guardian is suspended',
  NO_LINK: 'Not linked to this child',
  LINK_INACTIVE: 'Access for this child is not active',
  STUDENT_MISSING: 'Student record not found',
  CAPABILITY_MISSING: 'This guardian is not allowed to see that section',
  REVERIFY_PENDING: 'Held until staff re-verify the guardian',
  NOT_ENROLLED: 'Student is no longer enrolled',
}

export function denyReasonLabel(reason: string | null | undefined): string {
  if (!reason) return ''
  return GUARDIAN_DENY_REASON_LABELS[reason] ?? reason.toLowerCase().replace(/_/g, ' ')
}

// ─── CLAIM FORM (client-side checks that save a round trip) ─
// The server is the authority and answers every failure generically; these only catch what
// the person can fix before sending. The password rule mirrors passwordProblem() in
// guardianClaimService.ts, and a test fails if the two disagree.
export const GUARDIAN_PASSWORD_MIN_LENGTH = 10
export const GUARDIAN_PASSWORD_MAX_LENGTH = 128

/** A message when the password would be refused, or null when it is acceptable. */
export function claimPasswordProblem(password: string, email: string): string | null {
  if (password.length < GUARDIAN_PASSWORD_MIN_LENGTH) return `Use at least ${GUARDIAN_PASSWORD_MIN_LENGTH} characters.`
  if (password.length > GUARDIAN_PASSWORD_MAX_LENGTH) return `Use at most ${GUARDIAN_PASSWORD_MAX_LENGTH} characters.`
  if (email && password.toLowerCase() === email.trim().toLowerCase()) return 'Your password cannot be your email address.'
  if (/^(.)\1+$/.test(password)) return 'Choose a password that is not one character repeated.'
  return null
}

export interface ClaimFormValues { code: string; email: string; password: string; confirm: string; childDateOfBirth: string }
export type ClaimFormErrors = Partial<Record<keyof ClaimFormValues, string>>

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** A real calendar day written YYYY-MM-DD, not in the future. */
export function isPlausibleBirthDate(value: string, today: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return false
  return d.getTime() <= today.getTime()
}

/** Everything wrong with the form right now, keyed by field. Empty object means it can be sent. */
export function validateClaimForm(v: ClaimFormValues, today: Date = new Date()): ClaimFormErrors {
  const errors: ClaimFormErrors = {}
  if (v.code.trim() === '') errors.code = 'Enter the code from your invitation.'
  const email = v.email.trim()
  if (!EMAIL_SHAPE.test(email)) errors.email = 'Enter a valid email address.'
  const pw = claimPasswordProblem(v.password, email)
  if (pw) errors.password = pw
  else if (v.confirm !== v.password) errors.confirm = 'The two passwords do not match.'
  if (v.childDateOfBirth !== '' && !isPlausibleBirthDate(v.childDateOfBirth, today)) {
    errors.childDateOfBirth = 'Enter a real date, for example 2010-04-23.'
  }
  return errors
}
