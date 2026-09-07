/**
 * apps/web/src/server/services/placementService.ts
 *
 * [CHANGE TYPE]: TARGETED EDIT (OVERHAUL)
 * [R-PHASE]: R18 — University Placement Module, redesigned against the
 *   "Malawi Higher Education Placement & Advisory" reference module.
 * [PURPOSE]: The placement domain's data/orchestration layer. Owns every
 *   UniversityPlacement read and write, delegates all eligibility maths to
 *   the pure placementMatchingService, and validates every catalogue
 *   reference against @shared/constants/universities before it is
 *   persisted. Every mutation writes an auditService.log entry.
 *
 *   [OVERHAUL] The old ranked-choices pipeline (PlacementChoice,
 *   generateForStudent/batchGenerate/setChoices, the NOT_STARTED →
 *   ELIGIBILITY_COMPUTED → CHOICES_RECORDED → PLACED state machine) is gone
 *   — the reference module doesn't have that workflow at all. It is
 *   replaced by a much simpler three-status model:
 *     - recordStaffPlacement — staff cross-reference the official NCHE
 *       gazette against a graduating candidate and record an immediately
 *       CONFIRMED placement (entrySource STAFF_OFFICIAL). Upserted by
 *       manebRecordId, so re-submitting the same candidate edits their entry.
 *     - submitClaim           — a GRADUATED student self-reports their own
 *       selection (entrySource STUDENT_CLAIM); always lands PENDING_APPROVAL.
 *     - approveClaim/rejectClaim — a staff member with placement.verifyOutcome
 *       confirms or rejects a pending claim.
 *   Every record is still keyed 1:1 on a certified MSCE ManebRecord
 *   (manebRecordId, unique) via isManebRecordPlacementReady — the exam-module
 *   integration is unchanged.
 *
 *   CATALOGUE-VS-FREE-TEXT INVARIANT (unchanged). For any recorded
 *   destination, exactly one of {catalogue id pair, free-text name pair} is
 *   populated. The Zod schema enforces the shape; this service additionally
 *   verifies that catalogue ids actually resolve in the constants file.
 * [DEPENDS ON]: @/lib/prisma, @/lib/logger, @/server/services/auditService,
 *   @/server/services/notificationService,
 *   @/server/services/placementMatchingService,
 *   @/server/services/studentService, @shared/constants/universities,
 *   @shared/schemas/placement
 */
