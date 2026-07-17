/**
 * apps/web/src/server/services/placementService.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [R-PHASE]: R18 — University Placement Module (Phase 11 Blueprint)
 * [PURPOSE]: The placement domain's data/orchestration layer. Owns every
 *   UniversityPlacement / PlacementChoice read and write, delegates all
 *   eligibility maths to the pure placementMatchingService, and validates
 *   every catalogue reference against @shared/constants/universities before
 *   it is persisted. Every mutation writes an auditService.log entry.
 *
 *   ADVISORY, MSCE-ONLY. A placement is only ever generated from a certified
 *   MSCE ManebRecord (isManebRecordPlacementReady gate). Form 2 / JCE records
 *   never yield a placement — attempting to generate one for a JCE record
 *   throws, and listPlacementEligibleStudents restricts the cohort to Form 4
 *   students holding a placement-ready MSCE record (never Student.status
 *   alone, which is a coarse lifecycle flag, not proof of a certificate).
 *
 *   CATALOGUE-VS-FREE-TEXT INVARIANT. For any recorded choice or outcome,
 *   exactly one of {catalogue id pair, free-text name pair} is populated. The
 *   Zod schema enforces the shape; this service additionally verifies that
 *   catalogue ids actually resolve in the constants file (a schema can't see
 *   the catalogue), rejecting stale/typo'd ids before they reach the DB.
 * [DEPENDS ON]: @/lib/prisma, @/lib/logger, @/server/services/auditService,
 *   @/server/services/placementMatchingService, @/server/services/studentService,
 *   @shared/constants/universities, @shared/schemas/placement
 */
import 'server-only'

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import * as auditService from '@/server/services/auditService'
import * as notificationService from '@/server/services/notificationService'
import {
  isManebRecordPlacementReady,
  parseMsceGrades,
  computeEligibility,
  generateRecommendations,
} from '@/server/services/placementMatchingService'
import {
  UNIVERSITIES,
  findUniversity,
  findProgram,
  getAllPrograms,
} from '@shared/constants/universities'
import type {
  SetChoicesInput,
  RecordOutcomeInput,
  VerifyOutcomeInput,
} from '@shared/schemas/placement'
import type { UserRole } from '@shared/types/roles'

// ─────────────────────────────────────────────────────────
//  ERRORS
// ─────────────────────────────────────────────────────────

function httpError(message: string, status: number): Error {
  return Object.assign(new Error(message), { status })
}

// ─────────────────────────────────────────────────────────
//  CATALOGUE VALIDATION
// ─────────────────────────────────────────────────────────

/** Throw 400 if a catalogue university/programme id pair does not resolve. */
function assertCataloguePairResolves(universityId: string, programmeId: string): void {
  const uni = findUniversity(universityId)
  if (!uni) throw httpError(`Unknown university id: ${universityId}`, 400)
  const prog = findProgram(universityId, programmeId)
  if (!prog) throw httpError(`Unknown programme id '${programmeId}' for university '${universityId}'`, 400)
}

// ─────────────────────────────────────────────────────────
//  READS
// ─────────────────────────────────────────────────────────

const placementInclude = {
  choices: { orderBy: { rank: 'asc' } },
} as const

export async function getPlacementForStudent(studentId: string) {
  return prisma.universityPlacement.findFirst({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
    include: placementInclude,
  })
}

export async function getPlacementById(id: string) {
  return prisma.universityPlacement.findUnique({
    where: { id },
    include: placementInclude,
  })
}

export async function listPlacements(opts: { status?: string } = {}) {
  return prisma.universityPlacement.findMany({
    where: opts.status ? { status: opts.status as never } : {},
    orderBy: { updatedAt: 'desc' },
    include: placementInclude,
  })
}

/**
 * The cohort eligible to be placed: Form 4 students holding a placement-ready
 * (certified/results-received) MSCE ManebRecord for the given academic year.
 * NEVER keys off Student.status alone.
 */
export async function listPlacementEligibleStudents(academicYear: string) {
  const records = await prisma.manebRecord.findMany({
    where: { academicYear, examType: 'MSCE' },
    select: {
      id: true,
      studentId: true,
      status: true,
      examType: true,
      subjectGrades: true,
    },
  })

  const readyByStudent = new Map<string, (typeof records)[number]>()
  for (const r of records) {
    if (
      isManebRecordPlacementReady({
        examType: r.examType,
        status: r.status,
        subjectGrades: r.subjectGrades as Record<string, string> | null,
      })
    ) {
      readyByStudent.set(r.studentId, r)
    }
  }

  if (readyByStudent.size === 0) return []

  const students = await prisma.student.findMany({
    where: {
      id: { in: [...readyByStudent.keys()] },
      class: { form: 4 },
    },
    select: {
      id: true,
      registrationNo: true,
      firstName: true,
      lastName: true,
      class: { select: { form: true, academicYear: true } },
    },
  })

  return students.map((s) => ({
    studentId: s.id,
    registrationNo: s.registrationNo,
    firstName: s.firstName,
    lastName: s.lastName,
    manebRecordId: readyByStudent.get(s.id)!.id,
  }))
}

