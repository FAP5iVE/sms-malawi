/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/hooks/useGuardians.ts
 * [PHASE]: Guardian Portal — staff UI (T7a)
 * [PURPOSE]: TanStack Query hooks and response types for the STAFF side of the guardian
 *   portal (/guardians/*): the review queue, a student's guardian view, link decisions,
 *   invitations, onboarding (backfill) and the access log.
 *
 *   The DTO interfaces below mirror what routes/guardians.ts returns; they live here, next to
 *   the only code that reads them, rather than in @shared/types/api, because the server builds
 *   these from loose Prisma rows and a second hand-kept shared copy would only drift.
 *
 *   Every mutation invalidates the single `guardians` query root: a decision on one link can
 *   change the queue, a student's view and the re-verify badge at once.
 * [DEPENDS ON]: @/lib/api-client (apiFetch, queryKeys), @shared/constants/guardianPortal
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  GuardianCapability,
  GuardianEvidenceValue,
  GuardianInvitationStatusValue,
  GuardianLinkSourceValue,
  GuardianLinkStatusValue,
  GuardianOnboardingActionValue,
} from '@shared/constants/guardianPortal'
import { apiFetch, queryKeys } from '@/lib/api-client'

// ─── Response types ───────────────────────────────────────

export interface GuardianContactDto {
  id: string
  kind: 'PHONE' | 'EMAIL'
  value: string
  verification: string
  isPreferred: boolean
}

export interface GuardianInvitationDto {
  id: string
  ref: string
  channel: 'EMAIL' | 'SLIP'
  status: GuardianInvitationStatusValue
  expiresAt: string
  issuedAt: string
  failedAttempts: number
}

export interface GuardianStudentRef {
  id: string
  firstName: string
  lastName: string
  registrationNo: string
  status: string
  classId: string | null
}

export interface GuardianLinkDto {
  id: string
  status: GuardianLinkStatusValue
  relationship: string
  relationshipNote: string | null
  evidence: GuardianEvidenceValue
  source: GuardianLinkSourceValue
  capabilities: GuardianCapability[]
  isPrimaryContact: boolean
  isFinancialResponsible: boolean
  reverifyRequired: boolean
  reverifyReason: string | null
  /** A possible duplicate of an existing guardian. Only the id is exposed. */
  suggestion: { profileId: string; method: string | null } | null
  statusReason: string | null
  approvedAt: string | null
  createdAt: string
  directoryEntryId: string | null
  student: GuardianStudentRef | null
  profile: {
    id: string
    fullName: string
    status: string
    hasAccount: boolean
    contacts: GuardianContactDto[]
  } | null
  invitations: GuardianInvitationDto[]
}

export interface GuardianQueueResponse { items: GuardianLinkDto[]; take: number }

export interface GuardianDirectoryCardDto {
  id: string
  fullName: string
  relation: string | null
  phone: string | null
  altPhone: string | null
  email: string | null
  isPrimary: boolean
  isFeePayer: boolean
  isEmergencyContact: boolean
}

export interface GuardianStudentView {
  student: GuardianStudentRef
  cards: GuardianDirectoryCardDto[]
  links: GuardianLinkDto[]
}

export interface GuardianSyncResult { proposed: number; skipped: number; existing: number; flagged: number }

export interface IssuedGuardianInvitation {
  invitationId: string
  ref: string
  channel: 'EMAIL' | 'SLIP'
  expiresAt: string
  /** Present for SLIP only: shown once, never retrievable again. */
  code?: string
  emailed?: boolean
}

export interface OnboardingDryRun {
  batchId: string
  cards: number
  byAction: Record<GuardianOnboardingActionValue, number>
  byFlag: Record<string, number>
  truncated: boolean
}

export interface OnboardingBatchReport {
  batch: {
    id: string
    status: 'DRY_RUN' | 'APPLYING' | 'APPLIED' | 'ROLLED_BACK'
    scope: unknown
    summary: unknown
    createdAt: string
    appliedAt: string | null
    rolledBackAt: string | null
  }
  items: Array<{
    id: string
    directoryEntryId: string
    studentId: string
    action: GuardianOnboardingActionValue
    reason: string | null
    flags: string[]
    createdLinkId: string | null
  }>
  take: number
}

export interface OnboardingApplyResult {
  batchId: string
  processed: number
  created: number
  skipped: number
  remaining: number
  status: 'APPLYING' | 'APPLIED'
}