import 'server-only'

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import * as auditService from '@/server/services/auditService'
import * as notificationService from '@/server/services/notificationService'
import { resolveStudentFromUid } from '@/server/services/studentService'
import {
  isManebRecordPlacementReady,
  computeEligibility,
  generateRecommendations,
  parseMsceGrades,
} from '@/server/services/placementMatchingService'
import type { ProgramRecommendation } from '@/server/services/placementMatchingService'
import {
  UNIVERSITIES,
  findUniversity,
  findProgram,
  getAllPrograms,
} from '@shared/constants/universities'
import type {
  StaffPlacementEntryInput,
  StudentClaimInput,
  RejectClaimInput,
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
//  SHARED READ HELPERS
// ─────────────────────────────────────────────────────────

const placementStudentSelect = {
  id:             true,
  firstName:      true,
  lastName:       true,
  otherNames:     true,
  registrationNo: true,
  sex:            true,
} as const

const placementInclude = {
  student: { select: placementStudentSelect },
  manebRecord: { select: { candidateNo: true, aggregatePoints: true } },
} as const

type RawPlacement = Prisma.UniversityPlacementGetPayload<{ include: typeof placementInclude }>

/**
 * Batch-resolve a set of Firebase UIDs (recordedByUid / verifiedByUid) to
 * human-readable "First Last" names via StaffProfile, so the UI never has to
 * show a raw Firebase UID for a "recorded/verified by" line. Unknown or null
 * uids are simply absent from the returned map — callers fall back to null.
 */
async function resolveStaffNames(uids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const unique = [...new Set(uids.filter((u): u is string => Boolean(u)))]
  if (unique.length === 0) return new Map()
  const staff = await prisma.staffProfile.findMany({
    where:  { uid: { in: unique } },
    select: { uid: true, firstName: true, lastName: true },
  })
  return new Map(staff.map((s) => [s.uid, `${s.firstName} ${s.lastName}`]))
}

/** Flattens the manebRecord include into `student.candidateNo`/`aggregatePoints`
 *  and resolves recordedByName/verifiedByName — the shape every route returns. */
function mapPlacementRecord(raw: RawPlacement, staffNames: Map<string, string>) {
  const { manebRecord, ...rest } = raw
  return {
    ...rest,
    student: {
      ...rest.student,
      candidateNo:     manebRecord?.candidateNo,
      aggregatePoints: manebRecord?.aggregatePoints ?? null,
    },
    recordedByName: rest.recordedByUid ? staffNames.get(rest.recordedByUid) ?? null : null,
    verifiedByName: rest.verifiedByUid ? staffNames.get(rest.verifiedByUid) ?? null : null,
  }
}

async function mapPlacementRecords(raws: RawPlacement[]) {
  const staffNames = await resolveStaffNames(raws.flatMap((r) => [r.recordedByUid, r.verifiedByUid]))
  return raws.map((r) => mapPlacementRecord(r, staffNames))
}

/**
 * The student's most recent certified/results-received MSCE record, or null.
 * NEVER keys off Student.status alone — that is a coarse lifecycle flag, not
 * proof of a certificate.
 */
async function findCertifiedMsceRecord(studentId: string) {
  const records = await prisma.manebRecord.findMany({
    where:  { studentId, examType: 'MSCE' },
    select: { id: true, status: true, examType: true, subjectGrades: true, academicYear: true },
    orderBy: { academicYear: 'desc' },
  })
  return (
    records.find((r) =>
      isManebRecordPlacementReady({
        examType: r.examType,
        status: r.status,
        subjectGrades: r.subjectGrades as Record<string, string> | null,
      }),
    ) ?? null
  )
}

// ─────────────────────────────────────────────────────────
//  STUDENT SELF-SERVICE (/me)
// ─────────────────────────────────────────────────────────

/**
 * The signed-in student's own claim/placement, plus whether the Student
 * Claim Portal tab should even be shown to them (isGraduated) and whether
 * they have a certified MSCE record yet (hasCertifiedMsce).
 */
export async function getMyPlacement(firebaseUid: string) {
  const student = await resolveStudentFromUid(firebaseUid)
  if (!student) throw httpError('No student record is linked to this account.', 403)

  const raw = await prisma.universityPlacement.findFirst({
    where:   { studentId: student.id },
    orderBy: { createdAt: 'desc' },
    include: placementInclude,
  })
  const certified = await findCertifiedMsceRecord(student.id)

  return {
    record: raw ? mapPlacementRecord(raw, await resolveStaffNames([raw.recordedByUid, raw.verifiedByUid])) : null,
    isGraduated:      student.status === 'GRADUATED',
    hasCertifiedMsce: certified !== null,
  }
}

/**
 * A graduated student self-reports that they were selected. Always lands as
 * PENDING_APPROVAL — never auto-confirmed. Gated on Student.status ===
 * 'GRADUATED' and a certified MSCE record existing; refuses to overwrite an
 * already-CONFIRMED placement (that requires a staff correction instead).
 */
export async function submitClaim(firebaseUid: string, input: StudentClaimInput) {
  const student = await resolveStudentFromUid(firebaseUid)
  if (!student) throw httpError('No student record is linked to this account.', 403)
  if (student.status !== 'GRADUATED') {
    throw httpError('The placement claim portal is only available to graduated students.', 403)
  }

  const manebRecord = await findCertifiedMsceRecord(student.id)
  if (!manebRecord) {
    throw httpError('No certified MSCE record was found for your account yet.', 400)
  }

  const existing = await prisma.universityPlacement.findUnique({
    where:  { manebRecordId: manebRecord.id },
    select: { status: true },
  })
  if (existing?.status === 'CONFIRMED') {
    throw httpError('You already have a confirmed placement on file. Contact the admissions office to correct it.', 400)
  }

  const isCatalogue = Boolean(input.placedUniversityId && input.placedProgrammeId)
  if (isCatalogue) assertCataloguePairResolves(input.placedUniversityId!, input.placedProgrammeId!)

  const data = {
    studentId:            student.id,
    manebRecordId:        manebRecord.id,
    status:               'PENDING_APPROVAL' as const,
    entrySource:          'STUDENT_CLAIM' as const,
    admissionYear:        input.admissionYear,
    placedUniversityId:   isCatalogue ? input.placedUniversityId! : null,
    placedProgrammeId:    isCatalogue ? input.placedProgrammeId! : null,
    placedUniversityName: isCatalogue ? null : input.placedUniversityName ?? null,
    placedProgrammeName:  isCatalogue ? null : input.placedProgrammeName ?? null,
    ncheBatchRef:         input.ncheBatchRef,
    claimProofNote:       input.claimProofNote ?? null,
    recordedByUid:        firebaseUid,
    verifiedByUid:        null,
    verifiedAt:           null,
    rejectionReason:      null,
  }

  const updated = await prisma.universityPlacement.upsert({
    where:   { manebRecordId: manebRecord.id },
    create:  data,
    update:  data,
    include: placementInclude,
  })

  await auditService.log({
    action:     'placement.claim.submitted',
    entityType: 'UniversityPlacement',
    entityId:   updated.id,
    actorUid:   firebaseUid,
    actorRole:  'student',
    metadata:   { context: { admissionYear: input.admissionYear, catalogue: isCatalogue } },
  })
  logger.info({ event: 'placement.claim.submitted', placementId: updated.id, studentId: student.id })

  return mapPlacementRecord(updated, await resolveStaffNames([updated.recordedByUid, updated.verifiedByUid]))
}

// ─────────────────────────────────────────────────────────
//  STAFF PLACEMENT ENTRY
// ─────────────────────────────────────────────────────────

/**
 * The graduating cohort available to be given an official placement: Form 4
 * students holding a placement-ready (certified/results-received) MSCE
 * ManebRecord for the given academic year, each annotated with their
 * existing placement status (if any) so the Staff Entry picker can flag
 * "already placed" candidates.
 */
export async function listGraduatingCohort(academicYear: string) {
  const records = await prisma.manebRecord.findMany({
    where:  { academicYear, examType: 'MSCE' },
    select: { id: true, studentId: true, status: true, examType: true, subjectGrades: true, candidateNo: true, aggregatePoints: true },
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
      id:    { in: [...readyByStudent.keys()] },
      class: { form: 4 },
    },
    select: { id: true, registrationNo: true, firstName: true, lastName: true, sex: true },
  })

  const manebRecordIds = [...readyByStudent.values()].map((r) => r.id)
  const existingPlacements = await prisma.universityPlacement.findMany({
    where:  { manebRecordId: { in: manebRecordIds } },
    select: { manebRecordId: true, status: true },
  })
  const statusByRecord = new Map(existingPlacements.map((p) => [p.manebRecordId, p.status as string]))

  return students.map((s) => {
    const rec = readyByStudent.get(s.id)!
    return {
      studentId:       s.id,
      registrationNo:  s.registrationNo,
      firstName:       s.firstName,
      lastName:        s.lastName,
      sex:             s.sex,
      manebRecordId:   rec.id,
      candidateNo:     rec.candidateNo,
      aggregatePoints: rec.aggregatePoints ?? null,
      subjectGrades:   parseMsceGrades(rec.subjectGrades as Record<string, string> | null),
      existingStatus:  statusByRecord.get(rec.id) ?? null,
    }
  })
}