// ─────────────────────────────────────────────────────────
//  ELIGIBILITY GENERATION
// ─────────────────────────────────────────────────────────

/**
 * Generate (or refresh) eligibility for one student from their certified MSCE
 * record, upserting the UniversityPlacement keyed on that record. Returns the
 * placement plus the ranked recommendations. Throws 400 if the student has no
 * placement-ready MSCE record.
 */
export async function generateForStudent(
  studentId: string,
  academicYear: string,
  actorUid: string,
  actorRole: UserRole | string,
) {
  const record = await prisma.manebRecord.findFirst({
    where: { studentId, academicYear, examType: 'MSCE' },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, status: true, examType: true, subjectGrades: true },
  })

  if (
    !record ||
    !isManebRecordPlacementReady({
      examType: record.examType,
      status: record.status,
      subjectGrades: record.subjectGrades as Record<string, string> | null,
    })
  ) {
    throw httpError(
      'Student has no certified MSCE record — eligibility cannot be computed. (Form 2 / JCE records are never eligible for university placement.)',
      400,
    )
  }

  const grades = parseMsceGrades(record.subjectGrades as Record<string, string> | null)
  const recommendations = generateRecommendations(
    grades,
    getAllPrograms().map(({ university, program }) => ({
      universityId: university.id,
      universityName: university.name,
      program,
    })),
  )

  const now = new Date()
  // Only advance a not-yet-started placement to ELIGIBILITY_COMPUTED on refresh;
  // never regress one that already holds choices or an outcome. (New placements
  // are created straight into ELIGIBILITY_COMPUTED by the `create` branch.)
  const advanceExisting = await shouldAdvanceToComputed(record.id)
  const placement = await prisma.universityPlacement.upsert({
    where: { manebRecordId: record.id },
    create: {
      studentId,
      manebRecordId: record.id,
      status: 'ELIGIBILITY_COMPUTED',
      eligibilityComputedAt: now,
    },
    update: {
      eligibilityComputedAt: now,
      ...(advanceExisting ? { status: 'ELIGIBILITY_COMPUTED' as const } : {}),
    },
    include: placementInclude,
  })

  await auditService.log({
    action: 'placement.eligibility.generated',
    entityType: 'UniversityPlacement',
    entityId: placement.id,
    actorUid,
    actorRole,
    metadata: {
      context: {
        studentId,
        academicYear,
        eligibleCount: recommendations.filter((r) => r.eligible).length,
        totalConsidered: recommendations.length,
      },
    },
  })

  logger.info({ event: 'placement.generated', placementId: placement.id, studentId, actorUid })
  return { placement, recommendations }
}

/** Only advance to ELIGIBILITY_COMPUTED from NOT_STARTED — never clobber a
 *  placement that already holds recorded choices or an outcome. */
async function shouldAdvanceToComputed(manebRecordId: string): Promise<boolean> {
  const existing = await prisma.universityPlacement.findUnique({
    where: { manebRecordId },
    select: { status: true },
  })
  return !existing || existing.status === 'NOT_STARTED'
}

/**
 * Batch-generate eligibility for the whole Form 4 / certified-MSCE cohort of
 * an academic year. Returns per-student created/failed counts.
 */
export async function batchGenerate(
  academicYear: string,
  actorUid: string,
  actorRole: UserRole | string,
) {
  const cohort = await listPlacementEligibleStudents(academicYear)
  let generated = 0
  const errors: Array<{ studentId: string; error: string }> = []

  for (const member of cohort) {
    try {
      await generateForStudent(member.studentId, academicYear, actorUid, actorRole)
      generated += 1
    } catch (err) {
      errors.push({ studentId: member.studentId, error: err instanceof Error ? err.message : 'unknown error' })
    }
  }

  await auditService.log({
    action: 'placement.eligibility.batch_generated',
    entityType: 'UniversityPlacement',
    entityId: `cohort:${academicYear}`,
    actorUid,
    actorRole,
    metadata: { context: { academicYear, cohortSize: cohort.length, generated, failed: errors.length } },
  })

  logger.info({ event: 'placement.batch_generated', academicYear, generated, failed: errors.length, actorUid })
  return { cohortSize: cohort.length, generated, errors }
}

// ─────────────────────────────────────────────────────────
//  RECOMMENDATIONS (recompute for an existing placement, no write)
// ─────────────────────────────────────────────────────────

