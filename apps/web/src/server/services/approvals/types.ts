/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/server/services/approvals/types.ts
 * [PURPOSE]: The contract every Approvals Hub adapter implements. An adapter
 *   knows how to (1) read one module's approval rows and normalise them into
 *   the shared ApprovalItem shape, (2) count them by unified status, and
 *   (3) hand a decision back to that module's own service function.
 *   Adapters never decide permissions or self-review rules — the hub does,
 *   from the shared APPROVAL_SOURCE_META gates — and they never write the
 *   audit trail or notifications, so those stay uniform across modules.
 */

import type { ApprovalItem, ApprovalSource, ApprovalStatus } from '@shared/constants/approvals'
import type { UserRole } from '@shared/types/roles'

export type StatusCounts = Record<ApprovalStatus, number>

/** What an adapter returns; the hub adds `capabilities` and `isMine`. */
export type AdapterItem = Omit<ApprovalItem, 'capabilities' | 'isMine'>

export interface ApprovalActor {
  uid: string
  role: UserRole
}

export interface AdapterQuery {
  /** null = every status the source can express. */
  statuses: readonly ApprovalStatus[] | null
  /** Only rows submitted by this uid; null = everyone's. */
  requesterUid: string | null
  dateFrom: Date | null
  dateTo: Date | null
  order: 'asc' | 'desc'
  /** Hard cap on rows returned by this one adapter. */
  take: number
}

export interface DecisionInput {
  notes?: string
  /** Expense approvals only. */
  paidImmediately?: boolean
}

export interface ApprovalAdapter {
  readonly source: ApprovalSource
  /**
   * true when the module's own approve/reject already notifies the requester
   * (e.g. leave emails the applicant) — the hub then skips its own notice so
   * nobody is told twice.
   */
  readonly notifiesRequester?: boolean
  list(q: AdapterQuery): Promise<AdapterItem[]>
  /** Unified-status tallies. requesterUid null = everyone's. */
  counts(requesterUid: string | null): Promise<StatusCounts>
  get(id: string): Promise<AdapterItem | null>
  approve(id: string, actor: ApprovalActor, input: DecisionInput): Promise<void>
  reject?(id: string, actor: ApprovalActor, input: DecisionInput & { notes: string }): Promise<void>
  return?(id: string, actor: ApprovalActor, input: DecisionInput & { notes: string }): Promise<void>
  cancel?(id: string, actor: ApprovalActor): Promise<void>
}