/**
 * Staff record (or edit) an official, immediately CONFIRMED placement for a
 * graduating candidate, resolved from a certified MSCE record. Trusted
 * staff data-entry is authoritative and appears immediately — the same
 * treatment a MANEB import gets. Upserted by manebRecordId, so calling this
 * again for the same candidate edits their existing entry (e.g. correcting
 * a typo'd programme).
 */
export async function recordStaffPlacement(
  input: StaffPlacementEntryInput,
  actorUid: string,
  actorRole: UserRole | string,
) {
  const manebRecord = await prisma.manebRecord.findUnique({
    where:  { id: input.manebRecordId },
    select: { id: true, studentId: true, status: true, examType: true, subjectGrades: true },
  })
  if (!manebRecord) throw httpError('MSCE record not found.', 404)
  if (
    !isManebRecordPlacementReady({
      examType: manebRecord.examType,
      status: manebRecord.status,
      subjectGrades: manebRecord.subjectGrades as Record<string, string> | null,
    })
  ) {
    throw httpError('This candidate does not yet have a certified MSCE record.', 400)
  }

  const isCatalogue = Boolean(input.placedUniversityId && input.placedProgrammeId)
  if (isCatalogue) assertCataloguePairResolves(input.placedUniversityId!, input.placedProgrammeId!)

  const data = {
    studentId:            manebRecord.studentId,
    manebRecordId:        manebRecord.id,
    status:               'CONFIRMED' as const,
    entrySource:          'STAFF_OFFICIAL' as const,
    admissionYear:        input.admissionYear,
    placedUniversityId:   isCatalogue ? input.placedUniversityId! : null,
    placedProgrammeId:    isCatalogue ? input.placedProgrammeId! : null,
    placedUniversityName: isCatalogue ? null : input.placedUniversityName ?? null,
    placedProgrammeName:  isCatalogue ? null : input.placedProgrammeName ?? null,
    ncheBatchRef:         input.ncheBatchRef,
    notes:                input.notes ?? null,
    recordedByUid:        actorUid,
    verifiedByUid:        actorUid,
    verifiedAt:           new Date(),
    rejectionReason:      null,
    claimProofNote:       null,
  }

  const updated = await prisma.universityPlacement.upsert({
    where:   { manebRecordId: manebRecord.id },
    create:  data,
    update:  data,
    include: placementInclude,
  })

  await auditService.log({
    action:     'placement.staffEntry.recorded',
    entityType: 'UniversityPlacement',
    entityId:   updated.id,
    actorUid,
    actorRole,
    metadata:   { context: { catalogue: isCatalogue, admissionYear: input.admissionYear } },
  })
  logger.info({ event: 'placement.staffEntry.recorded', placementId: updated.id, actorUid })

  await notifyPlacementOutcome(updated.id, 'Confirmed')
  return mapPlacementRecord(updated, await resolveStaffNames([updated.recordedByUid, updated.verifiedByUid]))
}