export interface OnboardingRollbackResult { batchId: string; removed: number; kept: number }

export interface GuardianAccessLogRow {
  id: string
  profileId: string
  linkId: string | null
  studentId: string | null
  module: string
  outcome: string
  reason: string | null
  createdAt: string
}

// ─── Queries ──────────────────────────────────────────────

export const QUEUE_PAGE_SIZE = 50

export interface QueueFilter { status?: GuardianLinkStatusValue | null; reverify?: boolean; skip?: number }

/** The review queue. `status` and `reverify` are filters; the server pages with take/skip. */
export function useGuardianQueue(filter: QueueFilter) {
  const params = new URLSearchParams()
  if (filter.status) params.set('status', filter.status)
  if (filter.reverify) params.set('reverify', 'true')
  params.set('take', String(QUEUE_PAGE_SIZE))
  if (filter.skip) params.set('skip', String(filter.skip))
  return useQuery({
    queryKey: queryKeys.guardians.queue({ status: filter.status ?? null, reverify: filter.reverify === true, skip: filter.skip ?? 0 }),
    queryFn: () => apiFetch<GuardianQueueResponse>(`/guardians/queue?${params}`),
  })
}

/** One student's directory cards and guardian links. Disabled until a student is chosen. */
export function useGuardianStudentView(studentId: string | null) {
  return useQuery({
    queryKey: queryKeys.guardians.student(studentId ?? ''),
    queryFn: () => apiFetch<GuardianStudentView>(`/guardians/students/${studentId}`),
    enabled: Boolean(studentId),
  })
}

export function useOnboardingReport(batchId: string | null, action: GuardianOnboardingActionValue | null, skip = 0) {
  const params = new URLSearchParams({ take: '100' })
  if (action) params.set('action', action)
  if (skip) params.set('skip', String(skip))
  return useQuery({
    queryKey: queryKeys.guardians.onboarding(batchId ?? '', action, skip),
    queryFn: () => apiFetch<OnboardingBatchReport>(`/guardians/onboarding/${batchId}?${params}`),
    enabled: Boolean(batchId),
  })
}

/** The access log needs a student or a guardian profile to look at: the API refuses an unscoped query. */
export function useGuardianAccessLog(filter: { studentId?: string | null; profileId?: string | null }) {
  const params = new URLSearchParams()
  if (filter.studentId) params.set('studentId', filter.studentId)
  if (filter.profileId) params.set('profileId', filter.profileId)
  params.set('take', '100')
  return useQuery({
    queryKey: queryKeys.guardians.accessLog({ studentId: filter.studentId ?? null, profileId: filter.profileId ?? null }),
    queryFn: () => apiFetch<{ items: GuardianAccessLogRow[] }>(`/guardians/access-log?${params}`),
    enabled: Boolean(filter.studentId || filter.profileId),
  })
}

// ─── Mutations ────────────────────────────────────────────

function useGuardianMutation<TVars, TResult>(
  fn: (vars: TVars) => Promise<TResult>,
  meta: { successMessage?: string; failureTitle: string },
) {
  const qc = useQueryClient()
  return useMutation({
    meta,
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.guardians.all() }),
  })
}

const post = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, { method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) })

/** Turn a student's directory cards (the contact entries on their record) into pending guardian links. */
export function useSyncStudentGuardians() {
  return useGuardianMutation(
    (studentId: string) => post<GuardianSyncResult>(`/guardians/students/${studentId}/sync`),
    { failureTitle: 'Could not read the student’s guardian contacts' },
  )
}

export function useSetLinkEvidence() {
  return useGuardianMutation(
    ({ linkId, evidence }: { linkId: string; evidence: GuardianEvidenceValue }) =>
      post<unknown>(`/guardians/links/${linkId}/evidence`, { evidence }),
    { successMessage: 'Verification recorded', failureTitle: 'Could not record the verification' },
  )
}

export function useRepointLink() {
  return useGuardianMutation(
    ({ linkId, profileId }: { linkId: string; profileId: string }) =>
      post<unknown>(`/guardians/links/${linkId}/repoint`, { profileId }),
    { successMessage: 'Linked to the existing guardian', failureTitle: 'Could not re-link this guardian' },
  )
}

