/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: packages/shared/schemas/approvals.ts
 * [PURPOSE]: Zod schemas for the Approvals Hub request surface — list
 *   filters, single decisions and bulk decisions. Shared so the route and
 *   any client-side validation agree on the exact limits.
 * [DEPENDS ON]: zod, ../constants/approvals
 */

import { z } from 'zod'
import {
  APPROVAL_BULK_LIMIT,
  APPROVAL_MODULES,
  APPROVAL_NOTES_MAX,
  APPROVAL_SOURCES,
  APPROVAL_STATUSES,
} from '../constants/approvals'

const isoDate = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Must be a valid date.')

export const ApprovalListQuerySchema = z.object({
  scope:    z.enum(['all', 'review', 'mine']).default('all'),
  status:   z.enum(APPROVAL_STATUSES).optional(),
  module:   z.enum(APPROVAL_MODULES).optional(),
  source:   z.enum(APPROVAL_SOURCES).optional(),
  search:   z.string().trim().max(100).optional(),
  from:     isoDate.optional(),
  to:       isoDate.optional(),
  sort:     z.enum(['newest', 'oldest']).default('newest'),
  page:     z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
})

export const ApprovalSummaryQuerySchema = z.object({
  scope: z.enum(['all', 'review', 'mine']).default('all'),
})

export const ApprovalDecisionBodySchema = z.object({
  action: z.enum(['approve', 'reject', 'return', 'cancel']),
  notes:  z.string().trim().max(APPROVAL_NOTES_MAX).optional(),
  /** Expense approvals only: post as paid (Cash) vs owed (Accounts Payable). */
  paidImmediately: z.boolean().optional(),
})

export const ApprovalBulkBodySchema = z.object({
  action: z.enum(['approve', 'reject', 'return']),
  notes:  z.string().trim().max(APPROVAL_NOTES_MAX).optional(),
  paidImmediately: z.boolean().optional(),
  items: z
    .array(
      z.object({
        source:   z.enum(APPROVAL_SOURCES),
        sourceId: z.string().min(1).max(200),
      }),
    )
    .min(1)
    .max(APPROVAL_BULK_LIMIT),
})

export type ApprovalListQuery = z.infer<typeof ApprovalListQuerySchema>
export type ApprovalDecisionBody = z.infer<typeof ApprovalDecisionBodySchema>
export type ApprovalBulkBody = z.infer<typeof ApprovalBulkBodySchema>
