/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/lib/__tests__/approvalsContract.test.ts
 * [PURPOSE]: Locks the Approvals Hub's shared contract to the REAL permission
 *   matrix. Each source's gate is meant to mirror the guard on the module's
 *   own approve/reject route; if someone renames a permission, or moves one
 *   between roles, these tests say which approval flow changed — instead of
 *   the hub silently granting (or hiding) actions.
 */

import { describe, expect, it } from 'vitest'
import {
  APPROVAL_SOURCES,
  APPROVAL_SOURCE_META,
  canReviewApprovalSource,
  isApprovalSource,
  passesApprovalGate,
  type ApprovalSource,
} from '@shared/constants/approvals'
import { ApprovalBulkBodySchema, ApprovalDecisionBodySchema, ApprovalListQuerySchema } from '@shared/schemas/approvals'
import { USER_ROLES, type UserRole } from '@shared/types/roles'

const reviewersOf = (source: ApprovalSource): UserRole[] =>
  USER_ROLES.filter((r) => canReviewApprovalSource(r, APPROVAL_SOURCE_META[source]))

describe('approval source metadata', () => {
  it('describes every source with its own key', () => {
    for (const source of APPROVAL_SOURCES) {
      expect(APPROVAL_SOURCE_META[source].source).toBe(source)
      expect(isApprovalSource(source)).toBe(true)
    }
    expect(isApprovalSource('nonsense')).toBe(false)
  })

  it('gives every source at least one role that can review it', () => {
    for (const source of APPROVAL_SOURCES) {
      expect(reviewersOf(source).length, `${source} has no reviewer`).toBeGreaterThan(0)
    }
  })

  it('requires a reason wherever a source can be rejected or returned', () => {
    for (const source of APPROVAL_SOURCES) {
      const m = APPROVAL_SOURCE_META[source]
      if (m.reject || m.return) expect(m.reasonRequired, source).toBe(true)
    }
  })

  it('never lets a student review anything', () => {
    for (const source of APPROVAL_SOURCES) {
      expect(canReviewApprovalSource('student', APPROVAL_SOURCE_META[source]), `student → ${source}`).toBe(false)
    }
  })
})

describe('gates mirror each module’s own route guard', () => {
  it('leave: admin, hr and high_rank only (routes/hr.ts REVIEWERS)', () => {
    expect(reviewersOf('leave').sort()).toEqual(['admin', 'high_rank', 'hr'])
  })

  it('expenses: admin + high_rank approve, but only holders of finance.rejectExpense reject', () => {
    const m = APPROVAL_SOURCE_META.expense
    expect(passesApprovalGate('admin', m.approve)).toBe(true)
    expect(passesApprovalGate('high_rank', m.approve)).toBe(true)
    expect(passesApprovalGate('lower_rank', m.approve)).toBe(false)
    expect(passesApprovalGate('finance', m.approve)).toBe(false)
    expect(passesApprovalGate('finance', m.reject)).toBe(false)
  })

  it('student/class change requests are reviewed by admin and high_rank, never by the lower_rank who files them', () => {
    const m = APPROVAL_SOURCE_META.pending_action
    expect(passesApprovalGate('admin', m.approve)).toBe(true)
    expect(passesApprovalGate('high_rank', m.approve)).toBe(true)
    expect(passesApprovalGate('lower_rank', m.approve)).toBe(false)
    expect(passesApprovalGate('academic', m.approve)).toBe(false)
  })

  it('payroll can be approved or returned, but not "rejected" outright', () => {
    const m = APPROVAL_SOURCE_META.payroll
    expect(m.reject).toBeUndefined()
    expect(m.return).toBeDefined()
  })

  it('digital resources can only be approved (nothing in the system can reject them)', () => {
    const m = APPROVAL_SOURCE_META.digital_resource
    expect(m.reject).toBeUndefined()
    expect(m.return).toBeUndefined()
  })

  it('an empty gate grants nothing', () => {
    expect(passesApprovalGate('admin', undefined)).toBe(false)
    expect(passesApprovalGate('admin', {})).toBe(false)
    expect(passesApprovalGate('admin', { roles: [], anyPermission: [] })).toBe(false)
  })
})

describe('request schemas', () => {
  it('applies list defaults and rejects unknown statuses', () => {
    const ok = ApprovalListQuerySchema.parse({})
    expect(ok).toMatchObject({ scope: 'all', sort: 'newest', page: 1, pageSize: 20 })
    expect(ApprovalListQuerySchema.safeParse({ status: 'MAYBE' }).success).toBe(false)
    expect(ApprovalListQuerySchema.safeParse({ pageSize: 500 }).success).toBe(false)
  })

  it('coerces page numbers from the query string', () => {
    expect(ApprovalListQuerySchema.parse({ page: '3', pageSize: '10' })).toMatchObject({ page: 3, pageSize: 10 })
  })

  it('only allows the four decision actions', () => {
    expect(ApprovalDecisionBodySchema.safeParse({ action: 'approve' }).success).toBe(true)
    expect(ApprovalDecisionBodySchema.safeParse({ action: 'delete' }).success).toBe(false)
  })

  it('caps bulk requests and forbids bulk withdraw', () => {
    const item = { source: 'leave', sourceId: 'x' } as const
    expect(ApprovalBulkBodySchema.safeParse({ action: 'approve', items: [item] }).success).toBe(true)
    expect(ApprovalBulkBodySchema.safeParse({ action: 'cancel', items: [item] }).success).toBe(false)
    expect(ApprovalBulkBodySchema.safeParse({ action: 'approve', items: [] }).success).toBe(false)
    expect(
      ApprovalBulkBodySchema.safeParse({ action: 'approve', items: Array.from({ length: 51 }, () => item) }).success,
    ).toBe(false)
  })
})