// ─────────────────────────────────────────────────────────
//  REGISTRY & CLAIMS QUEUE (reads)
// ─────────────────────────────────────────────────────────

/** The Registry & Analytics tab: CONFIRMED placements only, open to everyone. */
export async function listConfirmedPlacements(opts: { academicYear?: string } = {}) {
  const raws = await prisma.universityPlacement.findMany({
    where: {
      status: 'CONFIRMED',
      ...(opts.academicYear ? { manebRecord: { academicYear: opts.academicYear } } : {}),
    },
    include: placementInclude,
    orderBy: [{ placedUniversityId: 'asc' }, { student: { lastName: 'asc' } }],
  })
  return mapPlacementRecords(raws)
}

/** The Claims Verification Desk: pending claims, plus a verification history
 *  of claims already acted on (approved-via-claim or rejected) — a
 *  staff-official entry is never a "claim" so it never appears here even
 *  though it's also CONFIRMED; only entrySource STUDENT_CLAIM history shows. */
export async function listClaimsQueue(opts: { academicYear?: string } = {}) {
  const yearFilter = opts.academicYear ? { manebRecord: { academicYear: opts.academicYear } } : {}
  const raws = await prisma.universityPlacement.findMany({
    where: {
      ...yearFilter,
      OR: [
        { status: { in: ['PENDING_APPROVAL', 'REJECTED'] } },
        { status: 'CONFIRMED', entrySource: 'STUDENT_CLAIM' },
      ],
    },
    include: placementInclude,
    orderBy: { createdAt: 'desc' },
  })
  return mapPlacementRecords(raws)
}