/** Recompute the ranked recommendations for an existing placement's MSCE
 *  record without mutating anything — used by the read endpoints to show a
 *  fresh recommendation list beside the stored placement. */
export async function getRecommendationsForPlacement(placementId: string) {
  const placement = await prisma.universityPlacement.findUnique({
    where: { id: placementId },
    select: { manebRecord: { select: { subjectGrades: true } } },
  })
  if (!placement) throw httpError('Placement not found.', 404)

  const grades = parseMsceGrades(placement.manebRecord.subjectGrades as Record<string, string> | null)
  return generateRecommendations(
    grades,
    getAllPrograms().map(({ university, program }) => ({
      universityId: university.id,
      universityName: university.name,
      program,
    })),
  )
}

// ─────────────────────────────────────────────────────────
//  CHOICES
// ─────────────────────────────────────────────────────────

/**
 * Replace a placement's ranked choices. Catalogue choices are validated
 * against the constants file and have their eligibility computed and stored;
 * free-text choices carry no computed eligibility.
 */
export async function setChoices(
  placementId: string,
  input: SetChoicesInput,
  actorUid: string,
  actorRole: UserRole | string,
) {
  const placement = await prisma.universityPlacement.findUnique({
    where: { id: placementId },
    select: { id: true, manebRecord: { select: { subjectGrades: true } } },
  })
  if (!placement) throw httpError('Placement not found.', 404)

  const grades = parseMsceGrades(placement.manebRecord.subjectGrades as Record<string, string> | null)

  // Validate every catalogue reference up-front, before any write.
  for (const choice of input.choices) {
    if (choice.universityId && choice.programmeId) {
      assertCataloguePairResolves(choice.universityId, choice.programmeId)
    }
  }

  const rows = input.choices.map((choice) => {
    if (choice.universityId && choice.programmeId) {
      const program = findProgram(choice.universityId, choice.programmeId)!
      const result = computeEligibility(grades, program)
      return {
        rank: choice.rank,
        universityId: choice.universityId,
        programmeId: choice.programmeId,
        universityNameFreeText: null,
        programmeNameFreeText: null,
        isEligible: result.eligible,
        score: result.score,
        missingSubjects: result.missingSubjects,
      }
    }
    return {
      rank: choice.rank,
      universityId: null,
      programmeId: null,
      universityNameFreeText: choice.universityNameFreeText ?? null,
      programmeNameFreeText: choice.programmeNameFreeText ?? null,
      isEligible: false,
      score: null,
      missingSubjects: [],
    }
  })

  // Decide the status transition before opening the transaction: recording
  // choices advances a fresh placement to CHOICES_RECORDED, but never regresses
  // one already PLACED/CONFIRMED/DECLINED/NOT_PLACED.
  const current = await prisma.universityPlacement.findUnique({
    where: { id: placementId },
    select: { status: true },
  })
  const advance =
    current !== null &&
    (current.status === 'NOT_STARTED' || current.status === 'ELIGIBILITY_COMPUTED')

  const updated = await prisma.$transaction(async (tx) => {
    await tx.placementChoice.deleteMany({ where: { placementId } })
    await tx.placementChoice.createMany({
      data: rows.map((r) => ({ ...r, placementId })),
    })
    return tx.universityPlacement.update({
      where: { id: placementId },
      data: advance ? { status: 'CHOICES_RECORDED' } : {},
      include: placementInclude,
    })
  })

  await auditService.log({
    action: 'placement.choices.set',
    entityType: 'UniversityPlacement',
    entityId: placementId,
    actorUid,
    actorRole,
    metadata: { context: { count: rows.length } },
  })

  logger.info({ event: 'placement.choices.set', placementId, count: rows.length, actorUid })
  return updated
}

// ─────────────────────────────────────────────────────────
//  OUTCOME (record / verify)
// ─────────────────────────────────────────────────────────

/**
 * Best-effort placement-outcome notification. Resolves the student's contact
 * details and the (catalogue or free-text) destination names, then fires the
 * placement-update email/push. Never throws into the caller — a notification
 * failure must not fail the outcome write (mirrors how other services treat
 * notificationService as fire-and-forget).
 */
