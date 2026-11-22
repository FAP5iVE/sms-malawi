/**
 * apps/web/src/server/lib/selfReview.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: One shared separation-of-duties guard (Issue 7, authorization
 *   parity). The Approvals Hub already blocks a reviewer from deciding their
 *   OWN request (APPROVAL_SOURCE_META[*].blockSelfReview), but the original
 *   per-module endpoints (PATCH /hr/leave/requests/:id/review,
 *   /hr/loans/:id/approve, /finances/expenses/:id/approve, /payroll/runs/:id/approve,
 *   /library/fine-waivers/:id/approve, /assets/requests/:id/approve ...) are
 *   independently invocable, so the same decision could be taken there and
 *   the Hub's rule bypassed. Each of those services now calls this guard so
 *   every entry point enforces the same rule.
 *
 *   The rule applies to the super user too (matching approvals/types.ts:
 *   "alpha_admin passes every approval gate (self-review blocking still
 *   applies)").
 */
import 'server-only'

export class SelfReviewError extends Error {
  readonly status = 403
  constructor(what: string) {
    super(`You cannot review your own ${what}. Another authorised person must decide it.`)
    this.name = 'SelfReviewError'
  }
}

/**
 * Throws a 403 SelfReviewError when the reviewer is the person who raised /
 * prepared the item. A missing requester uid (legacy rows) is not blocked —
 * there is nothing to compare, and failing closed would strand those rows.
 */
export function assertNotSelfReview(
  requesterUid: string | null | undefined,
  actorUid: string,
  what: string,
): void {
  if (requesterUid && requesterUid === actorUid) throw new SelfReviewError(what)
}