// ─────────────────────────────────────────────────────────
//  CLAIMS VERIFICATION DESK
// ─────────────────────────────────────────────────────────

export async function approveClaim(id: string, actorUid: string, actorRole: UserRole | string) {
  const placement = await prisma.universityPlacement.findUnique({ where: { id }, select: { id: true, status: true } })
  if (!placement) throw httpError('Placement claim not found.', 404)
  if (placement.status === 'CONFIRMED') throw httpError('This claim has already been confirmed.', 400)

  const updated = await prisma.universityPlacement.update({
    where:   { id },
    data:    { status: 'CONFIRMED', verifiedByUid: actorUid, verifiedAt: new Date(), rejectionReason: null },
    include: placementInclude,
  })

  await auditService.log({
    action: 'placement.claim.approved', entityType: 'UniversityPlacement', entityId: id, actorUid, actorRole,
  })
  logger.info({ event: 'placement.claim.approved', placementId: id, actorUid })

  await notifyPlacementOutcome(id, 'Confirmed')
  return mapPlacementRecord(updated, await resolveStaffNames([updated.recordedByUid, updated.verifiedByUid]))
}

export async function rejectClaim(
  id: string,
  input: RejectClaimInput,
  actorUid: string,
  actorRole: UserRole | string,
) {
  const placement = await prisma.universityPlacement.findUnique({ where: { id }, select: { id: true, status: true } })
  if (!placement) throw httpError('Placement claim not found.', 404)
  if (placement.status === 'CONFIRMED') {
    throw httpError('A confirmed placement cannot be rejected here — record a fresh staff entry instead.', 400)
  }

  const updated = await prisma.universityPlacement.update({
    where:   { id },
    data:    { status: 'REJECTED', rejectionReason: input.reason, verifiedByUid: actorUid, verifiedAt: new Date() },
    include: placementInclude,
  })

  await auditService.log({
    action:     'placement.claim.rejected',
    entityType: 'UniversityPlacement',
    entityId:   id,
    actorUid,
    actorRole,
    metadata:   { context: { reason: input.reason } },
  })
  logger.info({ event: 'placement.claim.rejected', placementId: id, actorUid })

  await notifyPlacementOutcome(id, 'Rejected', input.reason)
  return mapPlacementRecord(updated, await resolveStaffNames([updated.recordedByUid, updated.verifiedByUid]))
}

// ─────────────────────────────────────────────────────────
//  NOTIFICATIONS
// ─────────────────────────────────────────────────────────

async function notifyPlacementOutcome(
  placementId: string,
  statusLabel: 'Confirmed' | 'Rejected',
  rejectionReason?: string,
): Promise<void> {
  try {
    const placement = await prisma.universityPlacement.findUnique({
      where:  { id: placementId },
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
        verified: statusLabel === 'Confirmed',
        rejectionReason,
      },
    })
  } catch (err) {
    logger.error({ err, placementId }, '[placementService] placement-update notification failed')
  }
}

// ─────────────────────────────────────────────────────────
//  PUBLIC LISTING (unauthenticated)
// ─────────────────────────────────────────────────────────

