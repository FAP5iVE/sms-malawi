/**
 * [CHANGE TYPE]: TARGETED EDIT (output in full — the edit touches most of
 *   the file's exported functions)
 * [FILE]: apps/web/src/server/services/applicationService.ts
 * [R-PHASE]: R5 — Academics I: Admissions & Student Records; R15 — UI/UX
 *   Polish paginates listApplications() (count + skip/take envelope —
 *   previously one unbounded findMany).
 * [PURPOSE]:
 *   1. Both createApplication() (internal) and createPublicApplication()
 *      (unauthenticated /apply page) now consume the single unified
 *      ApplicationInput (@shared/schemas/student) instead of the two
 *      independently-diverged CreateApplicationInput/PublicApplicationInput
 *      shapes. The Prisma create-data mapping is factored into one shared
 *      buildApplicationCreateData() so the two callers never duplicate it.
 *   2. The parseInt(classApplying.replace('Form ','')) string-bridging
 *      logic is replaced with a direct, type-safe lookup table
 *      (FORM_LEVEL_BY_CLASS_APPLYING) derived from the schema's own enum —
 *      no string parsing required.
 *   3. All nine dead `as PublicApplicationInput & {...}` inline casts are
 *      removed — every field the service needs is now a real, typed
 *      property on the unified schema, so no cast was ever necessary.
 *   4. The countryCode/guardianCountryCode re-concatenation branch is
 *      removed — `data.phone`/`data.guardianPhone` already carry the
 *      client-assembled, fully-formatted number; re-prepending countryCode
 *      here was double-concatenating it (a real, confirmed bug, not just
 *      dead code).
 *   5. Duplicate-application detection now also matches on guardian phone
 *      or guardian email as a secondary signal, OR'd alongside the existing
 *      firstName+lastName+dateOfBirth check.
 *   6. Application-confirmation emails (applicant + guardian) now render
 *      through server/templates/emails/application-received.ts via the
 *      shared sendEmail() singleton, instead of inline raw-HTML template
 *      strings.
 *   7. updateApplicationStatus() gains actorRole (needed for audit
 *      attribution) and a real auditService.log() call — 'application.
 *      approved'/'application.denied' are both rated HIGH severity in
 *      auditService's own ACTION_SEVERITY map, but this function previously
 *      never wrote to the audit trail at all.
 *   8. convertToStudent() is removed entirely. Its one caller
 *      (applications.ts's POST /:id/convert admit handler) is repointed at
 *      studentService.createFromApplication() instead — the richer,
 *      audit-logged, optional-Firebase-account implementation that already
 *      existed behind POST /students/from-application/:applicationId with
 *      zero frontend caller. Consolidating onto one conversion path removes
 *      the two-parallel-implementations redundancy the audit flagged.
 * [DEPENDS ON]: @shared/schemas/student (unified ApplicationSchema),
 *   apps/web/src/server/services/notificationService.ts (exported
 *   getSchoolBranding), apps/web/src/server/templates/emails/
 *   application-received.ts
 */
import { prisma }            from '@/lib/prisma'
import { sendEmail }         from '@/lib/email'
import { logger }            from '@/lib/logger'
import * as auditService     from '@/server/services/auditService'
import { getSchoolBranding } from '@/server/services/notificationService'
import { renderApplicationReceived } from '@/server/templates/emails/application-received'
import type { ApplicationInput } from '@shared/schemas/student'
import { ApplicationStatus }     from '@prisma/client'
import type { UserRole }         from '@shared/types/roles'

// ─────────────────────────────────────────────────────────
//  FORM-LEVEL LOOKUP
//  classApplying is a strictly-typed Zod enum ('Form 1'..'Form 4') — a
//  direct lookup table is the correct, type-safe mapping to the Prisma
//  Application.applyingForForm Int field, not string parsing.
// ─────────────────────────────────────────────────────────

const FORM_LEVEL_BY_CLASS_APPLYING: Record<ApplicationInput['classApplying'], number> = {
  'Form 1': 1,
  'Form 2': 2,
  'Form 3': 3,
  'Form 4': 4,
}

// ─────────────────────────────────────────────────────────
//  SHARED CREATE-DATA MAPPING
//  Used by both createApplication() (internal) and
//  createPublicApplication() (unauthenticated /apply page) — the two
//  previously duplicated this mapping independently, with independently
//  divergent field-name bugs.
// ─────────────────────────────────────────────────────────

function buildApplicationCreateData(data: ApplicationInput) {
  return {
    firstName:         data.firstName,
    lastName:          data.surname,
    otherNames:        data.otherNames ?? null,
    dateOfBirth:       new Date(data.dateOfBirth),
    sex:               data.sex,
    nationality:       data.nationality,
    district:          data.district ?? '',
    village:           data.village ?? null,
    email:             data.email || null,
    phone:             data.phone,
    address:           data.address ?? null,
    previousSchool:    data.previousSchool ?? null,
    reasonForTransfer: data.reasonForTransfer ?? null,
    academicYear:      data.academicYear ?? null,
    guardianName:      data.guardianName,
    guardianPhone:     data.guardianPhone,
    guardianRelation:  data.guardianRelationship,
    guardianEmail:     data.guardianEmail || null,
    guardianAddress:   data.guardianAddress ?? null,
    applyingForForm:   FORM_LEVEL_BY_CLASS_APPLYING[data.classApplying],
    status:            'PENDING' as const,
  }
}

// ─────────────────────────────────────────────────────────
//  LIST
// ─────────────────────────────────────────────────────────

