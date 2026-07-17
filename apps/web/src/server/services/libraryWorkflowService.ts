/**
 * apps/web/src/server/services/libraryWorkflowService.ts — Phase D12
 *
 * [CHANGE TYPE]: MAJOR REWRITE
 * [R-PHASE]: R12 — Library Domain & the Storage API Contract Fix
 * [PURPOSE]: Both workflows below were confirmed dead code with zero
 *   callers at any layer, and createFineWaiverRequest()/approveFineWaiver()
 *   referenced two things that did not exist on LibraryFine: a `balance`
 *   column and a `borrowing` relation. Rather than deleting a fully-designed,
 *   complete-cycle pair of workflows with genuine standalone value (a
 *   student/parent requesting a fine waiver, and a student/staff member
 *   recommending a new acquisition, are both real school-library needs not
 *   implemented anywhere else), this phase fixes the schema mismatch and
 *   wires the feature in:
 *     1. `fine.borrowing` now resolves for real — LibraryFine.borrowingId
 *        (schema, this phase) formalizes the relation this file already
 *        assumed existed.
 *     2. `fine.balance` never existed as a stored column and still doesn't
 *        — this codebase has no partial-payment concept for library fines
 *        anywhere else (finances.ts's PATCH .../pay always marks a fine
 *        fully PAID in one step), so a stored "amountPaid" column would
 *        model a capability nothing else uses. balance is instead computed
 *        here as `status === 'PENDING' ? amount : 0` — the "equivalent real
 *        fields" the roadmap's own bullet allows for.
 *   Both workflows are otherwise unchanged from their original design.
 * [DEPENDS ON]: apps/web/prisma/schema.prisma (LibraryFine.borrowingId —
 *   same phase), apps/web/src/server/routes/library.ts (this phase's new
 *   POST/PATCH /recommendations and /fine-waivers routes, which are the
 *   first real callers this file has ever had)
 *
 * Two library workflow engines:
 *
 * 1. Resource Recommendation
 *    Staff and students can recommend new books or digital resources.
 *    The recommendation requires library staff approval before appearing
 *    in the catalogue.
 *    Status: PENDING → APPROVED | REJECTED
 *
 * 2. Library Fine Waiver
 *    Students or staff can request a waiver on a library fine.
 *    Library staff reviews and approves or rejects with a reason.
 *    On approval, the fine balance is zeroed and the linked finance
 *    record is updated.
 *    Status: PENDING → APPROVED | REJECTED
 */

import 'server-only'
import { prisma }    from '@/lib/prisma'
import { logger }    from '@/lib/logger'

// ─────────────────────────────────────────────────────────────────────────────
// RESOURCE RECOMMENDATIONS
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateRecommendationInput {
  requestedByUid: string
  title:          string
  author?:        string
  isbn?:          string
  type:           'BOOK' | 'EBOOK' | 'JOURNAL' | 'OTHER'
  subject?:       string
  reason:         string
}

export async function createRecommendation(
  input: CreateRecommendationInput,
): Promise<string> {
  const rec = await prisma.resourceRecommendation.create({
    data: {
      requestedByUid: input.requestedByUid,
      title:          input.title,
      author:         input.author,
      isbn:           input.isbn,
      type:           input.type,
      subject:        input.subject,
      reason:         input.reason,
      status:         'PENDING',
    },
  })
  logger.info({ event: 'library.recommendation.created', id: rec.id, title: input.title })
  return rec.id
}

export async function approveRecommendation(
  id:        string,
  actorUid:  string,
  notes?:    string,
): Promise<void> {
  await prisma.resourceRecommendation.update({
    where: { id },
    data:  { status: 'APPROVED', reviewedByUid: actorUid, reviewNotes: notes, reviewedAt: new Date() },
  })
  logger.info({ event: 'library.recommendation.approved', id, actorUid })
}

