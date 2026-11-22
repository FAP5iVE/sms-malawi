/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/server/services/approvals/registry.ts
 * [PURPOSE]: The one list of approval adapters. To bring a new module into
 *   the Approvals Hub: (1) add its key + metadata to APPROVAL_SOURCE_META in
 *   @shared/constants/approvals, (2) write an adapter that implements
 *   ApprovalAdapter, (3) register it here. The record type makes step 3 a
 *   compile error to forget.
 */

import 'server-only'
import type { ApprovalSource } from '@shared/constants/approvals'
import type { ApprovalAdapter } from './types'
import { pendingActionAdapter } from './pendingActionAdapter'
import { leaveAdapter, loanAdapter } from './hrAdapters'
import { expenseAdapter, payrollAdapter } from './financeAdapters'
import { fineWaiverAdapter, bookRecommendationAdapter, digitalResourceAdapter } from './libraryAdapters'
import { assetRequestAdapter, requisitionAdapter, purchaseOrderAdapter } from './assetProcurementAdapters'
import { timetableSlotAdapter, examResultsAdapter } from './academicAdapters'
import { applicationAdapter, placementClaimAdapter } from './admissionsAdapters'
import { announcementAdapter } from './announcementAdapter'

export const ADAPTERS: Readonly<Record<ApprovalSource, ApprovalAdapter>> = {
  pending_action: pendingActionAdapter,
  leave: leaveAdapter,
  loan: loanAdapter,
  expense: expenseAdapter,
  payroll: payrollAdapter,
  fine_waiver: fineWaiverAdapter,
  book_recommendation: bookRecommendationAdapter,
  digital_resource: digitalResourceAdapter,
  asset_request: assetRequestAdapter,
  requisition: requisitionAdapter,
  purchase_order: purchaseOrderAdapter,
  timetable_slot: timetableSlotAdapter,
  exam_results: examResultsAdapter,
  application: applicationAdapter,
  placement_claim: placementClaimAdapter,
  announcement: announcementAdapter,
}
