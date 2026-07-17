/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: packages/shared/schemas/placement.ts
 * [R-PHASE]: R18 — University Placement Module (Phase 11 Blueprint)
 * [PURPOSE]: Zod request schemas for the placement domain — the validation
 *   boundary every placements route parses through before touching the
 *   service layer (matching the .safeParse-in-route convention used across
 *   the codebase). Covers: recording/replacing a student's ranked choices,
 *   recording a placement outcome (self-reported by the student or entered by
 *   staff), verifying an outcome, and the batch-generate cohort trigger.
 *
 *   Catalogue-vs-free-text rule: a choice or outcome references EITHER a
 *   curated catalogue programme (universityId + programmeId, both keys into
 *   @shared/constants/universities) OR a free-text university/programme
 *   (private/foreign, off-catalogue) — never a mix, never neither. The
 *   schemas enforce this with a superRefine so the route rejects malformed
 *   payloads before the service runs; the service re-checks catalogue keys
 *   against the constants file (a schema cannot see the catalogue).
 * [DEPENDS ON]: none (Prisma PlacementStatus enum is mirrored here as a
 *   z.enum because Prisma enums cannot be imported client-side — same pattern
 *   as ExamStatusSchema in exam.ts)
 */
import { z } from 'zod'

// Mirrors the Prisma PlacementStatus enum (not importable client-side).
export const PlacementStatusSchema = z.enum([
  'NOT_STARTED',
  'ELIGIBILITY_COMPUTED',
  'CHOICES_RECORDED',
  'PLACED',
  'CONFIRMED',
  'DECLINED',
  'NOT_PLACED',
])

// A single ranked choice. Exactly one of {universityId+programmeId} (catalogue)
// or {universityNameFreeText+programmeNameFreeText} (free-text) must be set.
export const PlacementChoiceInputSchema = z
  .object({
    rank:                   z.number().int().min(1).max(20),
    universityId:           z.string().min(1).optional(),
    programmeId:            z.string().min(1).optional(),
    universityNameFreeText: z.string().min(1).max(200).optional(),
    programmeNameFreeText:  z.string().min(1).max(200).optional(),
  })
  .superRefine((val, ctx) => {
    const hasCatalogue = Boolean(val.universityId && val.programmeId)
    const hasFreeText = Boolean(val.universityNameFreeText && val.programmeNameFreeText)
    if (hasCatalogue === hasFreeText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Each choice must reference either a catalogue programme (universityId + programmeId) or a free-text programme (universityNameFreeText + programmeNameFreeText), not both and not neither.',
      })
    }
    if (val.universityId && !val.programmeId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'programmeId is required when universityId is provided.' })
    }
    if (val.universityNameFreeText && !val.programmeNameFreeText) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'programmeNameFreeText is required when universityNameFreeText is provided.' })
    }
  })

// Replace a placement's ranked choice list. Ranks must be unique.
export const SetChoicesSchema = z
  .object({
    choices: z.array(PlacementChoiceInputSchema).min(1).max(20),
  })
  .superRefine((val, ctx) => {
    const ranks = val.choices.map((c) => c.rank)
    if (new Set(ranks).size !== ranks.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Choice ranks must be unique.' })
    }
  })

// Record (or update) a placement outcome. Exactly one of the catalogue pair or
// the free-text pair identifies where the student was placed.
export const RecordOutcomeSchema = z
  .object({
    status:               PlacementStatusSchema.extract(['PLACED', 'CONFIRMED', 'DECLINED', 'NOT_PLACED']),
    placedUniversityId:   z.string().min(1).optional(),
    placedProgrammeId:    z.string().min(1).optional(),
    placedUniversityName: z.string().min(1).max(200).optional(),
    placedProgrammeName:  z.string().min(1).max(200).optional(),
    notes:                z.string().max(2000).optional(),
  })
  .superRefine((val, ctx) => {
    // NOT_PLACED needs no destination; every other status needs exactly one pair.
    if (val.status === 'NOT_PLACED') return

    const hasCatalogue = Boolean(val.placedUniversityId && val.placedProgrammeId)
    const hasFreeText = Boolean(val.placedUniversityName && val.placedProgrammeName)
    if (hasCatalogue === hasFreeText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'A placement outcome must name either a catalogue programme (placedUniversityId + placedProgrammeId) or a free-text programme (placedUniversityName + placedProgrammeName), not both and not neither.',
      })
    }
  })

// High-rank verification of a recorded outcome.
export const VerifyOutcomeSchema = z.object({
  isVerified: z.boolean(),
  notes:      z.string().max(2000).optional(),
})

// Batch-generate eligibility for a whole cohort (an academic year's Form 4
// certified-MSCE students). No per-student body — the service resolves the
// eligible cohort itself.
export const BatchGenerateSchema = z.object({
  academicYear: z.string().min(1),
})

export type PlacementStatusValue    = z.infer<typeof PlacementStatusSchema>
export type PlacementChoiceInput     = z.infer<typeof PlacementChoiceInputSchema>
export type SetChoicesInput          = z.infer<typeof SetChoicesSchema>
export type RecordOutcomeInput       = z.infer<typeof RecordOutcomeSchema>
export type VerifyOutcomeInput       = z.infer<typeof VerifyOutcomeSchema>
export type BatchGenerateInput       = z.infer<typeof BatchGenerateSchema>