export async function rejectRecommendation(
  id:       string,
  actorUid: string,
  reason:   string,
): Promise<void> {
  await prisma.resourceRecommendation.update({
    where: { id },
    data:  { status: 'REJECTED', reviewedByUid: actorUid, reviewNotes: reason, reviewedAt: new Date() },
  })
  logger.info({ event: 'library.recommendation.rejected', id, actorUid })
}

export async function listRecommendations(
  status?: 'PENDING' | 'APPROVED' | 'REJECTED',
) {
  return prisma.resourceRecommendation.findMany({
    where:   status ? { status } : {},
    orderBy: { createdAt: 'desc' },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// FINE WAIVER WORKFLOW
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateFineWaiverInput {
  fineId:          string
  requestedByUid:  string
  reason:          string
}

/** balance is computed, never stored — see this file's header comment. */
function fineBalance(fine: { amount: import('@prisma/client/runtime/library').Decimal; status: string }): number {
  return fine.status === 'PENDING' ? Number(fine.amount) : 0
}

export async function createFineWaiverRequest(
  input: CreateFineWaiverInput,
): Promise<string> {
  // Confirm the fine exists and has a balance
  const fine = await prisma.libraryFine.findUniqueOrThrow({
    where: { id: input.fineId },
  })

  const balance = fineBalance(fine)
  if (balance <= 0) {
    throw new Error('This fine has no outstanding balance — waiver not needed.')
  }

  // Check no existing pending waiver for this fine
  const existing = await prisma.fineWaiverRequest.findFirst({
    where: { fineId: input.fineId, status: 'PENDING' },
  })
  if (existing) {
    throw new Error('A waiver request for this fine is already pending.')
  }

  const req = await prisma.fineWaiverRequest.create({
    data: {
      fineId:          input.fineId,
      requestedByUid:  input.requestedByUid,
      reason:          input.reason,
      amount:          balance,
      status:          'PENDING',
    },
  })

  logger.info({ event: 'library.waiver.requested', id: req.id, fineId: input.fineId })
  return req.id
}

export async function approveFineWaiver(
  waiverId:  string,
  actorUid:  string,
): Promise<void> {
  const waiver = await prisma.fineWaiverRequest.findUniqueOrThrow({
    where:   { id: waiverId },
    include: { fine: true },
  })

  if (waiver.status !== 'PENDING') {
    throw new Error(`Waiver ${waiverId} is already ${waiver.status}`)
  }

  await prisma.$transaction([
    // Waiving the fine zeroes its balance by moving it to WAIVED status —
    // balance is computed from status (this file's header comment), so no
    // separate balance column needs zeroing.
    prisma.libraryFine.update({
      where: { id: waiver.fineId },
      data:  { status: 'WAIVED', waivedAt: new Date(), waivedByUid: actorUid },
    }),
    // Mark waiver as approved
    prisma.fineWaiverRequest.update({
      where: { id: waiverId },
      data:  { status: 'APPROVED', reviewedByUid: actorUid, reviewedAt: new Date() },
    }),
  ])

  logger.info({ event: 'library.waiver.approved', waiverId, fineId: waiver.fineId, actorUid })
}

export async function rejectFineWaiver(
  waiverId:  string,
  reason:    string,
  actorUid:  string,
): Promise<void> {
  const waiver = await prisma.fineWaiverRequest.findUniqueOrThrow({ where: { id: waiverId } })
  if (waiver.status !== 'PENDING') {
    throw new Error(`Waiver ${waiverId} is already ${waiver.status}`)
  }

  await prisma.fineWaiverRequest.update({
    where: { id: waiverId },
    data:  { status: 'REJECTED', reviewNotes: reason, reviewedByUid: actorUid, reviewedAt: new Date() },
  })

  logger.info({ event: 'library.waiver.rejected', waiverId, actorUid })
}

export async function listFineWaiverRequests(
  status?: 'PENDING' | 'APPROVED' | 'REJECTED',
) {
  return prisma.fineWaiverRequest.findMany({
    where:   status ? { status } : {},
    include: {
      fine: {
        include: {
          borrowing: {
            include: {
              student: { select: { firstName: true, lastName: true, registrationNo: true } },
              book:    { select: { title: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
}