async function notifyPlacementOutcome(placementId: string, statusLabel: string, verified: boolean): Promise<void> {
  try {
    const placement = await prisma.universityPlacement.findUnique({
      where: { id: placementId },
      select: {
        placedUniversityId: true,
        placedProgrammeId: true,
        placedUniversityName: true,
        placedProgrammeName: true,
        student: { select: { firstName: true, lastName: true, email: true, firebaseUid: true } },
      },
    })
    if (!placement || !placement.student.email) return

    const universityName =
      placement.placedUniversityName ??
      (placement.placedUniversityId ? findUniversity(placement.placedUniversityId)?.name : undefined)
    const programmeName =
      placement.placedProgrammeName ??
      (placement.placedUniversityId && placement.placedProgrammeId
        ? findProgram(placement.placedUniversityId, placement.placedProgrammeId)?.name
        : undefined)

    await notificationService.sendPlacementUpdate({
      to: placement.student.email,
      studentUid: placement.student.firebaseUid ?? undefined,
      data: {
        studentName: `${placement.student.firstName} ${placement.student.lastName}`,
        statusLabel,
        programmeName,
        universityName,
        verified,
      },
    })
  } catch (err) {
    logger.error({ err, placementId }, '[placementService] placement-update notification failed')
  }
}

/**
 * Record (or update) a placement outcome. When status names a destination
 * (everything but NOT_PLACED), exactly one of the catalogue pair / free-text
 * pair is persisted; catalogue ids are validated against the constants file.
 * Recording a new outcome always clears any prior verification.
 */
export async function recordOutcome(
  placementId: string,
  input: RecordOutcomeInput,
  actorUid: string,
  actorRole: UserRole | string,
) {
  const placement = await prisma.universityPlacement.findUnique({
    where: { id: placementId },
    select: { id: true },
  })
  if (!placement) throw httpError('Placement not found.', 404)

  const isCatalogue = Boolean(input.placedUniversityId && input.placedProgrammeId)
  if (isCatalogue) {
    assertCataloguePairResolves(input.placedUniversityId!, input.placedProgrammeId!)
  }

  const updated = await prisma.universityPlacement.update({
    where: { id: placementId },
    data: {
      status: input.status,
      placedUniversityId: input.status === 'NOT_PLACED' ? null : (isCatalogue ? input.placedUniversityId! : null),
      placedProgrammeId: input.status === 'NOT_PLACED' ? null : (isCatalogue ? input.placedProgrammeId! : null),
      placedUniversityName: input.status === 'NOT_PLACED' ? null : (isCatalogue ? null : input.placedUniversityName ?? null),
      placedProgrammeName: input.status === 'NOT_PLACED' ? null : (isCatalogue ? null : input.placedProgrammeName ?? null),
      notes: input.notes ?? null,
      recordedByUid: actorUid,
      // Recording a fresh outcome invalidates any prior verification.
      isVerified: false,
      verifiedByUid: null,
      verifiedAt: null,
    },
    include: placementInclude,
  })

  await auditService.log({
    action: 'placement.outcome.recorded',
    entityType: 'UniversityPlacement',
    entityId: placementId,
    actorUid,
    actorRole,
    metadata: {
      context: {
        status: input.status,
        catalogue: isCatalogue,
      },
    },
  })

  logger.info({ event: 'placement.outcome.recorded', placementId, status: input.status, actorUid })

  // A confirmed placement is the milestone worth notifying the student about.
  if (input.status === 'CONFIRMED') {
    await notifyPlacementOutcome(placementId, 'Confirmed', updated.isVerified)
  }

  return updated
}

/** High-rank verification (or un-verification) of a recorded outcome. */
export async function verifyOutcome(
  placementId: string,
  input: VerifyOutcomeInput,
  actorUid: string,
  actorRole: UserRole | string,
) {
  const placement = await prisma.universityPlacement.findUnique({
    where: { id: placementId },
    select: { id: true, status: true },
  })
  if (!placement) throw httpError('Placement not found.', 404)
  if (placement.status === 'NOT_STARTED' || placement.status === 'ELIGIBILITY_COMPUTED' || placement.status === 'CHOICES_RECORDED') {
    throw httpError('Cannot verify a placement that has no recorded outcome yet.', 400)
  }

  const updated = await prisma.universityPlacement.update({
    where: { id: placementId },
    data: {
      isVerified: input.isVerified,
      verifiedByUid: input.isVerified ? actorUid : null,
      verifiedAt: input.isVerified ? new Date() : null,
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
    include: placementInclude,
  })

  await auditService.log({
    action: input.isVerified ? 'placement.outcome.verified' : 'placement.outcome.unverified',
    entityType: 'UniversityPlacement',
    entityId: placementId,
    actorUid,
    actorRole,
    metadata: { context: { isVerified: input.isVerified } },
  })

  logger.info({ event: 'placement.outcome.verified', placementId, isVerified: input.isVerified, actorUid })

  // Notify the student when the school verifies their placement.
  if (input.isVerified) {
    await notifyPlacementOutcome(placementId, 'Verified', true)
  }

  return updated
}

// ─────────────────────────────────────────────────────────
//  CATALOGUE (read-only exposure for the UI's programme pickers)
// ─────────────────────────────────────────────────────────

/** The full catalogue, for the UI's university/programme selectors. */
export function getCatalogue() {
  return UNIVERSITIES
}