export function useApproveLink() {
  return useGuardianMutation(
    ({ linkId, capabilities, acknowledgeSuggestion }: {
      linkId: string; capabilities?: GuardianCapability[]; acknowledgeSuggestion?: boolean
    }) => post<unknown>(`/guardians/links/${linkId}/approve`, {
      ...(capabilities ? { capabilities } : {}),
      ...(acknowledgeSuggestion !== undefined ? { acknowledgeSuggestion } : {}),
    }),
    { successMessage: 'Guardian approved', failureTitle: 'Could not approve this guardian' },
  )
}

export type LinkTransition = 'reject' | 'suspend' | 'reinstate' | 'revoke' | 'reopen'

/** reject / suspend / revoke need a reason; reinstate / reopen take an optional one. */
export function useTransitionLink() {
  return useGuardianMutation(
    ({ linkId, action, reason }: { linkId: string; action: LinkTransition; reason?: string }) =>
      post<unknown>(`/guardians/links/${linkId}/${action}`, reason ? { reason } : {}),
    { successMessage: 'Guardian access updated', failureTitle: 'Could not update guardian access' },
  )
}

export function useConfirmReverified() {
  return useGuardianMutation(
    (linkId: string) => post<unknown>(`/guardians/links/${linkId}/reverified`),
    { successMessage: 'Marked as re-verified', failureTitle: 'Could not confirm re-verification' },
  )
}

export function useSetLinkCapabilities() {
  return useGuardianMutation(
    ({ linkId, capabilities }: { linkId: string; capabilities: GuardianCapability[] }) =>
      apiFetch<unknown>(`/guardians/links/${linkId}/capabilities`, { method: 'PATCH', body: JSON.stringify({ capabilities }) }),
    { successMessage: 'Access updated', failureTitle: 'Could not update what this guardian can see' },
  )
}

/** SLIP returns the plaintext code exactly once; EMAIL returns `emailed: true` and no code. */
export function useIssueInvitation() {
  return useGuardianMutation(
    ({ linkId, channel, contactId }: { linkId: string; channel: 'EMAIL' | 'SLIP'; contactId?: string }) =>
      post<IssuedGuardianInvitation>(`/guardians/links/${linkId}/invitations`, { channel, ...(contactId ? { contactId } : {}) }),
    { failureTitle: 'Could not issue the invitation' },
  )
}

export function useRevokeInvitation() {
  return useGuardianMutation(
    (invitationId: string) => apiFetch<{ ok: true }>(`/guardians/invitations/${invitationId}`, { method: 'DELETE' }),
    { successMessage: 'Invitation cancelled', failureTitle: 'Could not cancel the invitation' },
  )
}

export function useSuspendGuardianProfile() {
  return useGuardianMutation(
    ({ profileId, reason }: { profileId: string; reason: string }) =>
      post<unknown>(`/guardians/profiles/${profileId}/suspend`, { reason }),
    { successMessage: 'Guardian suspended across all their children', failureTitle: 'Could not suspend this guardian' },
  )
}

export function useReinstateGuardianProfile() {
  return useGuardianMutation(
    (profileId: string) => post<unknown>(`/guardians/profiles/${profileId}/reinstate`),
    { successMessage: 'Guardian reinstated', failureTitle: 'Could not reinstate this guardian' },
  )
}

// Onboarding (backfill) ------------------------------------------------------

export function useOnboardingDryRun() {
  return useGuardianMutation(
    (scope: { classId?: string; includeNotEnrolled?: boolean }) => post<OnboardingDryRun>('/guardians/onboarding/dry-run', scope),
    { successMessage: 'Preview ready. Nothing has been created yet.', failureTitle: 'Could not prepare the preview' },
  )
}

/** One chunk per call; the page calls again until `remaining` reaches 0. */
export function useApplyOnboarding() {
  return useGuardianMutation(
    ({ batchId, maxItems }: { batchId: string; maxItems?: number }) =>
      post<OnboardingApplyResult>(`/guardians/onboarding/${batchId}/apply`, maxItems ? { maxItems } : {}),
    { failureTitle: 'Could not continue creating guardians' },
  )
}

export function useRollbackOnboarding() {
  return useGuardianMutation(
    (batchId: string) => post<OnboardingRollbackResult>(`/guardians/onboarding/${batchId}/rollback`),
    { failureTitle: 'Could not undo this batch' },
  )
}