/** Server-enforced page-size bounds for the applications list (R15). */
const APPLICATIONS_DEFAULT_PAGE_SIZE = 20
const APPLICATIONS_MAX_PAGE_SIZE     = 100

/**
 * R15 — real pagination. Previously returned every application matching
 * the status filter in one unbounded findMany; years of accumulated
 * applications would arrive in a single response. Returns the same
 * paginated envelope shape the students list already uses:
 * { applications, total, page, pages }.
 */
export async function listApplications(
  status?: string,
  page = 1,
  pageSize = APPLICATIONS_DEFAULT_PAGE_SIZE,
) {
  const safePageSize = Number.isFinite(pageSize)
    ? Math.min(Math.max(pageSize, 1), APPLICATIONS_MAX_PAGE_SIZE)
    : APPLICATIONS_DEFAULT_PAGE_SIZE
  const safePage = Number.isFinite(page) ? Math.max(page, 1) : 1

  // Cast to ApplicationStatus enum directly — NOT WhereInput['status']
  // because that indexed type includes undefined which violates exactOptionalPropertyTypes
  const where = status ? { status: status as ApplicationStatus } : {}

  const [total, applications] = await prisma.$transaction([
    prisma.application.count({ where }),
    prisma.application.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:    (safePage - 1) * safePageSize,
      take:    safePageSize,
    }),
  ])

  return {
    applications,
    total,
    page:  safePage,
    pages: Math.max(Math.ceil(total / safePageSize), 1),
  }
}

// ─────────────────────────────────────────────────────────
//  PUBLIC (unauthenticated) APPLICATION — from the /apply page
// ─────────────────────────────────────────────────────────

export async function createPublicApplication(data: ApplicationInput) {
  // ── Duplicate detection ──────────────────────────────────────────────────
  // Block re-submission if a non-denied application already exists matching
  // either (a) the same first name + surname + date of birth combination, or
  // (b) the same guardian phone, or (c) the same guardian email — any one of
  // these is treated as a strong enough signal of a duplicate submission.
  const existing = await prisma.application.findFirst({
    where: {
      status: { not: 'DENIED' },
      OR: [
        {
          firstName:   { equals: data.firstName, mode: 'insensitive' },
          lastName:    { equals: data.surname,   mode: 'insensitive' },
          dateOfBirth: new Date(data.dateOfBirth),
        },
        { guardianPhone: data.guardianPhone },
        ...(data.guardianEmail ? [{ guardianEmail: data.guardianEmail }] : []),
      ],
    },
    select: { id: true, status: true },
  })

  if (existing) {
    const err = Object.assign(
      new Error('DUPLICATE_APPLICATION'),
      { code: 'DUPLICATE_APPLICATION', status: existing.status }
    )
    throw err
  }

  // ── Create record ────────────────────────────────────────────────────────
  const application = await prisma.application.create({
    data: buildApplicationCreateData(data),
  })

  // ── Confirmation emails (fire-and-forget) — rendered via the shared
  // application-received template, not inline HTML strings.
  const school = await getSchoolBranding()

  if (data.email) {
    void sendEmail({
      to:      data.email,
      ...renderApplicationReceived(
        {
          recipient:     'applicant',
          applicantName: `${data.firstName} ${data.surname}`,
          guardianName:  data.guardianName,
          classApplying: data.classApplying,
          applicationId: application.id,
          submittedAt:   application.createdAt,
        },
        school
      ),
    }).catch((err) => logger.error({ err, applicationId: application.id }, '[applicationService] Applicant confirmation email failed'))
  }

  if (data.guardianEmail && data.guardianEmail !== data.email) {
    void sendEmail({
      to:      data.guardianEmail,
      ...renderApplicationReceived(
        {
          recipient:     'guardian',
          applicantName: `${data.firstName} ${data.surname}`,
          guardianName:  data.guardianName,
          classApplying: data.classApplying,
          applicationId: application.id,
          submittedAt:   application.createdAt,
        },
        school
      ),
    }).catch((err) => logger.error({ err, applicationId: application.id }, '[applicationService] Guardian confirmation email failed'))
  }

  return application
}

// ─────────────────────────────────────────────────────────
//  INTERNAL (staff-entered) APPLICATION
// ─────────────────────────────────────────────────────────

export async function createApplication(data: ApplicationInput) {
  return prisma.application.create({
    data: buildApplicationCreateData(data),
  })
}

// ─────────────────────────────────────────────────────────
//  STATUS UPDATE — approve / deny / mark awaiting admission
// ─────────────────────────────────────────────────────────

export async function updateApplicationStatus(
  id:        string,
  status:    'APPROVED' | 'DENIED' | 'AWAITING_ADMISSION',
  actorUid:  string,
  actorRole: UserRole,
  notes?:    string
) {
  const before = await prisma.application.findUniqueOrThrow({
    where:  { id },
    select: { status: true },
  })

  const updated = await prisma.application.update({
    where: { id },
    data: {
      status,
      reviewedByUid: actorUid,
      reviewedAt:    new Date(),
      notes:         notes ?? null,
    },
  })

  await auditService.log({
    action:     status === 'DENIED' ? 'application.denied' : status === 'APPROVED' ? 'application.approved' : 'application.reviewed',
    entityType: 'Application',
    entityId:   id,
    actorUid,
    actorRole,
    metadata: {
      before: { status: before.status },
      after:  { status },
      context: notes ? { notes } : undefined,
    },
  })

  return updated
}
