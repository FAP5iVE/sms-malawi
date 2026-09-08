/**
 * [CHANGE TYPE]: TARGETED EDIT (OVERHAUL)
 * [FILE]: packages/shared/schemas/placement.ts
 * [R-PHASE]: R18 — University Placement Module, redesigned against the
 *   "Malawi Higher Education Placement & Advisory" reference module.
 * [PURPOSE]: Zod request schemas for the placement domain. The old
 *   ranked-choices pipeline (SetChoicesSchema / RecordOutcomeSchema /
 *   VerifyOutcomeSchema / BatchGenerateSchema) is gone — replaced by the
 *   reference module's three-status workflow:
 *     - StaffPlacementEntrySchema — staff record an official, immediately
 *       CONFIRMED placement for a graduating candidate.
 *     - StudentClaimSchema        — a graduated student self-reports their
 *       own selection; goes to PENDING_APPROVAL.
 *     - RejectClaimSchema         — a staff verifier rejects a claim with a
 *       reason; ApproveClaimSchema is not needed (approve takes no body).
 *   The Advisory qualification-checker schemas are unchanged — the
 *   calculator itself was already correct and is reused as-is.
 *
 *   Catalogue-vs-free-text rule (unchanged): a destination references EITHER
 *   a curated catalogue programme (placedUniversityId + placedProgrammeId,
 *   keys into @shared/constants/universities) OR a free-text university/
 *   programme (private/foreign, off-catalogue) — never a mix, never neither.
 * [DEPENDS ON]: none (Prisma enums are mirrored here as z.enum because
 *   Prisma enums cannot be imported client-side)
 */
import { z } from 'zod'

// Mirrors the Prisma PlacementStatus / PlacementEntrySource enums.
export const PlacementStatusSchema = z.enum(['PENDING_APPROVAL', 'CONFIRMED', 'REJECTED'])
export const PlacementEntrySourceSchema = z.enum(['STAFF_OFFICIAL', 'STUDENT_CLAIM'])

// ─────────────────────────────────────────────────────────
//  SHARED DESTINATION REFINEMENT
// ─────────────────────────────────────────────────────────
// Both staff entries and student claims name a destination the same way;
// this one refinement function is applied inside each schema's superRefine
// so the two error messages/rules can never drift apart.
function refineDestination(
  val: {
    placedUniversityId?: string
    placedProgrammeId?: string
    placedUniversityName?: string
    placedProgrammeName?: string
  },
  ctx: z.RefinementCtx,
): void {
  const hasCatalogue = Boolean(val.placedUniversityId && val.placedProgrammeId)
  const hasFreeText = Boolean(val.placedUniversityName && val.placedProgrammeName)
  if (hasCatalogue === hasFreeText) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        'Name either a catalogue programme (placedUniversityId + placedProgrammeId) or a free-text programme (placedUniversityName + placedProgrammeName), not both and not neither.',
    })
  }
}

const destinationFields = {
  placedUniversityId:   z.string().min(1).optional(),
  placedProgrammeId:    z.string().min(1).optional(),
  placedUniversityName: z.string().min(1).max(200).optional(),
  placedProgrammeName:  z.string().min(1).max(200).optional(),
}

// ─────────────────────────────────────────────────────────
//  STAFF PLACEMENT ENTRY
// ─────────────────────────────────────────────────────────
// Staff cross-reference the official NCHE selection list against a
// graduating candidate (picked from GET /placements/eligible, which is why
// this carries manebRecordId directly rather than a raw studentId — the
// service resolves the student from the certified MSCE record). Always
// results in an immediately CONFIRMED record, upserted by manebRecordId, so
// re-submitting the same candidate edits their existing entry.
export const StaffPlacementEntrySchema = z
  .object({
    manebRecordId: z.string().min(1),
    admissionYear: z.string().min(4).max(9),
    ...destinationFields,
    ncheBatchRef: z.string().min(1).max(200),
    notes: z.string().max(2000).optional(),
  })
  .superRefine(refineDestination)