// This IS public information (NCHE selection results are published), so it
// deliberately carries NO auth. Only CONFIRMED placements are returned —
// never a pending student self-claim, and never a rejected one. Field set is
// minimal (name + where + what programme), no exam grades, no internal ids.
export async function listPublicPlacements(opts: { academicYear?: string } = {}) {
  const rows = await prisma.universityPlacement.findMany({
    where: {
      status: 'CONFIRMED',
      ...(opts.academicYear ? { manebRecord: { academicYear: opts.academicYear } } : {}),
    },
    select: {
      status: true,
      placedUniversityId: true,
      placedProgrammeId: true,
      placedUniversityName: true,
      placedProgrammeName: true,
      student: { select: { firstName: true, lastName: true, otherNames: true, registrationNo: true } },
      manebRecord: { select: { academicYear: true } },
    },
    orderBy: [{ placedUniversityId: 'asc' }, { student: { lastName: 'asc' } }],
  })

  return rows.map((r) => {
    const catalogueUni = r.placedUniversityId ? findUniversity(r.placedUniversityId) : undefined
    const catalogueProg = r.placedUniversityId && r.placedProgrammeId
      ? findProgram(r.placedUniversityId, r.placedProgrammeId) : undefined
    return {
      studentName:    `${r.student.firstName} ${r.student.otherNames ? r.student.otherNames + ' ' : ''}${r.student.lastName}`,
      registrationNo: r.student.registrationNo,
      university:     catalogueUni?.name ?? r.placedUniversityName ?? '\u2014',
      programme:      catalogueProg?.name ?? r.placedProgrammeName ?? '\u2014',
      status:         r.status,
      academicYear:   r.manebRecord.academicYear,
    }
  })
}

// ─────────────────────────────────────────────────────────
//  CATALOGUE (read-only exposure for the UI's programme pickers)
// ─────────────────────────────────────────────────────────

/** The full catalogue, for the UI's university/programme selectors. */
export function getCatalogue() {
  return UNIVERSITIES
}

// ─────────────────────────────────────────────────────────
//  ADVISORY QUALIFICATION CHECKER (all roles, pure calculator)
// ─────────────────────────────────────────────────────────
// Anyone — a graduate checking their own options, or a staff member helping
// a student who's asking in person — types a set of MSCE grades and gets the
// programmes that qualify. It never reads internal exam marks or any
// student's real ManebRecord; the engine only ever sees the numbers passed
// in here, which is what makes this "ignore internal exams, use MSCE" by
// construction rather than a rule that has to be remembered elsewhere. Not
// gated by any placement record or status — it's a standalone calculator.
export interface AdvisoryResponse {
  top:          ProgramRecommendation[]
  chosen?:      (ProgramRecommendation & { rank: number })[]
  subjectsUsed: number
}

export function advise(
  grades: Record<string, number>,
  chosen?: { universityId: string; programmeId: string }[],
  limit = 10,
): AdvisoryResponse {
  const programs = getAllPrograms().map(({ university, program }) => ({
    universityId:   university.id,
    universityName: university.name,
    program,
  }))
  const top = generateRecommendations(grades, programs).slice(0, limit)

  let chosenResults: (ProgramRecommendation & { rank: number })[] | undefined
  if (chosen && chosen.length > 0) {
    chosenResults = chosen.map((ref, i) => {
      const program = findProgram(ref.universityId, ref.programmeId)
      const university = findUniversity(ref.universityId)
      if (!program || !university) {
        return {
          universityId: ref.universityId, universityName: '\u2014',
          programmeId: ref.programmeId, programmeName: 'Unknown programme',
          faculty: null, durationYears: null, cutOffPoints: null, minimumRequirements: [],
          eligible: false, meetsCutOff: null,
          missingSubjects: ['Programme not found in the catalogue'],
          prerequisiteAudit: [], aggregate: 0, score: 0, rank: i + 1,
        }
      }
      const r = computeEligibility(grades, program)
      return {
        universityId: university.id, universityName: university.name,
        programmeId: program.id, programmeName: program.name,
        faculty: program.faculty ?? null,
        durationYears: program.durationYears ?? null,
        cutOffPoints: program.cutOffPoints ?? null,
        minimumRequirements: program.minimumRequirements ?? [],
        eligible: r.eligible, meetsCutOff: r.meetsCutOff,
        missingSubjects: r.missingSubjects,
        prerequisiteAudit: r.prerequisiteAudit,
        aggregate: r.aggregate,
        score: r.score, rank: i + 1,
      }
    })
  }

  return { top, chosen: chosenResults, subjectsUsed: Object.keys(grades).length }
}