// ─────────────────────────────────────────────────────────
//  STUDENT CLAIM PORTAL
// ─────────────────────────────────────────────────────────
// A graduated student reports that they were selected, citing where their
// name appears on the published gazette. Always lands as PENDING_APPROVAL —
// never auto-confirmed — until a staff member with placement.verifyOutcome
// approves or rejects it. Server-side, submission is additionally gated on
// Student.status === 'GRADUATED' and a certified MSCE record existing.
export const StudentClaimSchema = z
  .object({
    admissionYear: z.string().min(4).max(9),
    ...destinationFields,
    ncheBatchRef: z.string().min(1).max(200, 'Cite the gazette page/reference where your name appears.'),
    claimProofNote: z.string().max(2000).optional(),
  })
  .superRefine(refineDestination)

// ─────────────────────────────────────────────────────────
//  CLAIMS VERIFICATION DESK
// ─────────────────────────────────────────────────────────
// Approve takes no body (PATCH /placements/:id/approve). Reject requires a
// reason so the student understands why their claim was turned down.
export const RejectClaimSchema = z.object({
  reason: z.string().min(5, 'Give a reason for the rejection.').max(2000),
})

// ─────────────────────────────────────────────────────────
//  ADVISORY QUALIFICATION CHECKER (self-service, all roles)
// ─────────────────────────────────────────────────────────
// Anyone types a set of subject grades (MSCE scale 1..9, 1 = best) and the
// engine returns the programmes that qualify — a staff member can run this
// on behalf of a student just as easily as a student can run it themselves.
// The subjects are constrained to the canonical MALAWI_SUBJECTS list on the
// client; the server re-validates the grade range here and drops any
// unknown subject. This never touches any student's real record — it is a
// pure calculator over manually entered grades.
export const AdvisoryGradeSchema = z.object({
  subject: z.string().min(1).max(60),
  grade:   z.number().int().min(1, 'MSCE grades run 1-9').max(9, 'MSCE grades run 1-9'),
})

export const AdvisoryProgrammeRefSchema = z.object({
  universityId: z.string().min(1),
  programmeId:  z.string().min(1),
})

export const AdvisoryCheckSchema = z.object({
  grades: z.array(AdvisoryGradeSchema)
    .min(1, 'Enter at least one subject grade')
    .max(15, 'Too many subjects'),
  // Optional: specific programmes to check (min 3 when given).
  // Omit to just get the top recommended programmes for the entered grades.
  programmes: z.array(AdvisoryProgrammeRefSchema)
    .min(3, 'Choose at least three programmes to check')
    .max(20)
    .optional(),
})

export type AdvisoryGrade      = z.infer<typeof AdvisoryGradeSchema>
export type AdvisoryCheckInput = z.infer<typeof AdvisoryCheckSchema>

// ─────────────────────────────────────────────────────────
//  AI EXPLANATION (optional, additive — Gemini API layer)
// ─────────────────────────────────────────────────────────
// Same grades + a single programme reference as the advisory checker, plus
// an optional bounded follow-up question. The server always recomputes
// eligibility itself from `grades` before it ever reaches the model — see
// placementAdvisoryAIService.ts. This schema exists only to validate shape
// and cap the question length; it grants no trust over what the client
// claims the result already is.
export const ExplainRecommendationSchema = z.object({
  grades: z.array(AdvisoryGradeSchema).min(1).max(15),
  universityId: z.string().min(1),
  programmeId: z.string().min(1),
  question: z.string().max(300).optional(),
})

export type ExplainRecommendationInput = z.infer<typeof ExplainRecommendationSchema>

export type PlacementStatusValue      = z.infer<typeof PlacementStatusSchema>
export type PlacementEntrySourceValue = z.infer<typeof PlacementEntrySourceSchema>
export type StaffPlacementEntryInput  = z.infer<typeof StaffPlacementEntrySchema>
export type StudentClaimInput         = z.infer<typeof StudentClaimSchema>
export type RejectClaimInput          = z.infer<typeof RejectClaimSchema>
